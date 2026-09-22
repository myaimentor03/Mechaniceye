import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #9
 * reliability / mobile recovery).
 *
 * Any host that boots registerRoutes(app) with bare express.json() must
 * still answer transport failures as parseable fail-closed JSON. Before
 * this lock, malformed JSON answered HTML 400 leaking `SyntaxError`
 * internals, oversized bodies answered HTML 413, and unknown /api/*
 * routes answered HTML 404 -- all of which break mobile clients that
 * call response.json() (flaky mobile networks routinely deliver
 * truncated bodies). Statuses are unchanged (400/413/404); this pins
 * the JSON envelope, the no-store header, and zero raw-input echo.
 */

const S3_VARS = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
  "MASTER_INTAKE_WEBHOOK_URL",
] as const;

async function withServer(work: (origin: string) => Promise<void>) {
  for (const key of S3_VARS) delete process.env[key];
  const { registerRoutes } = await import("./routes.js");
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function postRaw(origin: string, path: string, rawBody: string, contentType = "application/json") {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": contentType },
    body: rawBody,
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, headers: response.headers, body: parsed, text };
}

test("malformed JSON answers 400 JSON with INVALID_JSON and no parser internals", async () => {
  await withServer(async (origin) => {
    const marker = "TruncProbeQaXy88";
    const { status, headers, body, text } = await postRaw(
      origin,
      "/api/marketplace/buyer-interest",
      `{"buyerName": "${marker}", broken`,
    );
    assert.equal(status, 400);
    assert.match(headers.get("content-type") || "", /application\/json/);
    assert.equal(body.ok, false);
    assert.equal(body.code, "INVALID_JSON");
    assert.ok(typeof body.error === "string" && body.error.length > 0);
    assert.ok(!text.includes("SyntaxError"), "must not leak parser error name");
    assert.ok(!text.includes(marker), "must not echo the truncated body");
    assert.ok(!text.includes("<html"), "must not answer HTML");
    assert.ok(!text.includes("node:"), "must not leak internal paths");
  });
});

test("oversized JSON answers 413 JSON with PAYLOAD_TOO_LARGE", async () => {
  await withServer(async (origin) => {
    const { status, headers, body, text } = await postRaw(
      origin,
      "/api/marketplace/seller-intake",
      JSON.stringify({ filler: "x".repeat(150 * 1024) }),
    );
    assert.equal(status, 413);
    assert.match(headers.get("content-type") || "", /application\/json/);
    assert.equal(body.ok, false);
    assert.equal(body.code, "PAYLOAD_TOO_LARGE");
    assert.ok(!text.includes("<html"), "must not answer HTML");
  });
});

test("unknown /api route answers 404 JSON with API_NOT_FOUND", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/nope-not-real-qa`, { method: "GET" });
    const text = await response.text();
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "API_NOT_FOUND");
    assert.ok(!text.includes("<html"), "must not answer HTML");
  });
});

test("unsupported method on a live route answers 404 JSON, not HTML", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/health/live`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const text = await response.text();
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    assert.ok(!text.includes("<html"), "must not answer HTML");
  });
});

test("transport error responses are marked no-store", async () => {
  await withServer(async (origin) => {
    const bad = await postRaw(origin, "/api/marketplace/buyer-interest", "{not-json");
    assert.equal(bad.headers.get("cache-control"), "no-store");
    const missing = await fetch(`${origin}/api/nope-not-real-qa`);
    assert.equal(missing.headers.get("cache-control"), "no-store");
  });
});

test("valid intake flow is unaffected by the transport envelope (still 502 without webhook)", async () => {
  await withServer(async (origin) => {
    const { status, headers } = await postRaw(
      origin,
      "/api/marketplace/buyer-interest",
      JSON.stringify({
        buyerName: "Robin Buyer",
        buyerEmail: "buyer@example.com",
        buyerPhone: "(415) 555-0100",
        preferredContactMethod: "Email",
        listingTitle: "2015 Toyota Camry LE",
        message: "Is this vehicle still available for a Buyer Check review?",
        timeline: "This weekend",
        acknowledgments: {
          platformOnly: true,
          buyerResponsibilities: true,
          noGuarantee: true,
        },
      }),
    );
    assert.equal(status, 502);
    assert.match(headers.get("content-type") || "", /application\/json/);
  });
});
