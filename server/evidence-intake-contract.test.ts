import assert from "node:assert/strict";
import test from "node:test";
import { drivableEvidenceIntakeSchema, type DrivableEvidenceIntake } from "../shared/drivableEvidence.js";

function makeValidIntake(overrides: Partial<DrivableEvidenceIntake> = {}): DrivableEvidenceIntake {
  return {
    mode: "diagnose",
    vehicle: {
      year: "2015",
      make: "Toyota",
      model: "Camry",
      engine: "2.5L",
      vin: "1HGBH41JXMN109186",
      mileage: 142100,
      transmission: "Automatic",
      drivetrain: "FWD",
    },
    situation: {
      description: "Engine running rough at highway speed",
      symptoms: ["Engine running rough"],
      timing: "Highway Speed",
      urgency: "Safe to Drive",
      canDrive: "Safe to Drive",
      recentRepairs: "New spark plugs",
      buyerObservations: [],
      sellerClaims: [],
    },
    obd: {
      codes: ["P0302"],
      attachmentIds: [],
    },
    attachments: [],
    ...overrides,
  };
}

test("valid diagnose intake passes schema", () => {
  const intake = makeValidIntake();
  const parsed = drivableEvidenceIntakeSchema.parse(intake);
  assert.equal(parsed.mode, "diagnose");
  assert.equal(parsed.vehicle.year, "2015");
  assert.equal(parsed.obd.codes.length, 1);
});

test("valid buy intake passes schema", () => {
  const intake = makeValidIntake({
    mode: "buy",
    situation: {
      ...makeValidIntake().situation,
      buyerObservations: ["Brake pedal feels soft", "Tires worn unevenly"],
      askingPrice: 12500,
      titleClaim: "Clean title in hand",
      listingUrl: "https://example.com/listing/123",
    },
  });
  const parsed = drivableEvidenceIntakeSchema.parse(intake);
  assert.equal(parsed.mode, "buy");
  assert.equal(parsed.situation.buyerObservations.length, 2);
  assert.equal(parsed.situation.askingPrice, 12500);
});

test("valid sell intake passes schema", () => {
  const intake = makeValidIntake({
    mode: "sell",
    situation: {
      ...makeValidIntake().situation,
      sellerClaims: ["Recent timing belt", "New brakes"],
      askingPrice: 8500,
      titleClaim: "Clean title",
      listingUrl: "https://example.com/listing/456",
    },
  });
  const parsed = drivableEvidenceIntakeSchema.parse(intake);
  assert.equal(parsed.mode, "sell");
  assert.equal(parsed.situation.sellerClaims.length, 2);
});

test("missing mode defaults to diagnose", () => {
  const intake = makeValidIntake();
  delete (intake as any).mode;
  const parsed = drivableEvidenceIntakeSchema.parse(intake);
  assert.equal(parsed.mode, "diagnose");
});

test("invalid mode is rejected", () => {
  const intake = makeValidIntake({ mode: "invalid" as any });
  assert.throws(() => drivableEvidenceIntakeSchema.parse(intake), /mode/);
});

test("VIN must be 17 chars alphanumeric no I/O/Q", () => {
  const validVin = "1HGBH41JXMN109186";
  const invalidVins = ["1HGBH41JXMN10918", "1HGBH41JXMN10918I", "1HGBH41JXMN10918O", "1HGBH41JXMN10918Q", "not-a-vin!!"];
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, vin: validVin } })));
  for (const vin of invalidVins) {
    assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, vin } })), /vin/i);
  }
});

test("mileage must be non-negative integer", () => {
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, mileage: 0 } })));
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, mileage: 200000 } })));
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, mileage: null } })));
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, mileage: -1 } })));
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, mileage: 123.45 } })));
});

test("OBD codes must match PBCU + 4 hex digits", () => {
  const validCodes = ["P0300", "P0420", "B1234", "C5678", "U0100", "p0300"];
  const invalidCodes = ["P030", "P03000", "X0300", "P030G", "not-a-code", "P00000", "P030Z"];
  for (const code of validCodes) {
    assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ obd: { ...makeValidIntake().obd, codes: [code] } })));
  }
  for (const code of invalidCodes) {
    assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ obd: { ...makeValidIntake().obd, codes: [code] } })), /code/i);
  }
});

test("OBD codes limited to 30", () => {
  const codes = Array.from({ length: 31 }, (_, i) => `P${String(i).padStart(4, "0")}`);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ obd: { ...makeValidIntake().obd, codes } })));
  const codes30 = Array.from({ length: 30 }, (_, i) => `P${String(i).padStart(4, "0")}`);
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ obd: { ...makeValidIntake().obd, codes: codes30 } })));
});

test("symptoms limited to 50 items, each max 500 chars", () => {
  const symptoms50 = Array.from({ length: 50 }, (_, i) => `Symptom ${i}`);
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ situation: { ...makeValidIntake().situation, symptoms: symptoms50 } })));
  const symptoms51 = Array.from({ length: 51 }, (_, i) => `Symptom ${i}`);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ situation: { ...makeValidIntake().situation, symptoms: symptoms51 } })));
  const longSymptom = "x".repeat(501);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ situation: { ...makeValidIntake().situation, symptoms: [longSymptom] } })));
});

test("description limited to 4000 chars", () => {
  const longDesc = "x".repeat(4001);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ situation: { ...makeValidIntake().situation, description: longDesc } })));
  const okDesc = "x".repeat(4000);
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ situation: { ...makeValidIntake().situation, description: okDesc } })));
});

test("buyerObservations limited to 50 items, each max 1000 chars", () => {
  const obs = Array.from({ length: 50 }, (_, i) => `Obs ${i}`);
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ mode: "buy", situation: { ...makeValidIntake().situation, buyerObservations: obs } })));
  const obs51 = Array.from({ length: 51 }, (_, i) => `Obs ${i}`);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ mode: "buy", situation: { ...makeValidIntake().situation, buyerObservations: obs51 } })));
});

test("sellerClaims limited to 50 items, each max 1000 chars", () => {
  const claims = Array.from({ length: 50 }, (_, i) => `Claim ${i}`);
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ mode: "sell", situation: { ...makeValidIntake().situation, sellerClaims: claims } })));
  const claims51 = Array.from({ length: 51 }, (_, i) => `Claim ${i}`);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ mode: "sell", situation: { ...makeValidIntake().situation, sellerClaims: claims51 } })));
});

test("attachments limited to 50 items", () => {
  const attachments = Array.from({ length: 50 }, (_, i) => ({
    id: `att-${i}`,
    caseId: "case-1",
    kind: "photo" as const,
    originalName: `photo${i}.jpg`,
    mimeType: "image/jpeg",
    byteSize: 1024,
    status: "persisted" as const,
    serverAttachmentId: `srv-${i}`,
    storageKey: `evidence/case-1/photo${i}.jpg`,
    createdAt: new Date().toISOString(),
    provenance: "customer_observation" as const,
    analysisStatus: "uploaded_not_analyzed" as const,
    notes: undefined,
  }));
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments })));
  const attachments51 = [...attachments, { ...attachments[0], id: "att-50" }];
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: attachments51 })));
});

test("photo-first release: attachment kind must be from allowed enum", () => {
  const validKinds = ["photo", "audio", "video", "document", "obd_screenshot", "sensor_session"];
  for (const kind of validKinds) {
    const attachment = {
      id: "att-1",
      caseId: "case-1",
      kind,
      originalName: "file.jpg",
      mimeType: "image/jpeg",
      byteSize: 1024,
      status: "persisted" as const,
      serverAttachmentId: "srv-1",
      storageKey: "evidence/case-1/file.jpg",
      createdAt: new Date().toISOString(),
      provenance: "customer_observation" as const,
      analysisStatus: "uploaded_not_analyzed" as const,
      notes: undefined,
    };
    assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [attachment] })));
  }
});

test("attachment requires all mandatory fields", () => {
  const attachment = {
    id: "att-1",
    caseId: "case-1",
    kind: "photo" as const,
    originalName: "photo.jpg",
    mimeType: "image/jpeg",
    byteSize: 1024,
    status: "persisted" as const,
    serverAttachmentId: "srv-1",
    storageKey: "evidence/case-1/photo.jpg",
    createdAt: new Date().toISOString(),
    provenance: "customer_observation" as const,
    analysisStatus: "uploaded_not_analyzed" as const,
    notes: undefined,
  };
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [attachment] })));
  const missingId = { ...attachment, id: "" };
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [missingId] })));
  const missingCaseId = { ...attachment, caseId: "" };
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [missingCaseId] })));
  const badByteSize = { ...attachment, byteSize: 0 };
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [badByteSize] })));
});

test("vehicle identity fields have length limits", () => {
  const longMake = "x".repeat(81);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, make: longMake } })));
  const longModel = "x".repeat(121);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, model: longModel } })));
  const longEngine = "x".repeat(121);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, engine: longEngine } })));
  const longVin = "1HGBH41JXMN1091867"; // 18 chars
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, vin: longVin } })));
});

test("timing and urgency fields have length limits", () => {
  const longTiming = "x".repeat(4001);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ situation: { ...makeValidIntake().situation, timing: longTiming } })));
  const longUrgency = "x".repeat(4001);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ situation: { ...makeValidIntake().situation, urgency: longUrgency } })));
});

test("listingUrl must be valid URL when provided", () => {
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ mode: "buy", situation: { ...makeValidIntake().situation, listingUrl: "https://example.com/car" } })));
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ mode: "buy", situation: { ...makeValidIntake().situation, listingUrl: "not-a-url" } })));
});

test("askingPrice must be non-negative when provided", () => {
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ mode: "buy", situation: { ...makeValidIntake().situation, askingPrice: 0 } })));
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ mode: "buy", situation: { ...makeValidIntake().situation, askingPrice: 50000 } })));
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ mode: "buy", situation: { ...makeValidIntake().situation, askingPrice: -1 } })));
});

test("trim field optional and length limited", () => {
  const intake = makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, trim: "LE" } });
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(intake));
  const longTrim = "x".repeat(121);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, trim: longTrim } })));
});

test("transmission and drivetrain optional with length limits", () => {
  const longTrans = "x".repeat(81);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, transmission: longTrans } })));
  const longDrive = "x".repeat(81);
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ vehicle: { ...makeValidIntake().vehicle, drivetrain: longDrive } })));
});

test("guided journey step 1 payload (vehicle only) passes with minimal fields", () => {
  const intake = makeValidIntake({
    vehicle: { year: "2015", make: "Toyota", model: "Camry" },
    situation: { symptoms: [], buyerObservations: [], sellerClaims: [] },
    obd: { codes: [], attachmentIds: [] },
  });
  const parsed = drivableEvidenceIntakeSchema.parse(intake);
  assert.equal(parsed.vehicle.year, "2015");
  assert.equal(parsed.vehicle.make, "Toyota");
  assert.equal(parsed.vehicle.model, "Camry");
});

test("guided journey step 2 payload (situation + evidence) passes with required fields", () => {
  const intake = makeValidIntake({
    situation: {
      description: "Rough idle",
      symptoms: ["Engine running rough"],
      timing: "Idle",
      urgency: "Safe to Drive",
      canDrive: "Safe to Drive",
      recentRepairs: "",
      buyerObservations: [],
      sellerClaims: [],
    },
  });
  const parsed = drivableEvidenceIntakeSchema.parse(intake);
  assert.ok(parsed.situation.description);
  assert.equal(parsed.situation.symptoms.length, 1);
  assert.ok(parsed.situation.timing);
  assert.ok(parsed.situation.urgency);
});

test("empty strings in optional fields are allowed and trimmed", () => {
  const intake = makeValidIntake({
    vehicle: { ...makeValidIntake().vehicle, vin: undefined, engine: "", transmission: "", drivetrain: "", trim: "" },
    situation: { ...makeValidIntake().situation, timing: "", recentRepairs: "" },
  });
  const parsed = drivableEvidenceIntakeSchema.parse(intake);
  assert.equal(parsed.vehicle.engine, "");
  assert.equal(parsed.vehicle.transmission, "");
});

test("schema strips extra unknown fields", () => {
  const intake = makeValidIntake({ extraField: "not allowed" } as any);
  const parsed = drivableEvidenceIntakeSchema.parse(intake);
  assert.equal((parsed as any).extraField, undefined);
});

test("photo-first release: client should not send audio/video/vibration kinds", () => {
  // The schema allows these kinds, but the photo-first release client
  // must not send them. This test documents the expected client behavior.
  const audioAttachment = {
    id: "att-1",
    caseId: "case-1",
    kind: "audio" as const,
    originalName: "note.mp3",
    mimeType: "audio/mpeg",
    byteSize: 1024,
    status: "persisted" as const,
    serverAttachmentId: "srv-1",
    storageKey: "evidence/case-1/note.mp3",
    createdAt: new Date().toISOString(),
    provenance: "customer_observation" as const,
    analysisStatus: "uploaded_not_analyzed" as const,
    notes: undefined,
  };
  // Schema accepts it (future-proof), but client contract tests should enforce photo-only
  assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [audioAttachment] })));
});

test("attachment provenance enum enforced", () => {
  const validProvenance = ["customer_observation", "buyer_observation", "seller_claim", "uploaded_media", "obd_scan", "official_context"];
  for (const prov of validProvenance) {
    const attachment = {
      id: "att-1",
      caseId: "case-1",
      kind: "photo" as const,
      originalName: "photo.jpg",
      mimeType: "image/jpeg",
      byteSize: 1024,
      status: "persisted" as const,
      serverAttachmentId: "srv-1",
      storageKey: "evidence/case-1/photo.jpg",
      createdAt: new Date().toISOString(),
      provenance: prov as any,
      analysisStatus: "uploaded_not_analyzed" as const,
      notes: undefined,
    };
    assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [attachment] })));
  }
  const badProv = { ...validProvenance[0], provenance: "invalid" };
  // This would be tested by creating an attachment with invalid provenance
  const attachmentBad = {
    id: "att-1",
    caseId: "case-1",
    kind: "photo" as const,
    originalName: "photo.jpg",
    mimeType: "image/jpeg",
    byteSize: 1024,
    status: "persisted" as const,
    serverAttachmentId: "srv-1",
    storageKey: "evidence/case-1/photo.jpg",
    createdAt: new Date().toISOString(),
    provenance: "invalid" as any,
    analysisStatus: "uploaded_not_analyzed" as const,
    notes: undefined,
  };
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [attachmentBad] })));
});

test("attachment analysisStatus enum enforced", () => {
  const validStatus = ["uploaded_not_analyzed", "analyzed"];
  for (const status of validStatus) {
    const attachment = {
      id: "att-1",
      caseId: "case-1",
      kind: "photo" as const,
      originalName: "photo.jpg",
      mimeType: "image/jpeg",
      byteSize: 1024,
      status: "persisted" as const,
      serverAttachmentId: "srv-1",
      storageKey: "evidence/case-1/photo.jpg",
      createdAt: new Date().toISOString(),
      provenance: "customer_observation" as const,
      analysisStatus: status as any,
      notes: undefined,
    };
    assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [attachment] })));
  }
  const attachmentBad = {
    id: "att-1",
    caseId: "case-1",
    kind: "photo" as const,
    originalName: "photo.jpg",
    mimeType: "image/jpeg",
    byteSize: 1024,
    status: "persisted" as const,
    serverAttachmentId: "srv-1",
    storageKey: "evidence/case-1/photo.jpg",
    createdAt: new Date().toISOString(),
    provenance: "customer_observation" as const,
    analysisStatus: "invalid" as any,
    notes: undefined,
  };
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [attachmentBad] })));
});

test("attachment status enum enforced", () => {
  const validStatus = ["persisted", "rejected", "deleted"];
  for (const status of validStatus) {
    const attachment = {
      id: "att-1",
      caseId: "case-1",
      kind: "photo" as const,
      originalName: "photo.jpg",
      mimeType: "image/jpeg",
      byteSize: 1024,
      status: status as any,
      serverAttachmentId: "srv-1",
      storageKey: "evidence/case-1/photo.jpg",
      createdAt: new Date().toISOString(),
      provenance: "customer_observation" as const,
      analysisStatus: "uploaded_not_analyzed" as const,
      notes: undefined,
    };
    assert.doesNotThrow(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [attachment] })));
  }
  const attachmentBad = {
    id: "att-1",
    caseId: "case-1",
    kind: "photo" as const,
    originalName: "photo.jpg",
    mimeType: "image/jpeg",
    byteSize: 1024,
    status: "invalid" as any,
    serverAttachmentId: "srv-1",
    storageKey: "evidence/case-1/photo.jpg",
    createdAt: new Date().toISOString(),
    provenance: "customer_observation" as const,
    analysisStatus: "uploaded_not_analyzed" as const,
    notes: undefined,
  };
  assert.throws(() => drivableEvidenceIntakeSchema.parse(makeValidIntake({ attachments: [attachmentBad] })));
});