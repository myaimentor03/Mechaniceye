import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { registerDurableReviewRoutes } from "./review-routes.js";
import { reviewerIdentityFromCredential } from "../reviewer-auth.js";
import { ReviewWriteError } from "./postgres-review-writer.js";

const token = "review-route-test-token-that-is-long-enough";

async function withServer(runtime: any, work: (origin: string) => Promise<void>) {
  const app = express(); app.use(express.json()); registerDurableReviewRoutes(app, async () => runtime);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${address.port}`);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test("approval uses the authenticated reviewer binding and ignores request identity", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  let received: any;
  const runtime = { writer: { async approve(input: any) { received = input; return { ok: true, reviewerRef: input.reviewerRef }; } } };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/approve`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ reviewerRef: "reviewer_attacker", highRiskAcknowledged: true }),
      });
      assert.equal(response.status, 200);
      assert.equal(received.reviewerRef, reviewerIdentityFromCredential(token).ref);
      assert.notEqual(received.reviewerRef, "reviewer_attacker");
      assert.equal(received.highRiskAcknowledged, true);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("missing reviewer authorization fails before runtime access", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  let accessed = false;
  try {
    await withServer({}, async (origin) => {
      const appResponse = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/approve`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      });
      assert.equal(appResponse.status, 401);
      assert.equal(accessed, false);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("review write failures never echo storage or database internals", async () => {
  const secret = "connection-dsn-user=hunter2";
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = {
    writer: {
      async approve() {
        throw new ReviewWriteError("storage_unavailable", `database connection failed ${secret}`, true);
      },
    },
  };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/approve`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ highRiskAcknowledged: true }),
      });
      assert.equal(response.status, 503);
      const body = await response.text();
      assert.equal(body.includes(secret), false);
      assert.equal(body.includes("Review state could not be persisted."), true);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});
