import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  HARD_CAPS,
  assertSafeTarget,
  parseArgs,
  validateConfig,
} from "./guardrails.mjs";
import { buildReport, percentile, runHarness } from "./load-cert.mjs";
import { buildScenarioCatalog } from "./scenarios.mjs";

test("target guard allows loopback and exact HTTPS staging allowlists", () => {
  assert.equal(assertSafeTarget("http://localhost:5000").local, true);
  assert.equal(assertSafeTarget("http://127.9.8.7:5000").local, true);
  const staging = assertSafeTarget(
    "https://stage.mechaniceye.example",
    ["stage.mechaniceye.example"],
  );
  assert.equal(staging.targetKind, "explicitly allowlisted staging");
  assert.equal(
    assertSafeTarget("https://review.example.test", ["review.example.test"]).targetKind,
    "explicitly allowlisted staging",
  );
  assert.equal(
    assertSafeTarget("https://pr-123.preview-host.example", ["pr-123.preview-host.example"]).targetKind,
    "explicitly allowlisted staging",
  );
});

test("target guard refuses remote, insecure, wildcard, and recognizable production targets", () => {
  assert.throws(
    () => assertSafeTarget("https://stage.example.test"),
    /explicit|allow-staging-host|blocked/i,
  );
  assert.throws(
    () => assertSafeTarget("http://stage.example.test", ["stage.example.test"]),
    /HTTPS/,
  );
  assert.throws(
    () => assertSafeTarget("https://stage.example.test", ["*.example.test"]),
    /wildcards/,
  );
  assert.throws(
    () => assertSafeTarget(
      "https://mechaniceye-backend-v2.onrender.com",
      ["mechaniceye-backend-v2.onrender.com"],
    ),
    /production/,
  );
  assert.throws(
    () => assertSafeTarget("https://getdrivable.com", ["getdrivable.com"]),
    /production/,
  );
  assert.throws(
    () => assertSafeTarget("https://api.production.example", ["api.production.example"]),
    /production/,
  );
  assert.throws(
    () => assertSafeTarget("https://api.getdrivable.com", ["api.getdrivable.com"]),
    /ambiguous|non-production marker|allowlist alone/i,
  );
});

test("configuration hard caps cannot be overridden", () => {
  const config = parseArgs(["--concurrency", String(HARD_CAPS.concurrency + 1)]);
  assert.throws(() => validateConfig(config), /concurrency/);
  assert.throws(
    () => parseArgs(["--browse-path", "https://elsewhere.example/api"]),
    /same-origin path/,
  );
});

test("remote writes require a separate confirmation", () => {
  const base = [
    "--target", "https://stage.example.test",
    "--allow-staging-host", "stage.example.test",
    "--write-text-intake",
  ];
  assert.throws(() => validateConfig(parseArgs(base)), /confirm-staging-writes/);
  assert.doesNotThrow(() => validateConfig(parseArgs([...base, "--confirm-staging-writes"])));
});

test("synthetic requests contain no contact data and default text intake cannot persist", () => {
  const config = parseArgs([]);
  const catalog = buildScenarioCatalog(config);
  const textRequest = catalog.get("text-intake").request({
    correlationId: "launch-cert-test-1",
    sequence: 1,
    occurrence: 0,
  });
  const body = JSON.parse(textRequest.body);
  assert.equal(textRequest.mode, "non-persistent validation");
  assert.equal(body.evidenceIntake, "{");
  assert.equal("name" in body, false);
  assert.equal("email" in body, false);
  assert.equal("phone" in body, false);
  assert.equal(textRequest.expectedStatuses.has(400), true);

  const firstUpload = catalog.get("upload-boundary").request({
    correlationId: "launch-cert-test-2",
    sequence: 2,
    occurrence: 0,
  });
  const secondUpload = catalog.get("upload-boundary").request({
    correlationId: "launch-cert-test-3",
    sequence: 3,
    occurrence: 1,
  });
  assert.equal(firstUpload.expectedStatuses.has(413), true);
  assert.equal(secondUpload.expectedStatuses.has(415), true);
});

test("percentiles and duplicate/lost launch SLOs fail closed", () => {
  assert.equal(percentile([10, 20, 30, 40], 0.95), 40);
  const config = parseArgs(["--scenarios", "text-intake", "--write-text-intake"]);
  const safeTarget = validateConfig(config);
  const common = {
    scenario: "text-intake",
    attempted: true,
    httpResponse: true,
    status: 200,
    durationMs: 25,
    ok: true,
    expectsUniqueResponseId: true,
    errorType: null,
  };
  const report = buildReport({
    config,
    safeTarget,
    elapsedMs: 50,
    runId: "selftest",
    results: [
      { ...common, correlationId: "one", responseId: "same" },
      { ...common, correlationId: "two", responseId: "same" },
    ],
  });
  assert.equal(report.certification, "FAIL");
  assert.equal(report.indicators.duplicateResponseIds, 1);
  assert.match(report.violations.join(" "), /duplicate/);
});

test("bounded local integration covers all scenario contracts", async (t) => {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/api/health/db")) {
      response.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      return;
    }
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "application/json" }).end("[]");
      return;
    }
    if (request.url === "/api/auth/session") {
      response.writeHead(401, { "content-type": "application/json" }).end('{"ok":false}');
      return;
    }
    if (request.url === "/api/diagnoses") {
      const multipart = String(request.headers["content-type"] ?? "").startsWith("multipart/form-data");
      request.resume();
      response.writeHead(multipart ? 413 : 400, { "content-type": "application/json" }).end('{"ok":false}');
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const address = server.address();
  assert.equal(typeof address, "object");

  const config = parseArgs([
    "--target", `http://127.0.0.1:${address.port}`,
    "--concurrency", "3",
    "--rate", "20",
    "--duration", "0.5",
    "--max-requests", "10",
    "--timeout-ms", "1000",
    "--slo-p95-ms", "1000",
  ]);
  const safeTarget = validateConfig(config);
  const report = await runHarness(config, { safeTarget, runId: "selftest" });
  assert.equal(report.certification, "PASS", JSON.stringify(report.violations));
  assert.deepEqual(Object.keys(report.scenarios), [
    "health",
    "browse",
    "text-intake",
    "auth-abuse",
    "upload-boundary",
  ]);
  assert.equal(report.overall.planned, 10);
  assert.equal(report.overall.responses, 10);
});

test("CLI dry-run validates without opening the network", () => {
  const script = fileURLToPath(new URL("./load-cert.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--dry-run", "--duration", "1", "--max-requests", "1"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no network requests sent/);
  assert.match(result.stdout, /non-persistent validation/);
});

test("CLI dry-run rejects ambiguous allowlists and accepts clear staging targets", () => {
  const script = fileURLToPath(new URL("./load-cert.mjs", import.meta.url));
  const ambiguous = spawnSync(process.execPath, [
    script,
    "--target", "https://api.getdrivable.com",
    "--allow-staging-host", "api.getdrivable.com",
    "--dry-run",
    "--duration", "1",
    "--max-requests", "1",
  ], { encoding: "utf8" });
  assert.equal(ambiguous.status, 2, ambiguous.stdout);
  assert.match(`${ambiguous.stdout}\n${ambiguous.stderr}`, /ambiguous|non-production marker|allowlist alone/i);

  const staging = spawnSync(process.execPath, [
    script,
    "--target", "https://api-staging.getdrivable.com",
    "--allow-staging-host", "api-staging.getdrivable.com",
    "--dry-run",
    "--duration", "1",
    "--max-requests", "1",
  ], { encoding: "utf8" });
  assert.equal(staging.status, 0, staging.stderr);
  assert.match(staging.stdout, /explicitly allowlisted staging/);
  assert.match(staging.stdout, /no network requests sent/);
});
