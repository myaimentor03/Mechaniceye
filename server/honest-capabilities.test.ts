import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { CapabilityNotAvailableError, storage } from "./storage.js";

/**
 * Regression cover for silent-success paths: these operations previously
 * returned `success: true` (or an empty list) after storing nothing, which told
 * a reviewer that work was recorded when it was discarded.
 */

const S3_VARS = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
  "MASTER_INTAKE_WEBHOOK_URL",
] as const;

const REVIEWER_TOKEN = "honest-storage-review-token-that-is-long-enough-for-scrypt";

async function withServer(work: (origin: string) => Promise<void>) {
  const priorToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  for (const key of S3_VARS) delete process.env[key];
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  const { registerRoutes } = await import("./routes.js");
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (priorToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = priorToken;
  }
}

function reviewerHeaders(): Record<string, string> {
  return { authorization: `Bearer ${REVIEWER_TOKEN}`, "content-type": "application/json" };
}

test("storage refuses capabilities it cannot durably perform", async () => {
  const missingDiagnosis = "JRN-does-not-exist-00000000";

  await assert.rejects(
    () => storage.getFixHistory(missingDiagnosis),
    (error: unknown) => error instanceof CapabilityNotAvailableError && error.capability === "fix_history",
  );
  await assert.rejects(
    () => storage.updateStepCompletion(missingDiagnosis, { completed: true }),
    (error: unknown) => error instanceof CapabilityNotAvailableError && error.capability === "step_completion",
  );
  await assert.rejects(
    () => storage.markFixComplete(missingDiagnosis, { wasSuccessful: true }),
    (error: unknown) => error instanceof CapabilityNotAvailableError && error.capability === "fix_completion",
  );
  await assert.rejects(
    () => storage.sendToMechanic(missingDiagnosis),
    (error: unknown) =>
      error instanceof Error && /Diagnosis not found|mechanic_delivery/.test(error.message),
  );
  await assert.rejects(
    () => storage.createConsultation({ diagnosisId: missingDiagnosis }),
    (error: unknown) => error instanceof CapabilityNotAvailableError && error.capability === "consultation_booking",
  );
  await assert.rejects(
    () => storage.updateConsultation("consultation-1", { status: "completed" }),
    (error: unknown) => error instanceof CapabilityNotAvailableError && error.capability === "consultation_update",
  );
  await assert.rejects(
    () => storage.getActiveMechanics(),
    (error: unknown) => error instanceof CapabilityNotAvailableError && error.capability === "mechanic_directory",
  );
  await assert.rejects(
    () => storage.updateMechanicRating("mechanic-1", 5),
    (error: unknown) => error instanceof CapabilityNotAvailableError && error.capability === "mechanic_rating",
  );
});

test("mechanic directory endpoint returns 501 instead of a fabricated mechanic", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/mechanics`);
    assert.equal(res.status, 501);
    const body = (await res.json()) as any;
    assert.equal(body.ok, false);
    assert.equal(body.code, "MECHANIC_DIRECTORY_NOT_AVAILABLE");
    assert.deepEqual(body.mechanics, []);
  });
});

test("unimplemented reviewer endpoints answer 501 CAPABILITY_NOT_AVAILABLE, never success", async () => {
  await withServer(async (origin) => {
    const cases: [string, RequestInit, string][] = [
      ["/api/fix-history/JRN-abc12345-00000000", { headers: reviewerHeaders() }, "fix_history"],
      [
        "/api/diagnoses/JRN-abc12345-00000000/steps",
        {
          method: "POST",
          headers: reviewerHeaders(),
          body: JSON.stringify({ suggestionIndex: 0, stepIndex: 0, completed: true }),
        },
        "step_completion",
      ],
      [
        "/api/diagnoses/JRN-abc12345-00000000/fix-complete",
        {
          method: "POST",
          headers: reviewerHeaders(),
          body: JSON.stringify({ suggestionIndex: 0, wasSuccessful: true }),
        },
        "fix_completion",
      ],
      [
        "/api/consultations",
        { method: "POST", headers: reviewerHeaders(), body: JSON.stringify({ diagnosisId: "x", mechanicId: "y" }) },
        "consultation_booking",
      ],
    ];

    for (const [path, init, capability] of cases) {
      const res = await fetch(`${origin}${path}`, init);
      assert.equal(res.status, 501, `${path} should refuse rather than claim success`);
      const body = (await res.json()) as any;
      assert.equal(body.ok, false, `${path} must not report ok`);
      assert.equal(body.code, "CAPABILITY_NOT_AVAILABLE", `${path} code`);
      assert.equal(body.capability, capability, `${path} capability`);
      assert.equal("success" in body, false, `${path} must not include a success flag`);
    }
  });
});

test("consultation feedback refuses instead of scoring a rating from an empty list", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/consultations/consultation-1/feedback`, {
      method: "POST",
      headers: reviewerHeaders(),
      body: JSON.stringify({
        politenessRating: 5,
        effectivenessRating: 5,
        easeOfWorkRating: 5,
        wasFixed: true,
      }),
    });
    assert.equal(res.status, 501);
    const body = (await res.json()) as any;
    assert.equal(body.ok, false);
    assert.equal(body.capability, "consultation_feedback");
  });
});
