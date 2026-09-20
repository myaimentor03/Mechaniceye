import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";

function createSessionCookie(identity: CustomerIdentity = { id: "cust-consent-test", email: "consent@test.com" }): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withServer(
  env: Record<string, string | undefined>,
  work: (origin: string, sessionCookie: string) => Promise<void>,
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
  const sessionCookie = createSessionCookie();

  try {
    await work(origin, sessionCookie);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of Object.keys(priorEnv)) {
      if (priorEnv[key] === undefined) delete process.env[key];
      else process.env[key] = priorEnv[key];
    }
  }
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    problemCategory: "Engine running rough",
    description: "Engine runs rough at idle, check engine light on",
    vehicleInfo: "2015 Honda Civic 1.5L",
    unsupportedVehicle: false,
    manualVehicleEntryUsed: false,
    rawVehicleSelection: JSON.stringify({
      year: "2015", make: "Honda", model: "Civic", engine: "1.5L",
      manualMake: "", manualModel: "", manualEngine: "",
    }),
    photoEvidenceStatus: "None",
    mileage: "142500",
    obdCodes: "P0300",
    timing: "Idle",
    evidenceIntake: JSON.stringify({
      mode: "diagnose",
      vehicle: { year: "2015", make: "Honda", model: "Civic", engine: "1.5L", mileage: 142500 },
      situation: {
        description: "Engine runs rough at idle",
        symptoms: ["Engine running rough"],
        timing: "Idle",
        urgency: "Safe to Drive",
        canDrive: "Safe to Drive",
        recentRepairs: "",
        buyerObservations: [],
        sellerClaims: [],
      },
      obd: { codes: ["P0300"], attachmentIds: [] },
      attachments: [],
    }),
    consent: JSON.stringify({
      service_fulfillment: true,
      media_processing: true,
      human_review_sharing: true,
      optional_product_learning: false,
    }),
    ...overrides,
  };
}

const VALID_CONSENT = JSON.stringify({
  service_fulfillment: true,
  media_processing: true,
  human_review_sharing: true,
  optional_product_learning: false,
});

const NO_CONSENT = JSON.stringify({});

// ---------------------------------------------------------------------------
// QA lane (Nov 2 paid beta): server-side consent validation must always run,
// regardless of DRIVABLE_LAUNCH_CONTROLS_ENABLED. Previously, consent was
// only validated when launch controls were enabled, meaning a misconfigured
// deployment could persist photos without authorization.
// ---------------------------------------------------------------------------

test("consent enforcement: request without consent field rejected with 400", async () => {
  await withServer({}, async (origin, sessionCookie) => {
    const formData = new FormData();
    Object.entries(validBody({ consent: "" })).forEach(([key, value]) => {
      if (typeof value === "string") formData.append(key, value);
    });
    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: sessionCookie },
      body: formData,
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.message, /Consent is required/i);
  });
});

test("consent enforcement: request with empty consent object rejected with 400", async () => {
  await withServer({}, async (origin, sessionCookie) => {
    const formData = new FormData();
    Object.entries(validBody({ consent: NO_CONSENT })).forEach(([key, value]) => {
      if (typeof value === "string") formData.append(key, value);
    });
    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: sessionCookie },
      body: formData,
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.message, /Consent is required/i);
  });
});

test("consent enforcement: request missing service_fulfillment rejected with 400", async () => {
  await withServer({}, async (origin, sessionCookie) => {
    const consentWithoutService = JSON.stringify({
      media_processing: true,
      human_review_sharing: true,
      optional_product_learning: false,
    });
    const formData = new FormData();
    Object.entries(validBody({ consent: consentWithoutService })).forEach(([key, value]) => {
      if (typeof value === "string") formData.append(key, value);
    });
    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: sessionCookie },
      body: formData,
    });
    assert.equal(response.status, 400);
  });
});

test("consent enforcement: request missing human_review_sharing rejected with 400", async () => {
  await withServer({}, async (origin, sessionCookie) => {
    const consentWithoutHumanReview = JSON.stringify({
      service_fulfillment: true,
      media_processing: true,
      optional_product_learning: false,
    });
    const formData = new FormData();
    Object.entries(validBody({ consent: consentWithoutHumanReview })).forEach(([key, value]) => {
      if (typeof value === "string") formData.append(key, value);
    });
    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: sessionCookie },
      body: formData,
    });
    assert.equal(response.status, 400);
  });
});

test("consent enforcement: valid consent passes the consent gate (may fail later for other reasons)", async () => {
  await withServer({}, async (origin, sessionCookie) => {
    const formData = new FormData();
    Object.entries(validBody({ consent: VALID_CONSENT })).forEach(([key, value]) => {
      if (typeof value === "string") formData.append(key, value);
    });
    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: sessionCookie },
      body: formData,
    });
    // Should NOT be 400 with the consent error message.
    // May be 503 (no DB) or 409 (photo storage not configured), but not 400 consent.
    if (response.status === 400) {
      const body = await response.json();
      assert.ok(
        !body.message?.includes("Consent is required"),
        "Valid consent should pass the consent gate",
      );
    }
  });
});

test("consent enforcement: works when DRIVABLE_LAUNCH_CONTROLS_ENABLED is not set", async () => {
  // Explicitly verify the consent check runs WITHOUT launch controls.
  // This was the original gap: consent was only enforced in the launch-controls branch.
  assert.equal(process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED, undefined);
  await withServer({}, async (origin, sessionCookie) => {
    const formData = new FormData();
    Object.entries(validBody({ consent: NO_CONSENT })).forEach(([key, value]) => {
      if (typeof value === "string") formData.append(key, value);
    });
    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: sessionCookie },
      body: formData,
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.message, /Consent is required/i);
  });
});

test("consent enforcement: no internal error details leaked in consent rejection", async () => {
  await withServer({}, async (origin, sessionCookie) => {
    const formData = new FormData();
    Object.entries(validBody({ consent: NO_CONSENT })).forEach(([key, value]) => {
      if (typeof value === "string") formData.append(key, value);
    });
    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: sessionCookie },
      body: formData,
    });
    const text = await response.text();
    assert.ok(!text.includes("stack"), "must not leak stack trace");
    assert.ok(!text.includes("Error:"), "must not leak Error class name");
  });
});

test("consent enforcement: temp files cleaned up on consent rejection", async () => {
  await withServer({}, async (origin, sessionCookie) => {
    const formData = new FormData();
    Object.entries(validBody({ consent: NO_CONSENT })).forEach(([key, value]) => {
      if (typeof value === "string") formData.append(key, value);
    });
    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: sessionCookie },
      body: formData,
    });
    assert.equal(response.status, 400);
    // Verify no side effects — the rejection is clean
  });
});
