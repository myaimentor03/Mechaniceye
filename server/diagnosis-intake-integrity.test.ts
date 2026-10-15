import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDiagnosisInput, buildMasterDiagnosisIntakePayload } from "./routes";

describe("diagnosis intake server-owned state", () => {
  it("drops client-supplied workflow state and unverified evidence claims", () => {
    const input = buildDiagnosisInput({
      source: "trusted-internal-system",
      submittedAt: "1999-01-01T00:00:00.000Z",
      submissionStatus: "APPROVED",
      reviewStatus: "REVIEW_COMPLETE",
      description: "  Grinding while braking  ",
      customerEmail: " owner@example.com ",
      vehicleYear: "2020",
      vehicleMake: "Honda",
      vehicleModel: "Civic",
      mileage: "42000",
      obdCodes: "P0300",
      vibrationData: { claimed: true },
      photoEvidenceStatus: "Persisted",
      audioEvidenceStatus: "Persisted",
      videoEvidenceStatus: "Persisted",
      vibrationEvidenceStatus: "Persisted",
      photoFileNames: ["claimed-photo.jpg"],
      audioFileNames: ["claimed-audio.mp3"],
      videoFileNames: ["claimed-video.mp4"],
      vibrationFileNames: ["claimed-vibration.json"],
    });

    assert.equal(input.source, undefined);
    assert.equal(input.submittedAt, undefined);
    assert.equal(input.submissionStatus, undefined);
    assert.equal(input.reviewStatus, undefined);
    assert.equal(input.vibrationData, undefined);
    assert.equal(input.photoEvidenceStatus, undefined);
    assert.equal(input.audioEvidenceStatus, undefined);
    assert.equal(input.videoEvidenceStatus, undefined);
    assert.equal(input.vibrationEvidenceStatus, undefined);
    assert.equal(input.photoFileNames, undefined);
    assert.equal(input.audioFileNames, undefined);
    assert.equal(input.videoFileNames, undefined);
    assert.equal(input.vibrationFileNames, undefined);

    assert.equal(input.description, "Grinding while braking");
    assert.equal(input.customerEmail, "owner@example.com");
    assert.equal(input.vehicleInfo, "2020 Honda Civic");
    assert.equal(input.mileage, "42000");
    assert.equal(input.obdCodes, "P0300");
  });

  it("uses server-owned workflow values even if an internal input is forged", () => {
    const diagnosisCase = {
      id: "case-123",
      status: "received" as const,
      createdAt: "2026-10-07T12:34:56.000Z",
      vehicleInfo: "2020 Honda Civic",
      description: "Grinding while braking",
      timing: "Under braking",
      message: "Diagnosis case received successfully",
    };
    const input = {
      ...buildDiagnosisInput({
        description: diagnosisCase.description,
        vehicleInfo: diagnosisCase.vehicleInfo,
        timing: diagnosisCase.timing,
      }),
      source: "forged-source",
      submittedAt: "1999-01-01T00:00:00.000Z",
      submissionStatus: "APPROVED",
      reviewStatus: "REVIEW_COMPLETE",
    };

    const payload = buildMasterDiagnosisIntakePayload(diagnosisCase, input);

    assert.equal(payload.source, "getdrivable-public-diagnosis-intake");
    assert.equal(payload.submissionStatus, "NEW_DIAGNOSIS_INTAKE");
    assert.equal(payload.reviewStatus, "PENDING_REVIEW");
    assert.equal(payload.submittedAt, diagnosisCase.createdAt);
    assert.equal(payload.description, diagnosisCase.description);
    assert.equal(payload.vehicleInfo, diagnosisCase.vehicleInfo);
  });
});
