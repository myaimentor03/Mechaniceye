import assert from "node:assert/strict";
import test from "node:test";
import { buildFollowUpEvidenceBoundary } from "./follow-up-evidence-boundary.js";

test("analyzedInputTypes includes only types actually stored when all media stored", () => {
  const boundary = buildFollowUpEvidenceBoundary({ audioStored: true, videoStored: true, vibrationStored: true });
  assert.deepEqual(boundary.analyzedInputTypes, ["description", "vibration", "audio", "video"]);
  assert.equal(boundary.evidenceProcessing.audio, "stored_for_human_review_not_analyzed");
  assert.equal(boundary.evidenceProcessing.video, "stored_for_human_review_not_analyzed");
  assert.equal(boundary.evidenceProcessing.vibration, "stored_for_human_review_not_analyzed");
  assert.match(boundary.analysisBoundary, /processed as reviewer evidence/i);
});

test("analyzedInputTypes omits types not stored when no media stored", () => {
  const boundary = buildFollowUpEvidenceBoundary({ audioStored: false, videoStored: false, vibrationStored: false });
  assert.deepEqual(boundary.analyzedInputTypes, ["description"]);
  assert.equal(boundary.evidenceProcessing.audio, "not_provided");
  assert.equal(boundary.evidenceProcessing.video, "not_provided");
  assert.equal(boundary.evidenceProcessing.vibration, "not_provided");
  assert.match(boundary.analysisBoundary, /Text details were processed\./);
});

test("analyzedInputTypes includes description plus stored types", () => {
  const boundary = buildFollowUpEvidenceBoundary({ audioStored: true, videoStored: false, vibrationStored: false });
  assert.deepEqual(boundary.analyzedInputTypes, ["description", "audio"]);
  assert.equal(boundary.evidenceProcessing.audio, "stored_for_human_review_not_analyzed");
  assert.equal(boundary.evidenceProcessing.video, "not_provided");
  assert.equal(boundary.evidenceProcessing.vibration, "not_provided");
  assert.match(boundary.analysisBoundary, /Text details were processed\./);
});
