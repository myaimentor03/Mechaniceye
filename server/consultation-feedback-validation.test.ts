import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #10 Mechanic routing).
 *
 * POST /api/consultations/:id/feedback is the write path that completes a
 * mechanic consultation and sets the mechanic's public rating, but it had
 * zero server-side test coverage and two defects:
 *
 * 1. `req.params.id` flowed raw into storage.updateConsultation — an empty,
 *    whitespace-only, or oversized id reached storage instead of failing
 *    closed with a field-named 400 (no PII echo).
 * 2. The mechanic average divided the rated sum by the TOTAL consultation
 *    count (including pending, unrated ones), so every pending ticket
 *    diluted the mechanic's public rating (e.g. one 9-star completion next
 *    to one pending ticket published 4.5).
 *
 * These HTTP-level regression tests pin the fail-closed id validation and
 * the rated-only average so a future edit cannot silently reopen either.
 */

const ENV_KEYS_TO_CLEAR = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
  "MASTER_INTAKE_WEBHOOK_URL",
] as const;

const REVIEWER_TOKEN = "consultation-feedback-test-token-secure-enough-for-gate";

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

function authHeaders(token = REVIEWER_TOKEN) {
  return { authorization: `Bearer ${token}` };
}

async function postJson(
  origin: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${origin}${path}`, {
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

function validFeedback(overrides: Record<string, unknown> = {}) {
  return {
    politenessRating: 8,
    effectivenessRating: 9,
    easeOfWorkRating: 10,
    wasFixed: false,
    feedback: "Thorough diagnosis, clear next steps.",
    ...overrides,
  };
}

async function createConsultation(
  origin: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { status, body } = await postJson(
    origin,
    "/api/consultations",
    {
      diagnosisId: `case_feedback_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      mechanicId: "mech_feedback_probe",
      userId: "user_feedback_probe",
      ...overrides,
    },
    authHeaders(),
  );
  assert.equal(status, 200);
  assert.ok(typeof body.id === "string" && (body.id as string).length > 0);
  return body.id as string;
}

async function mechanicRating(origin: string, mechanicId: string): Promise<number> {
  const response = await fetch(`${origin}/api/mechanics`);
  assert.equal(response.status, 200);
  const mechanics = (await response.json()) as Array<{ id: string; rating: number }>;
  const match = mechanics.find((m) => m.id === mechanicId);
  assert.ok(match, `mechanic ${mechanicId} must be listed`);
  return match.rating;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("consultation feedback rejects request without Authorization header (401)", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postJson(
      origin,
      "/api/consultations/some-id/feedback",
      validFeedback(),
    );
    assert.equal(status, 401);
    assert.equal(body.ok, false);
    assert.equal(body.code, "REVIEWER_AUTH_REQUIRED");
  });
});

test("consultation feedback rejects oversized consultation id with invalidFields (no echo)", async () => {
  await withServer(async (origin) => {
    const marker = "FeedbackIdProbeQaXy99";
    const oversized = `${marker}-${"i".repeat(200)}`;
    const { status, body, text } = await postJson(
      origin,
      `/api/consultations/${oversized}/feedback`,
      validFeedback(),
      authHeaders(),
    );
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.ok(Array.isArray(body.invalidFields));
    assert.ok((body.invalidFields as string[]).includes("id"));
    assert.ok(!text.includes(marker), "error response must list field names, not submitted values");
  });
});

test("consultation feedback rejects whitespace-only consultation id fail-closed", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postJson(
      origin,
      "/api/consultations/%20%20/feedback",
      validFeedback(),
      authHeaders(),
    );
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.ok((body.invalidFields as string[]).includes("id"));
  });
});

test("consultation feedback rejects out-of-range ratings fail-closed (no echo)", async () => {
  await withServer(async (origin) => {
    const id = await createConsultation(origin);
    const { status, body } = await postJson(
      origin,
      `/api/consultations/${id}/feedback`,
      validFeedback({ politenessRating: 0, effectivenessRating: 11 }),
      authHeaders(),
    );
    assert.equal(status, 400);
    assert.match(String(body.message), /Failed to submit feedback/);
    // The consultation must stay open: invalid feedback never completes it.
    const retry = await postJson(
      origin,
      `/api/consultations/${id}/feedback`,
      validFeedback(),
      authHeaders(),
    );
    assert.equal(retry.status, 200);
    assert.equal(retry.body.status, "completed");
  });
});

test("consultation feedback rejects missing ratings fail-closed", async () => {
  await withServer(async (origin) => {
    const id = await createConsultation(origin);
    const { status, body } = await postJson(
      origin,
      `/api/consultations/${id}/feedback`,
      { wasFixed: true },
      authHeaders(),
    );
    assert.equal(status, 400);
    assert.equal(body.ok, undefined, "invalid feedback keeps the legacy generic 400 shape");
  });
});

test("consultation feedback for unknown well-formed id fails closed without echo", async () => {
  await withServer(async (origin) => {
    const marker = "GhostConsultQaXy88";
    const { status, text } = await postJson(
      origin,
      `/api/consultations/${marker}-000/feedback`,
      validFeedback(),
      authHeaders(),
    );
    assert.equal(status, 400);
    assert.ok(!text.includes(marker), "not-found response must never echo the id");
  });
});

test("valid feedback completes the consultation with the correct overall score", async () => {
  await withServer(async (origin) => {
    // (8 + 9 + 10) / 3 = 9, no fix bonus.
    const plainId = await createConsultation(origin);
    const plain = await postJson(
      origin,
      `/api/consultations/${plainId}/feedback`,
      validFeedback(),
      authHeaders(),
    );
    assert.equal(plain.status, 200);
    assert.equal(plain.body.status, "completed");
    assert.equal(plain.body.overallScore, "9");

    // (9 + 9 + 9) / 3 = 9, fix bonus capped at 10.
    await sleep(5);
    const fixedId = await createConsultation(origin);
    const fixed = await postJson(
      origin,
      `/api/consultations/${fixedId}/feedback`,
      validFeedback({ politenessRating: 9, effectivenessRating: 9, easeOfWorkRating: 9, wasFixed: true }),
      authHeaders(),
    );
    assert.equal(fixed.status, 200);
    assert.equal(fixed.body.overallScore, "10");
  });
});

test("padded consultation id is trimmed before lookup", async () => {
  await withServer(async (origin) => {
    const id = await createConsultation(origin);
    const { status, body } = await postJson(
      origin,
      `/api/consultations/${encodeURIComponent(`  ${id}  `)}/feedback`,
      validFeedback(),
      authHeaders(),
    );
    assert.equal(status, 200);
    assert.equal(body.status, "completed");
  });
});

test("mechanic rating averages rated consultations only (pending tickets do not dilute)", async () => {
  await withServer(async (origin) => {
    // One completion scoring (8 + 9 + 10) / 3 = 9 beside one pending ticket
    // for the seeded mechanic must publish 9 — not 9 / 2 = 4.5.
    const ratedId = await createConsultation(origin, { mechanicId: "mechanic-1" });
    await sleep(5);
    await createConsultation(origin, { mechanicId: "mechanic-1" });
    const completed = await postJson(
      origin,
      `/api/consultations/${ratedId}/feedback`,
      validFeedback(),
      authHeaders(),
    );
    assert.equal(completed.status, 200);
    assert.equal(await mechanicRating(origin, "mechanic-1"), 9);
  });
});
