import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createSessionToken } from "../customer-auth.js";

async function withServer(work: (origin: string) => Promise<void>) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.DRIVABLE_SESSION_SECRET;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  process.env.DRIVABLE_SESSION_SECRET = "clearsale-listing-route-test-secret-at-least-32";
  const { registerRoutes } = await import("../routes.js");
  const app = express(); app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET; else process.env.DRIVABLE_SESSION_SECRET = previousSecret;
  }
}

test("ClearSale durable listing routes require customer authentication and fail honestly without storage", async () => {
  await withServer(async (origin) => {
    assert.equal((await fetch(`${origin}/api/marketplace/my-listings`)).status, 401);
    assert.equal((await fetch(`${origin}/api/marketplace/listings`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401);

    const token = createSessionToken({ id: "synthetic-listing-owner", email: "owner@example.invalid" });
    const invalid = await fetch(`${origin}/api/marketplace/listings`, {
      method: "POST", headers: { cookie: `drivable_session=${encodeURIComponent(token)}`, "content-type": "application/json" }, body: "{}",
    });
    assert.equal(invalid.status, 400);
    assert.equal((await fetch(`${origin}/api/marketplace/listings`)).status, 503);
    assert.equal((await fetch(`${origin}/api/marketplace/listings/missing`)).status, 503);
  });
});
