import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mapDiagnosisRowToRecord, storage } from "./storage.js";

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-db-1",
    userId: "user-1",
    vehicleInfo: "2014 Ford Focus",
    description: "Engine shakes at idle",
    timing: "When warm",
    audioFile: null,
    videoFile: null,
    vibrationData: { vibration: true },
    primaryDiagnosis: { title: "Motor mount wear", confidence: 78 },
    alternativeScenarios: [{ title: "Spark plugs" }],
    needsMoreInfo: false,
    additionalQuestions: null,
    iterationCount: 2,
    isResolved: false,
    mechanicConsultationId: null,
    confidenceScore: 78,
    confidenceLevel: "medium",
    inputTypes: ["written", "vibration"],
    createdAt: new Date("2026-09-02T10:00:00.000Z"),
    ...overrides,
  } as any;
}

test("mapDiagnosisRowToRecord translates the drizzle diagnosis row into the storage record shape", () => {
  const record = mapDiagnosisRowToRecord(dbRow());
  assert.equal(record.id, "case-db-1");
  assert.equal(record.userId, "user-1");
  assert.equal(record.vehicleInfo, "2014 Ford Focus");
  assert.equal(record.createdAt, "2026-09-02T10:00:00.000Z");
  assert.equal(record.confidenceLevel, "medium");
  assert.deepEqual(record.inputTypes, ["written", "vibration"]);
  assert.equal(record.primaryDiagnosis?.title, "Motor mount wear");
  assert.equal(record.status, "received");
});

test("mapDiagnosisRowToRecord keeps resolved cases visible and tolerates null JSON columns", () => {
  const record = mapDiagnosisRowToRecord(
    dbRow({
      isResolved: true,
      primaryDiagnosis: null,
      alternativeScenarios: null,
      inputTypes: null,
      createdAt: null,
    }),
  );
  assert.equal(record.status, "resolved");
  assert.equal(record.primaryDiagnosis ?? null, null);
  assert.deepEqual(record.alternativeScenarios, []);
  assert.deepEqual(record.inputTypes, []);
  assert.equal(typeof record.createdAt, "string");
  assert.ok(record.createdAt.length > 0);
});

test("LocalStorage getDiagnosis fails open to in-memory-only when no database is configured", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const created = await storage.createDiagnosis({
      id: "case-local-1",
      description: "local only",
      vehicleInfo: "2015 Toyota Camry",
      timing: "Always",
    });
    const found = await storage.getDiagnosis("case-local-1");
    assert.equal(found?.id, created.id);
    const missing = await storage.getDiagnosis("does-not-exist");
    assert.equal(missing, null);
  } finally {
    if (original) process.env.DATABASE_URL = original;
    else delete process.env.DATABASE_URL;
  }
});

test("LocalStorage getRecentDiagnoses returns in-memory records without a database", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    await storage.createDiagnosis({
      id: "case-recent-1",
      description: "recent local case",
      vehicleInfo: "2016 Honda Civic",
      timing: "Cold start",
    });
    const recent = await storage.getRecentDiagnoses(10);
    assert.ok(recent.some((record) => record.id === "case-recent-1"));
  } finally {
    if (original) process.env.DATABASE_URL = original;
    else delete process.env.DATABASE_URL;
  }
});

test("follow-up records have unique IDs and remain readable in local development mode", async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  const caseId = `follow-up-local-${randomUUID()}`;
  try {
    const first = await storage.createFollowUp({
      originalDiagnosisId: caseId,
      userId: "follow-up-owner",
      additionalInfo: "The symptom continued after the repair attempt.",
    });
    const second = await storage.createFollowUp({
      originalDiagnosisId: caseId,
      userId: "follow-up-owner",
      additionalInfo: "A second observation after another drive.",
    });
    assert.notEqual(first.id, second.id);
    assert.deepEqual(
      (await storage.getFollowUpsByDiagnosis(caseId)).map((record) => record.id),
      [first.id, second.id],
    );
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("createFollowUpAndDiagnosis stores both records together in local mode", async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  const caseId = `follow-up-atomic-${randomUUID()}`;
  try {
    const created = await storage.createFollowUpAndDiagnosis(
      {
        originalDiagnosisId: caseId,
        userId: "atomic-owner",
        additionalInfo: "The symptom continued after the repair attempt.",
      },
      {
        userId: "atomic-owner",
        description: "Follow-up diagnosis result",
        iterationCount: 2,
      },
    );
    assert.equal(created.followUp.originalDiagnosisId, caseId);
    assert.equal(created.diagnosis.iterationCount, 2);
    assert.ok((await storage.getFollowUpsByDiagnosis(caseId)).some((item) => item.id === created.followUp.id));
    assert.equal((await storage.getDiagnosis(created.diagnosis.id))?.id, created.diagnosis.id);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("production diagnosis and follow-up writes fail closed without PostgreSQL", async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(storage.createDiagnosis({ id: "production-no-db-diagnosis" }));
    await assert.rejects(storage.createFollowUp({
      originalDiagnosisId: "production-no-db-case",
      userId: "production-no-db-user",
      additionalInfo: "Must not silently fall back to memory.",
    }));
    await assert.rejects(storage.createFollowUpAndDiagnosis(
      { originalDiagnosisId: "production-no-db-case", userId: "production-no-db-user" },
      { userId: "production-no-db-user" },
    ));
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
