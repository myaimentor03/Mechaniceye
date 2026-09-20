import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceMetadata, buildInputTypes, insertPublicDiagnosisCaseToDb } from "./public-case-db.js";

const BASE_INPUT = {
  description: "Engine shakes at idle",
  timing: "When warm",
  vehicleInfo: "2014 Ford Focus",
};

test("public case DB insert fails closed when no database is configured", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const result = await insertPublicDiagnosisCaseToDb(
      { id: "case-fails-closed", description: BASE_INPUT.description },
      BASE_INPUT,
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(result.id, "case-fails-closed");
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
    assert.doesNotMatch(result.error, /postgres(ql)?:\/\/[^\s]+/i);
  } finally {
    if (original) process.env.DATABASE_URL = original;
  }
});

test("public case DB insert refuses a case with no id", async () => {
  const result = await insertPublicDiagnosisCaseToDb({ description: "no id here" }, BASE_INPUT);
  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.id, undefined);
  assert.equal(result.error, "Public diagnosis case has no id");
});

test("public case DB insert redacts any database credentials echoed back", async (t) => {
  await t.test("error message never leaks password or full URL from the target", async () => {
    const original = process.env.DATABASE_URL;
    const leaked = "topsecret-password";
    const url = `postgres://dbuser:${leaked}@127.0.0.1:9/drivable`;
    process.env.DATABASE_URL = url;
    try {
      const result = await insertPublicDiagnosisCaseToDb(
        { id: "case-redaction", description: BASE_INPUT.description },
        BASE_INPUT,
      );
      assert.equal(result.ok, false);
      assert.equal(result.status, "failed");
      assert.ok(typeof result.error === "string" && result.error.length > 0);
      assert.doesNotMatch(result.error, /dbuser/);
      assert.doesNotMatch(result.error, new RegExp(leaked));
      assert.doesNotMatch(result.error, /postgres:\/\/[^\s]+/);
    } finally {
      if (original) process.env.DATABASE_URL = original;
      else delete process.env.DATABASE_URL;
    }
  });
});

test("buildInputTypes lists only evidence actually present", () => {
  const types = buildInputTypes({
    description: "written symptom",
    vehicleInfo: "2014 Ford Focus",
    photoEvidenceStatus: "Persisted",
    photoFileNames: ["engine-bay.jpg"],
    audioEvidenceStatus: "none",
    vibrationEvidenceStatus: "Persisted",
    vibrationFileNames: ["vibration-run-1.json"],
  });
  assert.deepEqual(types, ["written", "photo", "vibration"]);
});

test("buildInputTypes omits missing, 'none', and 'not provided' evidence", () => {
  const types = buildInputTypes({
    description: "written symptom",
    vehicleInfo: "2014 Ford Focus",
    photoEvidenceStatus: "none",
    audioEvidenceStatus: "Not provided",
    videoEvidenceStatus: "not_provided",
    vibrationData: null,
  });
  assert.deepEqual(types, ["written"]);
});

test("buildEvidenceMetadata returns normalized file-name arrays and version", () => {
  const metadata = buildEvidenceMetadata({
    description: "engine shakes",
    vehicleInfo: "2014 Ford Focus",
    photoFileNames: ["a.jpg", "", "b.jpg"],
    audioFileNames: undefined,
    videoFileNames: null as unknown as string[],
    vibrationFileNames: ["vib.json"],
    evidenceVersion: "3",
  });
  assert.deepEqual(metadata.photoFileNames, ["a.jpg", "b.jpg"]);
  assert.deepEqual(metadata.audioFileNames, []);
  assert.deepEqual(metadata.videoFileNames, []);
  assert.deepEqual(metadata.vibrationFileNames, ["vib.json"]);
  assert.equal(metadata.evidenceVersion, "3");
});

test("buildEvidenceMetadata omits evidenceVersion when blank", () => {
  const metadata = buildEvidenceMetadata({
    description: "engine shakes",
    vehicleInfo: "2014 Ford Focus",
  });
  assert.deepEqual(metadata.photoFileNames, []);
  assert.equal("evidenceVersion" in metadata, false);
});