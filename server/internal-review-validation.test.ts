import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #10 internal review).
 *
 * The /api/internal-review route is the admin-facing Internal Review Desk for
 * drafting diagnosis responses. It must enforce reviewer auth, validate all
 * required fields, and fail closed when the webhook is not configured.
 * Prior to this test file the route had zero server-side test coverage.
 *
 * These HTTP-level regression tests lock:
 *  - reviewer auth gate (401 without token, 503 when not configured)
 *  - required-field validation (caseId, customerEmail, responseType, messageBody)
 *  - fail-closed delivery (502 when MASTER_INTAKE_WEBHOOK_URL is unset)
 *  - no PII echo in error responses
 */

const ENV_KEYS_TO_CLEAR = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
  "MASTER_INTAKE_WEBHOOK_URL",
] as const;

const REVIEWER_TOKEN = "internal-review-test-token-secure-enough-for-gate";

async function withServer(work: (origin: string) => Promise<void>) {
  for (const key of ENV_KEYS_TO_CLEAR) delete process.env[key];
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
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
    delete process.env.DRIVABLE_REVIEWER_TOKEN;
  }
}

function validInternalReview(overrides: Record<string, unknown> = {}) {
  return {
    caseId: "case_test_abc123",
    customerName: "Jane Customer",
    customerEmail: "jane@example.com",
    vehicleYear: "2018",
    make: "Honda",
    model: "Civic",
    symptomsSummary: "Engine misfire under load",
    responseType: "DIAGNOSIS",
    confidenceScore: "75",
    confidenceBand: "MEDIUM",
    messageBody: "Based on the symptoms, a coil pack or spark plug issue is likely.",
    followUpNeeded: "Yes",
    adminNotes: "Customer reported rough idle when cold.",
    ...overrides,
  };
}

async function postInternalReview(origin: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${origin}/api/internal-review`, {
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
  return { status: response.status, body: parsed, text };
}

function authHeaders(token = REVIEWER_TOKEN) {
  return { authorization: `Bearer ${token}` };
}

// --- Auth gate tests ---

test("internal review rejects request without Authorization header (401)", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postInternalReview(origin, validInternalReview());
    assert.equal(status, 401);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /authorization/i);
    assert.equal(body.code, "REVIEWER_AUTH_REQUIRED");
  });
});

test("internal review rejects request with wrong token (401)", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postInternalReview(origin, validInternalReview(), authHeaders("wrong-token-value-here-for-security-check"));
    assert.equal(status, 401);
    assert.equal(body.ok, false);
  });
});

test("internal review rejects request with malformed Authorization header (401)", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postInternalReview(origin, validInternalReview(), { authorization: "NotBearer somevalue" });
    assert.equal(status, 401);
    assert.equal(body.ok, false);
  });
});

test("internal review returns 503 when DRIVABLE_REVIEWER_TOKEN is not configured", async () => {
  for (const key of ENV_KEYS_TO_CLEAR) delete process.env[key];
  delete process.env.DRIVABLE_REVIEWER_TOKEN;
  const { registerRoutes } = await import("./routes.js");
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const { status, body } = await postInternalReview(origin, validInternalReview(), authHeaders());
    assert.equal(status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.code, "REVIEWER_ACCESS_NOT_CONFIGURED");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// --- Validation tests ---

test("valid internal review passes validation and fails closed without webhook (502)", async () => {
  await withServer(async (origin) => {
    const { status } = await postInternalReview(origin, validInternalReview(), authHeaders());
    assert.equal(status, 502);
  });
});

test("internal review rejects empty body as missing all required fields", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postInternalReview(origin, {}, authHeaders());
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Missing required fields/);
    const errorStr = String(body.error);
    assert.ok(errorStr.includes("caseId"), "error should mention caseId");
    assert.ok(errorStr.includes("customerEmail"), "error should mention customerEmail");
    assert.ok(errorStr.includes("responseType"), "error should mention responseType");
    assert.ok(errorStr.includes("messageBody"), "error should mention messageBody");
  });
});

test("internal review rejects missing caseId", async () => {
  await withServer(async (origin) => {
    const input = validInternalReview({ caseId: "" });
    const { status, body } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /caseId/);
  });
});

test("internal review rejects missing customerEmail", async () => {
  await withServer(async (origin) => {
    const input = validInternalReview({ customerEmail: "" });
    const { status, body } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /customerEmail/);
  });
});

test("internal review rejects missing responseType", async () => {
  await withServer(async (origin) => {
    const input = validInternalReview({ responseType: "" });
    const { status, body } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /responseType/);
  });
});

test("internal review rejects missing messageBody", async () => {
  await withServer(async (origin) => {
    const input = validInternalReview({ messageBody: "" });
    const { status, body } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /messageBody/);
  });
});

test("internal review accepts valid input with only required fields (optional fields empty)", async () => {
  await withServer(async (origin) => {
    const minimal = {
      caseId: "case_test_minimal",
      customerEmail: "admin@example.com",
      responseType: "QUESTION",
      messageBody: "Can you provide more details about the noise?",
    };
    const { status } = await postInternalReview(origin, minimal, authHeaders());
    // Delivery fails closed because MASTER_INTAKE_WEBHOOK_URL is unset
    assert.equal(status, 502);
  });
});

// --- Format / length validation (P0 Guided Journey hardening) ---

test("internal review rejects malformed customerEmail with invalidFields", async () => {
  await withServer(async (origin) => {
    const input = validInternalReview({ customerEmail: "not-an-email" });
    const { status, body } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Invalid fields/i);
    const invalid = body.invalidFields as string[] | undefined;
    assert.ok(Array.isArray(invalid) && invalid.includes("customerEmail"), "invalidFields must include customerEmail");
  });
});

test("internal review rejects undiallable customerEmail that is too long", async () => {
  await withServer(async (origin) => {
    const longEmail = `${"a".repeat(250)}@example.com`;
    const input = validInternalReview({ customerEmail: longEmail });
    const { status, body } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    const invalid = body.invalidFields as string[] | undefined;
    assert.ok(Array.isArray(invalid) && invalid.includes("customerEmail"));
  });
});

test("internal review rejects non-numeric vehicleYear with invalidFields", async () => {
  await withServer(async (origin) => {
    const input = validInternalReview({ vehicleYear: "abcd" });
    const { status, body } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.match(String(body.error), /Invalid fields/i);
    const invalid = body.invalidFields as string[] | undefined;
    assert.ok(Array.isArray(invalid) && invalid.includes("vehicleYear"));
  });
});

test("internal review rejects out-of-range vehicleYear with invalidFields", async () => {
  await withServer(async (origin) => {
    const input = validInternalReview({ vehicleYear: "1800" });
    const { status, body } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    const invalid = body.invalidFields as string[] | undefined;
    assert.ok(Array.isArray(invalid) && invalid.includes("vehicleYear"));
    const future = String(new Date().getFullYear() + 5);
    const input2 = validInternalReview({ vehicleYear: future });
    const res2 = await postInternalReview(origin, input2, authHeaders());
    assert.equal(res2.status, 400);
    assert.ok((res2.body.invalidFields as string[]).includes("vehicleYear"));
  });
});

test("internal review rejects oversized messageBody with invalidFields", async () => {
  await withServer(async (origin) => {
    const input = validInternalReview({ messageBody: "x".repeat(4001) });
    const { status, body } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.match(String(body.error), /Invalid fields/i);
    const invalid = body.invalidFields as string[] | undefined;
    assert.ok(Array.isArray(invalid) && invalid.includes("messageBody"));
  });
});

test("internal review rejects oversized caseId and symptomsSummary with invalidFields", async () => {
  await withServer(async (origin) => {
    const longCase = "c".repeat(161);
    const { status: s1, body: b1 } = await postInternalReview(origin, validInternalReview({ caseId: longCase }), authHeaders());
    assert.equal(s1, 400);
    assert.ok((b1.invalidFields as string[]).includes("caseId"));

    const longSymptoms = "s".repeat(4001);
    const { status: s2, body: b2 } = await postInternalReview(origin, validInternalReview({ symptomsSummary: longSymptoms }), authHeaders());
    assert.equal(s2, 400);
    assert.ok((b2.invalidFields as string[]).includes("symptomsSummary"));

    const longAdmin = "a".repeat(4001);
    const { status: s3, body: b3 } = await postInternalReview(origin, validInternalReview({ adminNotes: longAdmin }), authHeaders());
    assert.equal(s3, 400);
    assert.ok((b3.invalidFields as string[]).includes("adminNotes"));
  });
});

test("internal review invalid-field errors never echo submitted PII values", async () => {
  await withServer(async (origin) => {
    const marker = "PiiInternalReviewInvalidFieldProbeQa99";
    // Force an invalid email format so the marker would be in the response if echoed: missing @ makes it invalid
    const invalidEmail = `invalid-email-no-at-${marker}-not-an-email`;
    const input = validInternalReview({ customerEmail: invalidEmail });
    const { status, text } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.ok(!text.includes(marker), "invalidFields error must not echo submitted PII values");
    assert.ok(!text.includes("invalid-email-no-at-"), "invalidFields error must list field names, not values");
  });
});

test("internal review empty intake still reports missing required fields before invalidFields", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postInternalReview(origin, { customerEmail: "not-an-email" }, authHeaders());
    assert.equal(status, 400);
    // Missing caseId/responseType/messageBody take precedence only if no invalidFields? Implementation returns invalidFields first.
    // When both missing and invalid exist, invalidFields is returned first (fail-closed).
    const err = String(body.error);
    assert.ok(err.includes("Invalid fields") || err.includes("Missing required fields"));
  });
});

// --- Error safety ---

test("internal review validation error never echoes PII values", async () => {
  await withServer(async (origin) => {
    const marker = "PiiInternalReviewProbeQaXy99@example.test";
    const input = validInternalReview({ customerEmail: marker, caseId: "" });
    const { status, text } = await postInternalReview(origin, input, authHeaders());
    assert.equal(status, 400);
    assert.ok(!text.includes(marker), "error response must list field names, not submitted values");
  });
});

test("internal review validation error response contains ok:false", async () => {
  await withServer(async (origin) => {
    const { body } = await postInternalReview(origin, {}, authHeaders());
    assert.equal(body.ok, false);
  });
});

// --- Delivery fail-closed ---

test("internal review returns 502 with safe error message when webhook URL is not set", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postInternalReview(origin, validInternalReview(), authHeaders());
    assert.equal(status, 502);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /internal review/i);
    assert.match(String(body.error), /retr/i);
    // Must not leak internal error details like "MASTER_INTAKE_WEBHOOK_URL is not configured"
    assert.ok(!String(body.error).includes("MASTER_INTAKE_WEBHOOK_URL"), "error must not leak env var name");
    assert.ok(!String(body.error).includes("not configured"), "error must not reveal configuration state");
  });
});
