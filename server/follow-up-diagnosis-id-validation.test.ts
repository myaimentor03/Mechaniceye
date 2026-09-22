import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";

// QA launch-blocker lock for the November 2 paid beta
// (P0 #2 Guided Journey, P0 #9 reliability/mobile recovery).
//
// POST /api/diagnoses/:id/follow-up was the only FIX/decision-flow route
// that accepted the :id path param raw (no parseDiagnosisRouteId guard).
// Hostile ids (oversized, whitespace-only, control-char) flowed straight
// into storage and log context. Now they must fail closed with 400 and a
// generic message that never echoes the submitted value — while legitimate
// ids (including the 160-char boundary) still reach storage.

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";
const TEST_REVIEWER_TOKEN = "test-reviewer-token-12345678901234567890123456789012";

const MARKER = "QAHOSTILEMARKER";
const OVERSIZED_ID = MARKER.repeat(20); // 340 chars, over the 160 bound
const BOUNDARY_ID = "b".repeat(160); // exactly at the bound: must pass the guard

async function withServer(work: (origin: string) => Promise<void>) {
  const priorEnv: Record<string, string | undefined> = {};
  const requiredEnv: Record<string, string | undefined> = {
    DRIVABLE_SESSION_SECRET: TEST_SESSION_SECRET,
    DRIVABLE_BETA_INVITE_CODE: TEST_BETA_INVITE,
    DRIVABLE_REVIEWER_TOKEN: TEST_REVIEWER_TOKEN,
  };

  for (const key of Object.keys(requiredEnv)) {
    priorEnv[key] = process.env[key];
    process.env[key] = requiredEnv[key];
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    await work(origin);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of Object.keys(priorEnv)) {
      if (priorEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = priorEnv[key];
      }
    }
  }
}

function followUpForm(additionalInfo = "still rough after repair") {
  const form = new FormData();
  form.append("additionalInfo", additionalInfo);
  return form;
}

test("follow-up rejects an oversized diagnosisId with 400 and never echoes it", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${OVERSIZED_ID}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` },
      body: followUpForm(),
    });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.ok(!text.includes(MARKER), "response must never echo the hostile id");
    assert.ok(text.includes("message"), "must include a generic message");
  });
});

test("follow-up rejects a whitespace-only diagnosisId with 400", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/%20/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` },
      body: followUpForm(),
    });
    assert.equal(response.status, 400);
  });
});

test("follow-up accepts a 160-char boundary id (guard must not break legit ids)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${BOUNDARY_ID}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` },
      body: followUpForm(),
    });
    // Unknown but well-formed id still reaches storage -> 404, proving the
    // guard fails closed without swallowing the route.
    assert.equal(response.status, 404);
  });
});

test("follow-up with hostile id and missing additionalInfo still answers 400 without echo", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${OVERSIZED_ID}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` },
      body: new FormData(),
    });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.ok(!text.includes(MARKER), "response must never echo the hostile id");
  });
});
