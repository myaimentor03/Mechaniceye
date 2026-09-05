import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SMOKE_SCRIPT = path.join(__dirname, "..", "scripts", "production-smoke.mjs");

function runSmoke(baseUrl, env = {}) {
  return new Promise((resolve) => {
    const child = execFile("node", [SMOKE_SCRIPT], {
      env: { ...process.env, BASE_URL: baseUrl, ...env },
      timeout: 30000,
    }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? error.code ?? 1 : 0,
        stdout,
        stderr,
      });
    });
  });
}

function startMockServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

// ─── Mock handlers ──────────────────────────────────────────────────

function fullMockHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS check
  const origin = req.headers.origin;
  if (origin === "http://127.0.0.1:5173") {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // Health endpoints
  if (url.pathname === "/api/health/live") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === "/api/health/readiness") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ready: true, checkedAt: new Date().toISOString(), checks: [] }));
    return;
  }
  if (url.pathname === "/api/health/db") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Capabilities
  if (url.pathname === "/api/capabilities") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ photoUpload: false, audioUpload: false, videoUpload: false, vibrationSensorCapture: false }));
    return;
  }

  // Subscription tiers
  if (url.pathname === "/api/subscription/tiers") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify([{ name: "basic" }, { name: "premium" }]));
    return;
  }

  // Mechanics
  if (url.pathname === "/api/mechanics") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify([]));
    return;
  }

  // Unknown API routes → 404
  if (url.pathname.startsWith("/api/")) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  // Homepage
  if (url.pathname === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!DOCTYPE html><html><body>Home</body></html>");
    return;
  }

  // SPA routes → HTML
  const acceptsHtml = (req.headers.accept || "").includes("text/html");
  if (acceptsHtml && !path.extname(url.pathname)) {
    res.setHeader("Content-Type", "text/html");
    res.end("<!DOCTYPE html><html><body>SPA</body></html>");
    return;
  }

  res.statusCode = 404;
  res.end("not found");
}

// ─── Tests ──────────────────────────────────────────────────────────

test("smoke script passes against a well-behaved mock server", async () => {
  const { server, url } = await startMockServer(fullMockHandler);
  try {
    const result = await runSmoke(url);
    assert.equal(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.match(result.stdout, /passed/);
    assert.match(result.stdout, /0 failed/);
    assert.match(result.stdout, /Production Smoke Test/);
  } finally {
    await closeServer(server);
  }
});

test("smoke script fails when health/live is broken", async () => {
  const handler = (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health/live") {
      res.statusCode = 500;
      res.end("error");
      return;
    }
    fullMockHandler(req, res);
  };
  const { server, url } = await startMockServer(handler);
  try {
    const result = await runSmoke(url);
    assert.equal(result.exitCode, 1, `Expected exit 1 but got ${result.exitCode}\nstdout:\n${result.stdout}`);
    assert.match(result.stdout, /[1-9] failed/);
  } finally {
    await closeServer(server);
  }
});

test("smoke script fails when homepage is missing", async () => {
  const handler = (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    fullMockHandler(req, res);
  };
  const { server, url } = await startMockServer(handler);
  try {
    const result = await runSmoke(url);
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /[1-9] failed/);
  } finally {
    await closeServer(server);
  }
});

test("smoke script skips auth-gated endpoints when no token is set", async () => {
  const { server, url } = await startMockServer(fullMockHandler);
  try {
    const result = await runSmoke(url, { DRIVABLE_REVIEWER_TOKEN: "" });
    assert.match(result.stdout, /skipped/);
    assert.match(result.stdout, /DRIVABLE_REVIEWER_TOKEN not set/);
  } finally {
    await closeServer(server);
  }
});

test("smoke script skips write tests when TEST_WRITE is not set", async () => {
  const { server, url } = await startMockServer(fullMockHandler);
  try {
    const result = await runSmoke(url, { TEST_WRITE: "" });
    assert.match(result.stdout, /TEST_WRITE not set/);
  } finally {
    await closeServer(server);
  }
});

test("smoke script detects CORS rejection for unknown origins", async () => {
  const { server, url } = await startMockServer(fullMockHandler);
  try {
    const result = await runSmoke(url);
    assert.match(result.stdout, /CORS: unknown origin rejected/);
    assert.match(result.stdout, /CORS: allowed origin reflected/);
  } finally {
    await closeServer(server);
  }
});

test("smoke script reports 404 for unknown API routes", async () => {
  const { server, url } = await startMockServer(fullMockHandler);
  try {
    const result = await runSmoke(url);
    assert.match(result.stdout, /Unknown API route/);
  } finally {
    await closeServer(server);
  }
});

test("smoke script checks SPA fallback for multiple routes", async () => {
  const { server, url } = await startMockServer(fullMockHandler);
  try {
    const result = await runSmoke(url);
    assert.match(result.stdout, /SPA fallback \/start/);
    assert.match(result.stdout, /SPA fallback \/help/);
    assert.match(result.stdout, /SPA fallback \/buyer-check/);
  } finally {
    await closeServer(server);
  }
});
