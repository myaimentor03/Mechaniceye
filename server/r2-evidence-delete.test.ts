import assert from "node:assert/strict";
import test from "node:test";
import {
  EVIDENCE_KEY_PATTERN,
  isSafeEvidenceKey,
  deleteEvidenceKeysWithClient,
  type StoredEvidenceKeys,
} from "./r2-evidence-storage.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

function makeClient() {
  const deleted: string[] = [];
  const store = {
    bucket: "mechanicseye-evidence-test",
    deleted,
    async send(command: any) {
      if (command.constructor.name === "DeleteObjectCommand") {
        deleted.push(command.input.Key as string);
      }
      return {};
    },
  };
  return store;
}

test("EVIDENCE_KEY_PATTERN accepts valid case-scoped keys with dotted case IDs", () => {
  const valid = [
    "evidence/CASE-20260902000000000-123/photos/123e4567-e89b-12d3-a456-426614174000.jpg",
    "evidence/CASE.WITH.DOTS_123-abc/video/123e4567-e89b-12d3-a456-426614174001.mp4",
    "evidence/A1/audio/123e4567-e89b-12d3-a456-426614174002.m4a",
    "evidence/Ab_c-1.2.3/vibration/123e4567-e89b-12d3-a456-426614174003.bin",
  ];
  for (const key of valid) {
    assert.equal(isSafeEvidenceKey(key), true, `should accept ${key}`);
    assert.match(key, EVIDENCE_KEY_PATTERN);
  }
});

test("EVIDENCE_KEY_PATTERN rejects traversal, wrong prefix, and malformed UUID/extension", () => {
  const invalid = [
    "evidence/../escape/photos/123e4567-e89b-12d3-a456-426614174000.jpg",
    "evidence/CASE-123/../photos/123e4567-e89b-12d3-a456-426614174000.jpg",
    "evidence/CASE-123/photos/../../etc/passwd",
    "evidence/CASE-123/photos/123e4567-e89b-12d3-a456-426614174000", // no extension
    "evidence/CASE-123/photos/not-a-uuid.jpg",
    "evidence/CASE-123/evil/123e4567-e89b-12d3-a456-426614174000.jpg", // field not allowlisted
    "evidence/CASE-123/photos/123e4567-e89b-12d3-a456-426614174000.jpg/extra",
    "evidence/-CASE/photos/123e4567-e89b-12d3-a456-426614174000.jpg", // leading dash
    "evidence/CASE-/photos/123e4567-e89b-12d3-a456-426614174000.jpg", // trailing dash
    "evidence/CASE..ID/photos/123e4567-e89b-12d3-a456-426614174000.jpg",
    "evidence//photos/123e4567-e89b-12d3-a456-426614174000.jpg",
    "uploads/evidence/CASE-123/photos/123e4567-e89b-12d3-a456-426614174000.jpg",
    "evidence/CASE-123/photos/123e4567-e89b-12d3-a456-426614174000.jpg ", // trailing space
    "evidence/CASE:inject/photos/123e4567-e89b-12d3-a456-426614174000.jpg",
  ];
  for (const key of invalid) {
    assert.equal(isSafeEvidenceKey(key), false, `should reject ${key}`);
  }
});

test("previous weak pattern would incorrectly accept invalid keys — strict pattern blocks them (regression)", () => {
  // The old regex /^evidence\/[A-Za-z0-9_-]+\/[a-z]+\// would accept these:
  const wouldHavePassedWeak = [
    "evidence/CASE-123/evil/anything",
    "evidence/CASE-123/photos/../../hack",
  ];
  // New pattern must reject them
  for (const key of wouldHavePassedWeak) {
    assert.equal(isSafeEvidenceKey(key), false);
  }
  // It would also reject a dotted case ID which should be accepted
  const dotted = "evidence/CASE.WITH.DOTS/photos/123e4567-e89b-12d3-a456-426614174000.jpg";
  assert.equal(isSafeEvidenceKey(dotted), true, "dotted case ID should be accepted by strict pattern but was rejected by weak");
});

test("deleteEvidenceKeysWithClient only deletes safe keys and ignores traversal", async () => {
  const store = makeClient();
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  const safe1 = `evidence/CASE-123/photos/${uuid}.jpg`;
  const safe2 = `evidence/CASE-123/audio/${uuid}.m4a`;
  const unsafe = [
    "evidence/CASE-123/../escape.jpg",
    "evidence/CASE-123/evil/" + uuid + ".jpg",
    "../../../etc/passwd",
    "evidence/CASE-123/photos/not-a-uuid.jpg",
  ];
  await deleteEvidenceKeysWithClient([safe1, ...unsafe, safe2], store);
  assert.deepEqual(store.deleted.sort(), [safe1, safe2].sort());
});

test("deleteEvidenceKeysWithClient is a no-op for empty input (no R2 call, no throw)", async () => {
  const store = makeClient();
  await deleteEvidenceKeysWithClient([], store);
  assert.equal(store.deleted.length, 0);
  await deleteEvidenceKeysWithClient(["not-safe", "evidence/bad"], store);
  assert.equal(store.deleted.length, 0);
});

test("deleteEvidenceKeysWithClient supports dotted case IDs that previous weak regex would leak (orphan prevention)", async () => {
  const store = makeClient();
  const uuid = "123e4567-e89b-12d3-a456-426614174001";
  const dottedKey = `evidence/CASE.WITH.DOTS-123/photos/${uuid}.jpg`;
  assert.equal(isSafeEvidenceKey(dottedKey), true);
  await deleteEvidenceKeysWithClient([dottedKey], store);
  assert.equal(store.deleted.length, 1);
  assert.equal(store.deleted[0], dottedKey);
});

test("deleteEvidenceKeysWithClient tolerates idempotent re-delete (allSettled, no throw on already-deleted)", async () => {
  const store = makeClient();
  const uuid = "123e4567-e89b-12d3-a456-426614174002";
  const key = `evidence/CASE-999/photos/${uuid}.jpg`;
  await deleteEvidenceKeysWithClient([key], store);
  await deleteEvidenceKeysWithClient([key], store);
  assert.equal(store.deleted.length, 2, "both deletes attempted via allSettled");
});
