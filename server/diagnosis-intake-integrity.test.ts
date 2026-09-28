import assert from "node:assert/strict";
import test from "node:test";
import {
  MASTER_INTAKE_REVIEW_STATUS,
  MASTER_INTAKE_SOURCE,
  MASTER_INTAKE_SUBMISSION_STATUS,
  buildDiagnosisInput,
  buildMasterDiagnosisIntakePayload,
} from "./routes.js";

const DIAGNOSIS_CASE = {
  id: "CASE-20260928000000000-abcdef12",
  status: "received" as const,
  createdAt: "2026-09-28T00:00:00.000Z",
  vehicleInfo: "2015 Honda Civic",
  description: "Grinding noise when braking",
  timing: "Under braking",
};

test("customer submission cannot forge master intake submission or review state", () => {
  const input = buildDiagnosisInput({
    description: "Grinding noise when braking",
    source: "forged-source",
    submissionStatus: "APPROVED_FOR_RELEASE",
    reviewStatus: "APPROVED",
  });
  const payload = buildMasterDiagnosisIntakePayload(DIAGNOSIS_CASE, input);

  assert.equal(payload.source, MASTER_INTAKE_SOURCE);
  assert.equal(payload.submissionStatus, MASTER_INTAKE_SUBMISSION_STATUS);
  assert.equal(payload.reviewStatus, MASTER_INTAKE_REVIEW_STATUS);
  assert.equal(JSON.stringify(payload).includes("APPROVED_FOR_RELEASE"), false);
});

test("every server-owned intake claim ignores its request-body counterpart", () => {
  const forged: Record<string, string> = {
    source: "attacker",
    submissionStatus: "COMPLETED",
    reviewStatus: "APPROVED",
  };
  const baseline = buildMasterDiagnosisIntakePayload(
    DIAGNOSIS_CASE,
    buildDiagnosisInput({ description: "Grinding noise when braking" }),
  );
  const withForgedClaims = buildMasterDiagnosisIntakePayload(
    DIAGNOSIS_CASE,
    buildDiagnosisInput({ description: "Grinding noise when braking", ...forged }),
  );

  for (const field of Object.keys(forged)) {
    assert.equal(withForgedClaims[field as keyof typeof withForgedClaims], baseline[field as keyof typeof baseline]);
  }
});

test("client-asserted evidence presence is never recorded as a stored fact", () => {
  const input = buildDiagnosisInput({
    description: "Grinding noise when braking",
    photoEvidenceStatus: "Provided",
    audioEvidenceStatus: "Provided",
    videoEvidenceStatus: "Provided",
    vibrationEvidenceStatus: "Provided",
    photoFileNames: ["engine-bay.jpg"],
    audioFileNames: ["cold-start.mp3"],
    videoFileNames: ["drive.mp4"],
    vibrationFileNames: ["idler.wav"],
  });

  assert.equal(input.photoEvidenceStatus, "");
  assert.equal(input.audioEvidenceStatus, "");
  assert.equal(input.videoEvidenceStatus, "");
  assert.equal(input.vibrationEvidenceStatus, "");
  assert.deepEqual(input.photoFileNames, []);
  assert.deepEqual(input.audioFileNames, []);
  assert.deepEqual(input.videoFileNames, []);
  assert.deepEqual(input.vibrationFileNames, []);

  const serialized = JSON.stringify(input);
  for (const forged of [
    "Provided",
    "engine-bay.jpg",
    "cold-start.mp3",
    "drive.mp4",
    "idler.wav",
  ]) {
    assert.equal(serialized.includes(forged), false, `intake input leaked ${forged}`);
  }
});

test("server-recorded photo persistence still overrides the derived evidence facts", () => {
  // The route records persistence after `savePhotos` succeeds. That is the only
  // path allowed to set evidence presence, and it must still work.
  const input = buildDiagnosisInput({
    description: "Grinding noise when braking",
    photoEvidenceStatus: "Provided",
    photoFileNames: ["client-claimed.jpg"],
  });
  input.photoEvidenceStatus = "Persisted";
  input.photoFileNames = ["stored-1"];

  assert.equal(input.photoEvidenceStatus, "Persisted");
  assert.deepEqual(input.photoFileNames, ["stored-1"]);
  assert.equal(JSON.stringify(input).includes("client-claimed.jpg"), false);
});

test("client-supplied vibration readings are preserved as submitted data", () => {
  const input = buildDiagnosisInput({
    description: "Grinding noise when braking",
    vibrationEvidenceStatus: "Provided",
    vibrationData: { peakG: 0.42, rpm: 2400 },
  });

  assert.deepEqual(input.vibrationData, { peakG: 0.42, rpm: 2400 });
  assert.equal(input.vibrationEvidenceStatus, "");
});
