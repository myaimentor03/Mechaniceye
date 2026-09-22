import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";

// QA launch-blocker lock for the November 2 paid beta
// (P0 #3 Guided Journey/FIX decision, P0 #9 reliability/mobile recovery).
//
// The reviewer FIX/decision flow routes accept a :diagnosisId / :id path
// param. Before this lock, hostile ids (oversized, whitespace-only,
// control-char) flowed raw into storage and log context and answered 500.
// Now they must fail closed with 400 and a generic message that never
// echoes the submitted value — while legitimate ids (including legacy
// non-CASE- reviewer ids and the 160-char boundary) still reach storage.

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

function reviewerHeaders() {
  return { authorization: `Bearer ${TEST_REVIEWER_TOKEN}`, "content-type": "application/json" };
}

const VALID_STEP_BODY = JSON.stringify({ suggestionIndex: 0, stepIndex: 0, completed: true });
const VALID_FIX_BODY = JSON.stringify({ suggestionIndex: 0, wasSuccessful: true });

// --- POST /api/diagnoses/:diagnosisId/steps ---

test("steps rejects an oversized diagnosisId with 400 and never echoes it", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${OVERSIZED_ID}/steps`, {
      method: "POST",
      headers: reviewerHeaders(),
      body: VALID_STEP_BODY,
    });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.ok(!text.includes(MARKER), "response must never echo the hostile id");
    assert.ok(text.includes("message"), "must include a generic message");
  });
});

test("steps rejects a whitespace-only diagnosisId with 400", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/%20/steps`, {
      method: "POST",
      headers: reviewerHeaders(),
      body: VALID_STEP_BODY,
    });
    assert.equal(response.status, 400);
  });
});

test("steps accepts a 160-char boundary id (guard must not break legit ids)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${BOUNDARY_ID}/steps`, {
      method: "POST",
      headers: reviewerHeaders(),
      body: VALID_STEP_BODY,
    });
    assert.equal(response.status, 200);
  });
});

// --- POST /api/diagnoses/:diagnosisId/fix-complete ---

test("fix-complete rejects an oversized diagnosisId with 400 and never echoes it", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${OVERSIZED_ID}/fix-complete`, {
      method: "POST",
      headers: reviewerHeaders(),
      body: VALID_FIX_BODY,
    });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.ok(!text.includes(MARKER), "response must never echo the hostile id");
  });
});

// --- GET /api/fix-history/:diagnosisId ---

test("fix-history rejects an oversized diagnosisId with 400 and serves valid ids", async () => {
  await withServer(async (origin) => {
    const hostile = await fetch(`${origin}/api/fix-history/${OVERSIZED_ID}`, {
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` },
    });
    assert.equal(hostile.status, 400);
    const text = await hostile.text();
    assert.ok(!text.includes(MARKER), "response must never echo the hostile id");

    const clean = await fetch(`${origin}/api/fix-history/fake-id`, {
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` },
    });
    assert.equal(clean.status, 200);
  });
});

// --- POST /api/diagnoses/:diagnosisId/export-chat ---

test("export-chat rejects an oversized diagnosisId with 400 (valid ids still reach storage)", async () => {
  await withServer(async (origin) => {
    const hostile = await fetch(`${origin}/api/diagnoses/${OVERSIZED_ID}/export-chat`, {
      method: "POST",
      headers: reviewerHeaders(),
      body: JSON.stringify({}),
    });
    assert.equal(hostile.status, 400);
    const text = await hostile.text();
    assert.ok(!text.includes(MARKER), "response must never echo the hostile id");

    // A valid-format unknown id must still reach storage (500 Diagnosis not
    // found), proving the guard fails closed without swallowing the route.
    const clean = await fetch(`${origin}/api/diagnoses/this-id-does-not-exist/export-chat`, {
      method: "POST",
      headers: reviewerHeaders(),
      body: JSON.stringify({}),
    });
    assert.equal(clean.status, 500);
  });
});

// --- POST /api/diagnoses/:diagnosisId/send-to-mechanic ---

test("send-to-mechanic rejects an oversized diagnosisId with 400 and never echoes it", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${OVERSIZED_ID}/send-to-mechanic`, {
      method: "POST",
      headers: reviewerHeaders(),
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.ok(!text.includes(MARKER), "response must never echo the hostile id");
  });
});

// --- GET /api/diagnoses/:id ---

test("GET diagnosis rejects oversized and whitespace ids with 400", async () => {
  await withServer(async (origin) => {
    const headers = { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` };
    const hostile = await fetch(`${origin}/api/diagnoses/${OVERSIZED_ID}`, { headers });
    assert.equal(hostile.status, 400);
    const text = await hostile.text();
    assert.ok(!text.includes(MARKER), "response must never echo the hostile id");

    const blank = await fetch(`${origin}/api/diagnoses/%20`, { headers });
    assert.equal(blank.status, 400);
  });
});
