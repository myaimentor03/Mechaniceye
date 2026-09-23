import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { storage } from "./storage.js";
import { generateCaseId } from "./case-storage.js";

// QA lane (Nov 2 paid beta): reviewer case-read hardening for customer
// identity (P0 #5) and reliability (P0 #9).
//
// GET /api/diagnoses/recent, GET /api/diagnoses, GET /api/diagnoses/:id,
// and GET /api/fix-history/:diagnosisId return full customer case bodies
// (vehicle, symptoms, timing, history). The customer resume/status routes
// and the evidence binary route already answer `Cache-Control: no-store`,
// but these reviewer case-read GETs did not: a shared proxy or a mobile
// browser cache could retain one customer's PII and serve it later.
// Every branch (200/404/400/500) must be cache-proof, so the header is set
// at handler entry before any branching.

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";
const TEST_REVIEWER_TOKEN = "test-reviewer-token-12345678901234567890123456789012";

function reviewerHeaders(): Record<string, string> {
  return { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` };
}

async function withServer(work: (origin: string) => Promise<void>) {
  const priorSessionSecret = process.env.DRIVABLE_SESSION_SECRET;
  const priorBetaInvite = process.env.DRIVABLE_BETA_INVITE_CODE;
  const priorReviewerToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  process.env.DRIVABLE_SESSION_SECRET = TEST_SESSION_SECRET;
  process.env.DRIVABLE_BETA_INVITE_CODE = TEST_BETA_INVITE;
  process.env.DRIVABLE_REVIEWER_TOKEN = TEST_REVIEWER_TOKEN;

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
    if (priorSessionSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = priorSessionSecret;
    if (priorBetaInvite === undefined) delete process.env.DRIVABLE_BETA_INVITE_CODE;
    else process.env.DRIVABLE_BETA_INVITE_CODE = priorBetaInvite;
    if (priorReviewerToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = priorReviewerToken;
  }
}

function assertNoStore(response: Response, route: string) {
  assert.match(
    response.headers.get("cache-control") || "",
    /no-store/,
    `${route} must answer Cache-Control: no-store`
  );
}

test("reviewer recent-diagnoses list is never cacheable (200)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/recent?limit=5`, {
      headers: reviewerHeaders(),
    });
    assert.equal(response.status, 200);
    assertNoStore(response, "GET /api/diagnoses/recent");
    await response.text();
  });
});

test("reviewer diagnoses list is never cacheable (200)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses`, {
      headers: reviewerHeaders(),
    });
    assert.equal(response.status, 200);
    assertNoStore(response, "GET /api/diagnoses");
    await response.text();
  });
});

test("reviewer single-case read is never cacheable (200 with PII body)", async () => {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: "cust-reviewer-cache-owner",
    vehicleInfo: "2015 Honda Civic",
    description: "Engine runs rough at idle",
    timing: "Idle",
  });

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${caseId}`, {
      headers: reviewerHeaders(),
    });
    assert.equal(response.status, 200);
    assertNoStore(response, "GET /api/diagnoses/:id");
    const body = await response.json();
    assert.equal(body.id, caseId);
  });
});

test("reviewer single-case read of a missing case is never cacheable (404)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${generateCaseId()}`, {
      headers: reviewerHeaders(),
    });
    assert.equal(response.status, 404);
    assertNoStore(response, "GET /api/diagnoses/:id 404");
    await response.text();
  });
});

test("reviewer single-case read with a hostile id is never cacheable (400)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/${"x".repeat(200)}`, {
      headers: reviewerHeaders(),
    });
    assert.equal(response.status, 400);
    assertNoStore(response, "GET /api/diagnoses/:id 400");
    await response.text();
  });
});

test("reviewer fix-history read is never cacheable (200)", async () => {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: "cust-reviewer-cache-owner-2",
    vehicleInfo: "2012 Ford F-150",
    description: "Rough idle after spark plug replacement",
    timing: "Idle",
  });

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/fix-history/${caseId}`, {
      headers: reviewerHeaders(),
    });
    assert.equal(response.status, 200);
    assertNoStore(response, "GET /api/fix-history/:diagnosisId");
    await response.text();
  });
});

test("reviewer fix-history read with a hostile id is never cacheable (400)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/fix-history/${"x".repeat(200)}`, {
      headers: reviewerHeaders(),
    });
    assert.equal(response.status, 400);
    assertNoStore(response, "GET /api/fix-history/:diagnosisId 400");
    await response.text();
  });
});
