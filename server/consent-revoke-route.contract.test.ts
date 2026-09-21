import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

/**
 * QA launch-blocker lock for November 2 paid beta (P0 #5 customer identity
 * and consent compliance).
 *
 * POST /api/consent/revoke is the customer-facing endpoint for revoking
 * durable intake consent. The domain logic is tested in
 * consent/consent-revocation.test.ts, but the HTTP route itself has zero
 * integration coverage. A future refactor could silently break auth
 * enforcement, caseId validation, or the 503 fail-closed when launch
 * controls are disabled — any of which would leave consent revocation
 * non-functional for paying customers.
 *
 * These contract tests pin the HTTP-layer invariants:
 * - customer session required (401)
 * - caseId required and bounded (400)
 * - 503 fail-closed when DRIVABLE_LAUNCH_CONTROLS_ENABLED is not "true"
 * - response headers prevent caching of consent state
 */

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";

const CUSTOMER: CustomerIdentity = {
  id: "cust-consent-revoke-001",
  email: "revoke@example.test",
};

function cookieFor(identity: CustomerIdentity): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withServer(
  env: Record<string, string | undefined>,
  work: (origin: string, cookie: string) => Promise<void>,
) {
  const priorEnv: Record<string, string | undefined> = {};
  const requiredEnv = {
    DRIVABLE_SESSION_SECRET: TEST_SESSION_SECRET,
    DRIVABLE_BETA_INVITE_CODE: TEST_BETA_INVITE,
    ...env,
  };

  for (const key of Object.keys(requiredEnv)) {
    priorEnv[key] = process.env[key];
    if (requiredEnv[key] === undefined) delete process.env[key];
    else process.env[key] = requiredEnv[key];
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const cookie = cookieFor(CUSTOMER);

  try {
    await work(origin, cookie);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of Object.keys(priorEnv)) {
      if (priorEnv[key] === undefined) delete process.env[key];
      else process.env[key] = priorEnv[key];
    }
  }
}

async function postRevoke(
  origin: string,
  body: unknown,
  headers?: Record<string, string>,
) {
  const response = await fetch(`${origin}/api/consent/revoke`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

// ---------------------------------------------------------------------------
// Auth enforcement
// ---------------------------------------------------------------------------

test("consent revoke requires a customer session (401)", async () => {
  await withServer({}, async (origin) => {
    const { status, body } = await postRevoke(origin, { caseId: "CASE-123" });
    assert.equal(status, 401, "consent revoke must reject unauthenticated requests");
    assert.equal(body.code, "CUSTOMER_AUTH_REQUIRED");
  });
});

test("consent revoke rejects a reviewer bearer token (customer session required)", async () => {
  await withServer({}, async (origin) => {
    const { status } = await postRevoke(
      origin,
      { caseId: "CASE-123" },
      { authorization: "Bearer qa-reviewer-token" },
    );
    assert.equal(status, 401, "reviewer token must not satisfy customer auth requirement");
  });
});

// ---------------------------------------------------------------------------
// caseId validation
// ---------------------------------------------------------------------------

test("consent revoke rejects empty caseId (400)", async () => {
  await withServer({}, async (origin, cookie) => {
    const { status, body } = await postRevoke(origin, {}, { cookie });
    assert.equal(status, 400, "missing caseId must return 400");
    assert.equal(body.code, "INVALID_CASE_ID");
  });
});

test("consent revoke rejects blank caseId (400)", async () => {
  await withServer({}, async (origin, cookie) => {
    const { status, body } = await postRevoke(origin, { caseId: "   " }, { cookie });
    assert.equal(status, 400, "blank caseId must return 400");
    assert.equal(body.code, "INVALID_CASE_ID");
  });
});

test("consent revoke rejects caseId exceeding 200 characters (400)", async () => {
  await withServer({}, async (origin, cookie) => {
    const { status, body } = await postRevoke(origin, { caseId: "C".repeat(201) }, { cookie });
    assert.equal(status, 400, "overlong caseId must return 400");
    assert.equal(body.code, "INVALID_CASE_ID");
  });
});

test("consent revoke accepts caseId at exactly 200 characters (boundary)", async () => {
  await withServer({}, async (origin, cookie) => {
    // Launch controls are disabled in this env, so 503 is expected
    // but the caseId itself passes validation (no 400)
    const { status, body } = await postRevoke(origin, { caseId: "C".repeat(200) }, { cookie });
    assert.notEqual(status, 400, "200-char caseId must not fail validation");
    assert.equal(status, 503, "503 from disabled launch controls is expected");
    assert.equal(body.code, "CONSENT_CONTROLS_UNAVAILABLE");
  });
});

// ---------------------------------------------------------------------------
// 503 fail-closed when launch controls disabled
// ---------------------------------------------------------------------------

test("consent revoke returns 503 CONSENT_CONTROLS_UNAVAILABLE when DRIVABLE_LAUNCH_CONTROLS_ENABLED is not 'true'", async () => {
  await withServer({}, async (origin, cookie) => {
    const { status, body } = await postRevoke(origin, { caseId: "CASE-REVOKE-001" }, { cookie });
    assert.equal(status, 503);
    assert.equal(body.code, "CONSENT_CONTROLS_UNAVAILABLE");
    assert.equal(body.message, "Consent controls are not ready.");
  });
});

test("consent revoke returns 503 when DRIVABLE_LAUNCH_CONTROLS_ENABLED is explicitly false", async () => {
  await withServer({ DRIVABLE_LAUNCH_CONTROLS_ENABLED: "false" }, async (origin, cookie) => {
    const { status, body } = await postRevoke(origin, { caseId: "CASE-REVOKE-002" }, { cookie });
    assert.equal(status, 503);
    assert.equal(body.code, "CONSENT_CONTROLS_UNAVAILABLE");
  });
});

test("consent revoke returns 503 when DRIVABLE_LAUNCH_CONTROLS_ENABLED is set but launch control runtime fails", async () => {
  // When LAUNCH_CONTROLS_ENABLED=true but DATABASE_URL is missing,
  // requireVerifiedLaunchControlRuntime() throws, and the route
  // falls through to the generic 503 handler.
  await withServer({ DRIVABLE_LAUNCH_CONTROLS_ENABLED: "true" }, async (origin, cookie) => {
    const { status, body } = await postRevoke(origin, { caseId: "CASE-REVOKE-003" }, { cookie });
    assert.equal(status, 503);
    assert.equal(body.code, "CONSENT_CONTROLS_UNAVAILABLE");
  });
});

// ---------------------------------------------------------------------------
// Response shape and cache headers
// ---------------------------------------------------------------------------

test("consent revoke 401 does not leak auth mechanism details", async () => {
  await withServer({}, async (origin) => {
    const { status, body } = await postRevoke(origin, { caseId: "CASE-123" });
    assert.equal(status, 401);
    // Must use the standard customer auth code, not a generic "unauthorized"
    assert.equal(body.code, "CUSTOMER_AUTH_REQUIRED");
    // Must not leak session secret, token format, or internal middleware info
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes("session-secret"), "must not leak session secret");
    assert.ok(!serialized.includes("drivable_session"), "must not leak cookie name");
    assert.ok(!serialized.includes("passport"), "must not leak auth library name");
  });
});

test("consent revoke 400 response includes no-store cache-control", async () => {
  await withServer({}, async (origin, cookie) => {
    const { headers } = await postRevoke(origin, {}, { cookie });
    const cacheControl = headers.get("cache-control") || "";
    assert.match(cacheControl, /no-store/, "consent revoke 400 must be cache-proof");
  });
});

test("consent revoke 503 response includes no-store cache-control", async () => {
  await withServer({}, async (origin, cookie) => {
    const { headers } = await postRevoke(origin, { caseId: "CASE-123" }, { cookie });
    const cacheControl = headers.get("cache-control") || "";
    assert.match(cacheControl, /no-store/, "consent revoke 503 must be cache-proof");
  });
});

// ---------------------------------------------------------------------------
// Hostile body: unexpected fields must not leak or alter behavior
// ---------------------------------------------------------------------------

test("consent revoke ignores unexpected fields in the request body", async () => {
  await withServer({}, async (origin, cookie) => {
    const { status, body } = await postRevoke(origin, {
      caseId: "CASE-REVOKE-HOSTILE",
      actorId: "attacker-id",
      accountId: "attacker-account",
      purposes: ["made_up_purpose"],
      override: true,
    }, { cookie });
    // Launch controls disabled => 503 (hostile fields cannot bypass)
    assert.equal(status, 503);
    assert.equal(body.code, "CONSENT_CONTROLS_UNAVAILABLE");
  });
});
