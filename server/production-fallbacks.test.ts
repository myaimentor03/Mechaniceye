import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerProductionFallbacks } from "./production-fallbacks.js";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #9 reliability /
 * mobile recovery, P0 #5 customer identity).
 *
 * Production boot (server/index.ts) mounts registerProductionFallbacks(app)
 * AFTER registerRoutes(app) as the outer belt-and-braces layer. Any request
 * that falls through to it must answer the same fail-closed contract as the
 * inner transport envelope: parseable `{ ok: false, code }` JSON with
 * `Cache-Control: no-store` -- never Express's default HTML, never the SPA
 * shell, never a stack trace or error-object echo. Before this lock the
 * outer layer answered `{ message: "Not found" }` /
 * `{ message: "Internal Server Error" }` with no Cache-Control, so a
 * cacheable, envelope-breaking response could reach mobile clients (which
 * call response.json()) and intermediaries that must never store API
 * responses. Statuses are unchanged (404 fallthrough, safe 4xx-5xx
 * passthrough, anything else 500); this pins the envelope, the no-store
 * header, and zero internals echo.
 */

async function withFallbackServer(work: (origin: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  // Probe routes mounted BEFORE the fallbacks, mirroring production order
  // (fallbacks are the last /api + error handlers in the stack).
  app.get("/api/qa-throw-safe", (_req, _res, next) => {
    const error: any = new Error("qa-safe-secret-must-not-leak-77");
    error.status = 418;
    next(error);
  });
  app.get("/api/qa-throw-unsafe", () => {
    throw new Error("qa-unsafe-secret-must-not-leak-88");
  });
  registerProductionFallbacks(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("outer unknown /api route answers 404 JSON with API_NOT_FOUND and no-store", async () => {
  await withFallbackServer(async (origin) => {
    const response = await fetch(`${origin}/api/nope-not-real-qa-outer`);
    const text = await response.text();
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "API_NOT_FOUND");
    assert.ok(typeof parsed.error === "string" && parsed.error.length > 0);
    assert.ok(!text.includes("<html"), "must not answer HTML");
  });
});

test("outer unsupported method on fallthrough route answers 404 JSON, not HTML", async () => {
  await withFallbackServer(async (origin) => {
    const response = await fetch(`${origin}/api/nope-not-real-qa-outer`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const text = await response.text();
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(!text.includes("<html"), "must not answer HTML");
  });
});

test("outer error handler passes safe status through with REQUEST_FAILED and no leak", async () => {
  await withFallbackServer(async (origin) => {
    const response = await fetch(`${origin}/api/qa-throw-safe`);
    const text = await response.text();
    assert.equal(response.status, 418);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "REQUEST_FAILED");
    assert.ok(!text.includes("qa-safe-secret-must-not-leak-77"), "must not echo error internals");
    assert.ok(!text.includes("<html"), "must not answer HTML");
  });
});

test("outer error handler maps unsafe errors to 500 REQUEST_FAILED with no leak", async () => {
  await withFallbackServer(async (origin) => {
    const response = await fetch(`${origin}/api/qa-throw-unsafe`);
    const text = await response.text();
    assert.equal(response.status, 500);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, "REQUEST_FAILED");
    assert.ok(!text.includes("qa-unsafe-secret-must-not-leak-88"), "must not echo error internals");
    assert.ok(!text.includes("<html"), "must not answer HTML");
  });
});
