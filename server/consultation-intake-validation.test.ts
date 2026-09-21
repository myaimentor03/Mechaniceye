import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #10 Mechanic routing).
 *
 * POST /api/consultations previously passed req.body straight into
 * storage.createConsultation, which coerces missing values to "" — so a
 * request with no diagnosisId/mechanicId/userId silently created a phantom
 * "pending" consultation keyed under an empty mechanicId, and oversized
 * payloads flowed straight into storage. There was zero server-side test
 * coverage for this route.
 *
 * These HTTP-level regression tests pin fail-closed server-side validation:
 * malformed consultation intakes get 400 with field names only (no PII echo),
 * while a valid intake still creates the consultation.
 */

const ENV_KEYS_TO_CLEAR = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
  "MASTER_INTAKE_WEBHOOK_URL",
] as const;

const REVIEWER_TOKEN = "consultation-intake-test-token-secure-enough-for-gate";

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

function validConsultation(overrides: Record<string, unknown> = {}) {
  return {
    diagnosisId: "case_test_consult_001",
    mechanicId: "mech_test_042",
    userId: "user_test_007",
    ...overrides,
  };
}

async function postConsultation(origin: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${origin}/api/consultations`, {
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

test("consultation intake rejects request without Authorization header (401)", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postConsultation(origin, validConsultation());
    assert.equal(status, 401);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /authorization/i);
    assert.equal(body.code, "REVIEWER_AUTH_REQUIRED");
  });
});

test("valid consultation intake creates a pending consultation", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postConsultation(origin, validConsultation(), authHeaders());
    assert.equal(status, 200);
    assert.ok(typeof body.id === "string" && body.id.length > 0);
    assert.equal(body.diagnosisId, "case_test_consult_001");
    assert.equal(body.mechanicId, "mech_test_042");
    assert.equal(body.userId, "user_test_007");
    assert.equal(body.status, "pending");
  });
});

test("consultation intake trims padded ids before storing", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postConsultation(
      origin,
      validConsultation({ diagnosisId: "  case_test_consult_002  " }),
      authHeaders(),
    );
    assert.equal(status, 200);
    assert.equal(body.diagnosisId, "case_test_consult_002");
  });
});

test("consultation intake rejects empty body with missing required fields", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postConsultation(origin, {}, authHeaders());
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Missing required fields/);
    assert.match(String(body.error), /diagnosisId/);
    assert.match(String(body.error), /mechanicId/);
    assert.match(String(body.error), /userId/);
  });
});

test("consultation intake rejects missing mechanicId", async () => {
  await withServer(async (origin) => {
    const { diagnosisId, userId } = validConsultation();
    const { status, body } = await postConsultation(origin, { diagnosisId, userId }, authHeaders());
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /mechanicId/);
  });
});

test("consultation intake rejects whitespace-only ids as missing", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postConsultation(
      origin,
      validConsultation({ diagnosisId: "   ", mechanicId: "  ", userId: "" }),
      authHeaders(),
    );
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Missing required fields/);
  });
});

test("consultation intake rejects non-string ids fail-closed", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postConsultation(
      origin,
      { diagnosisId: 12345, mechanicId: 67890, userId: 111213 },
      authHeaders(),
    );
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Missing required fields/);
  });
});

test("consultation intake rejects oversized diagnosisId with invalidFields", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postConsultation(
      origin,
      validConsultation({ diagnosisId: "x".repeat(161) }),
      authHeaders(),
    );
    assert.equal(status, 400);
    assert.ok(Array.isArray(body.invalidFields));
    assert.ok((body.invalidFields as string[]).includes("diagnosisId"));
  });
});

test("consultation intake rejects oversized mechanicId and userId with invalidFields", async () => {
  await withServer(async (origin) => {
    const { status: s1, body: b1 } = await postConsultation(
      origin,
      validConsultation({ mechanicId: "m".repeat(200) }),
      authHeaders(),
    );
    assert.equal(s1, 400);
    assert.ok((b1.invalidFields as string[]).includes("mechanicId"));

    const { status: s2, body: b2 } = await postConsultation(
      origin,
      validConsultation({ userId: "u".repeat(200) }),
      authHeaders(),
    );
    assert.equal(s2, 400);
    assert.ok((b2.invalidFields as string[]).includes("userId"));
  });
});

test("consultation intake invalid-field errors never echo submitted values", async () => {
  await withServer(async (origin) => {
    const marker = "PiiConsultProbeQaXy99";
    const { status, text } = await postConsultation(
      origin,
      validConsultation({ diagnosisId: marker.repeat(20) }),
      authHeaders(),
    );
    assert.equal(status, 400);
    assert.ok(!text.includes(marker), "error response must list field names, not submitted values");
  });
});
