import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";
import { storage, LocalStorage, setStorageImpl } from "./storage.js";

// QA lane (Nov 2 paid beta): cache hardening for the remaining PII routes
// (mechanic routing P0 #10, customer identity P0 #5, reliability P0 #9).
//
// Probe (2026-09-23) showed these answers were cacheable by shared proxies
// or mobile browser caches:
// - every requireReviewer rejection (401 unauthorized, 503 not_configured)
//   carried no `Cache-Control: no-store` — only the success path set it.
//   A cached 401/503 can leak auth state and break mobile retry/resume.
// - GET /api/mechanics (public, mechanic PII) answered 200 with no
//   Cache-Control at all.
// - POST /api/consultations, POST /api/consultations/:id/feedback,
//   POST /api/internal-review, and POST /api/consent/revoke set no-store
//   nowhere on their 200/400/500 branches.
//
// Every branch must answer `Cache-Control: no-store`, set at middleware /
// handler entry before any branching — mirroring the customer resume/status
// and reviewer case-read hardening.

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";
const TEST_REVIEWER_TOKEN = "test-reviewer-token-12345678901234567890123456789012";

const CUSTOMER: CustomerIdentity = { id: "cust-reviewer-cache-1", email: "owner@cache.test" };

class FailingMechanicsStorage extends LocalStorage {
  async getActiveMechanics(): Promise<never> { throw new Error("storage unavailable"); }
}

function reviewerHeaders(): Record<string, string> {
  return { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` };
}

function cookieFor(identity: CustomerIdentity): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withServer(
  work: (origin: string) => Promise<void>,
  env: Record<string, string | undefined> = {},
) {
  const priorSessionSecret = process.env.DRIVABLE_SESSION_SECRET;
  const priorBetaInvite = process.env.DRIVABLE_BETA_INVITE_CODE;
  const priorReviewerToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  process.env.DRIVABLE_SESSION_SECRET = TEST_SESSION_SECRET;
  process.env.DRIVABLE_BETA_INVITE_CODE = TEST_BETA_INVITE;
  if (!("DRIVABLE_REVIEWER_TOKEN" in env)) {
    process.env.DRIVABLE_REVIEWER_TOKEN = TEST_REVIEWER_TOKEN;
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
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
    `${route} must answer Cache-Control: no-store`,
  );
}

// --- Reviewer auth-gate rejections (401) ---

test("reviewer gate: consultation start without a token is never cacheable (401)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/consultations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 401);
    assertNoStore(response, "POST /api/consultations 401");
    await response.text();
  });
});

test("reviewer gate: consultation feedback without a token is never cacheable (401)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/consultations/abc/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 401);
    assertNoStore(response, "POST /api/consultations/:id/feedback 401");
    await response.text();
  });
});

test("reviewer gate: internal review without a token is never cacheable (401)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/internal-review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 401);
    assertNoStore(response, "POST /api/internal-review 401");
    await response.text();
  });
});

test("reviewer gate: diagnoses list without a token is never cacheable (401)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses`);
    assert.equal(response.status, 401);
    assertNoStore(response, "GET /api/diagnoses 401");
    await response.text();
  });
});

// --- Reviewer auth-gate rejections (503 not configured) ---

test("reviewer gate: consultation start with a weak token is never cacheable (503)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/consultations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer weak" },
      body: "{}",
    });
    assert.equal(response.status, 503);
    assertNoStore(response, "POST /api/consultations 503");
    await response.text();
  }, { DRIVABLE_REVIEWER_TOKEN: "weak" });
});

test("reviewer gate: diagnoses list with a weak token is never cacheable (503)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses`);
    assert.equal(response.status, 503);
    assertNoStore(response, "GET /api/diagnoses 503");
    await response.text();
  }, { DRIVABLE_REVIEWER_TOKEN: "weak" });
});

// --- Handler branches behind the gate ---

test("mechanic list is never cacheable (200)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/mechanics`);
    assert.equal(response.status, 200);
    assertNoStore(response, "GET /api/mechanics 200");
    await response.text();
  });
});

test("mechanic list is never cacheable (500 storage failure)", async () => {
  await withServer(async (origin) => {
    setStorageImpl(new FailingMechanicsStorage());
    try {
      const response = await fetch(`${origin}/api/mechanics`);
      assert.equal(response.status, 500);
      assertNoStore(response, "GET /api/mechanics 500");
      await response.text();
    } finally {
      setStorageImpl(storage);
    }
  });
});

test("consultation start validation failure is never cacheable (400)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/consultations`, {
      method: "POST",
      headers: { "content-type": "application/json", ...reviewerHeaders() },
      body: "{}",
    });
    assert.equal(response.status, 400);
    assertNoStore(response, "POST /api/consultations 400");
    await response.text();
  });
});

test("consultation feedback with a hostile id is never cacheable (400)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/consultations/${"x".repeat(200)}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json", ...reviewerHeaders() },
      body: "{}",
    });
    assert.equal(response.status, 400);
    assertNoStore(response, "POST /api/consultations/:id/feedback 400");
    await response.text();
  });
});

test("internal review validation failure is never cacheable (400)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/internal-review`, {
      method: "POST",
      headers: { "content-type": "application/json", ...reviewerHeaders() },
      body: "{}",
    });
    assert.equal(response.status, 400);
    assertNoStore(response, "POST /api/internal-review 400");
    await response.text();
  });
});

test("consent revoke without a session is never cacheable (401)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/consent/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId: "CASE-123" }),
    });
    assert.equal(response.status, 401);
    assertNoStore(response, "POST /api/consent/revoke 401");
    await response.text();
  });
});

test("consent revoke with a missing caseId is never cacheable (400)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/consent/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieFor(CUSTOMER) },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 400);
    assertNoStore(response, "POST /api/consent/revoke 400");
    await response.text();
  });
});
