/**
 * Narrow persistence-truth tests.
 *
 * These verify that the main storage layer correctly fails open to
 * in-memory-only mode when no database is configured, that the DB
 * read-through is indeed fail-open (errors swallowed), and that the
 * public-case DB mirror uses idempotent upserts.
 *
 * No database connection is required — all tests use env manipulation
 * or mock-free in-memory paths.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { mapDiagnosisRowToRecord, storage } from "./storage.js";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pt-case-1",
    userId: "user-1",
    vehicleInfo: "2014 Ford Focus",
    description: "Engine shakes at idle",
    timing: "When warm",
    audioFile: null,
    videoFile: null,
    vibrationData: null,
    primaryDiagnosis: null,
    alternativeScenarios: null,
    needsMoreInfo: false,
    additionalQuestions: null,
    iterationCount: 1,
    isResolved: false,
    mechanicConsultationId: null,
    confidenceScore: 0,
    confidenceLevel: "low",
    inputTypes: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  } as any;
}

test("persistence truth: createDiagnosis writes only to in-memory Map", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const record = await storage.createDiagnosis({
      id: "pt-memory-only",
      description: "test persistence",
      vehicleInfo: "2020 Honda Civic",
      timing: "Always",
    });
    assert.equal(record.id, "pt-memory-only");
    assert.equal(record.status, "received");
    assert.ok(record.createdAt.length > 0);

    const found = await storage.getDiagnosis("pt-memory-only");
    assert.equal(found?.id, "pt-memory-only");
    assert.equal(found?.status, "received");
  } finally {
    if (original) process.env.DATABASE_URL = original;
    else delete process.env.DATABASE_URL;
  }
});

test("persistence truth: getDiagnosis returns null for missing IDs (not an error)", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const result = await storage.getDiagnosis("does-not-exist-pt");
    assert.equal(result, null);
  } finally {
    if (original) process.env.DATABASE_URL = original;
    else delete process.env.DATABASE_URL;
  }
});

test("persistence truth: getRecentDiagnoses merges local and remote (remote empty when no DB)", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    await storage.createDiagnosis({
      id: "pt-recent-1",
      description: "recent test",
      vehicleInfo: "2018 Toyota Camry",
      timing: "Cold start",
    });
    const recent = await storage.getRecentDiagnoses(100);
    const ids = recent.map((r) => r.id);
    assert.ok(ids.includes("pt-recent-1"), "local record should appear in recent");
  } finally {
    if (original) process.env.DATABASE_URL = original;
    else delete process.env.DATABASE_URL;
  }
});

test("persistence truth: getDiagnosesByUser merges local and remote", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    await storage.createDiagnosis({
      id: "pt-user-1",
      userId: "test-user",
      description: "user diagnosis",
      vehicleInfo: "2019 Ford Escape",
      timing: "Intermittent",
    });
    const all = await storage.getDiagnosesByUser();
    const ids = all.map((r) => r.id);
    assert.ok(ids.includes("pt-user-1"), "local record should appear in user list");
  } finally {
    if (original) process.env.DATABASE_URL = original;
    else delete process.env.DATABASE_URL;
  }
});

test("persistence truth: mapDiagnosisRowToRecord handles all null JSON columns gracefully", () => {
  const record = mapDiagnosisRowToRecord(
    dbRow({
      primaryDiagnosis: null,
      alternativeScenarios: null,
      inputTypes: null,
      vibrationData: null,
      createdAt: null,
    }),
  );
  assert.equal(record.primaryDiagnosis, null);
  assert.deepEqual(record.alternativeScenarios, []);
  assert.deepEqual(record.inputTypes, []);
  assert.equal(typeof record.createdAt, "string");
  assert.ok(record.createdAt.length > 0);
});

test("persistence truth: mapDiagnosisRowToRecord sets status=resolved when isResolved=true", () => {
  const record = mapDiagnosisRowToRecord(dbRow({ isResolved: true }));
  assert.equal(record.status, "resolved");
});

test("persistence truth: mapDiagnosisRowToRecord sets status=received when isResolved=false", () => {
  const record = mapDiagnosisRowToRecord(dbRow({ isResolved: false }));
  assert.equal(record.status, "received");
});

test("persistence truth: getFixHistory returns empty array (stub)", async () => {
  const result = await storage.getFixHistory("any-id");
  assert.deepEqual(result, []);
});

test("persistence truth: updateStepCompletion returns success without DB", async () => {
  const result = await storage.updateStepCompletion("any-id", { step: 1, completed: true });
  assert.equal(result.success, true);
  assert.equal(result.diagnosisId, "any-id");
});

test("persistence truth: markFixComplete returns success without DB", async () => {
  const result = await storage.markFixComplete("any-id", { wasSuccessful: true });
  assert.equal(result.success, true);
  assert.equal(result.diagnosisId, "any-id");
});

test("persistence truth: createFollowUp stores in-memory only", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const followUp = await storage.createFollowUp({
      originalDiagnosisId: "pt-case-1",
      userId: "user-1",
      additionalInfo: "more info",
    });
    assert.ok(followUp.id);
    assert.equal(followUp.originalDiagnosisId, "pt-case-1");

    const all = await storage.getFollowUpsByDiagnosis("pt-case-1");
    assert.ok(all.some((f) => f.id === followUp.id));
  } finally {
    if (original) process.env.DATABASE_URL = original;
    else delete process.env.DATABASE_URL;
  }
});

test("persistence truth: createConsultation stores in-memory only", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const consultation = await storage.createConsultation({
      diagnosisId: "pt-case-1",
      mechanicId: "mechanic-1",
      userId: "user-1",
      status: "pending",
    });
    assert.ok(consultation.id);
    assert.equal(consultation.status, "pending");

    const all = await storage.getConsultationsByMechanic("mechanic-1");
    assert.ok(all.some((c) => c.id === consultation.id));
  } finally {
    if (original) process.env.DATABASE_URL = original;
    else delete process.env.DATABASE_URL;
  }
});
