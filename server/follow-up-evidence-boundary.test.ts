import assert from "node:assert/strict";
import test from "node:test";
import { buildFollowUpEvidenceBoundary } from "./follow-up-evidence-boundary.js";

test("received and analyzed input types distinguish stored media from processed text", () => {
  const boundary = buildFollowUpEvidenceBoundary({ photoStored: true, audioStored: true, videoStored: true, vibrationStored: true });
  assert.deepEqual(boundary.receivedInputTypes, ["description", "photo", "vibration", "audio", "video"]);
  assert.deepEqual(boundary.analyzedInputTypes, ["description"]);
  assert.equal(boundary.evidenceProcessing.photo, "stored_for_human_review_not_analyzed");
  assert.equal(boundary.evidenceProcessing.audio, "stored_for_human_review_not_analyzed");
  assert.equal(boundary.evidenceProcessing.video, "stored_for_human_review_not_analyzed");
  assert.equal(boundary.evidenceProcessing.vibration, "stored_for_human_review_not_analyzed");
  assert.match(boundary.analysisBoundary, /Stored for reviewer use and not analyzed: photos, audio, video, vibration\./i);
});

test("no-media boundary reports description as the only received and analyzed input", () => {
  const boundary = buildFollowUpEvidenceBoundary({ photoStored: false, audioStored: false, videoStored: false, vibrationStored: false });
  assert.deepEqual(boundary.receivedInputTypes, ["description"]);
  assert.deepEqual(boundary.analyzedInputTypes, ["description"]);
  assert.equal(boundary.evidenceProcessing.audio, "not_provided");
  assert.equal(boundary.evidenceProcessing.video, "not_provided");
  assert.equal(boundary.evidenceProcessing.vibration, "not_provided");
  assert.match(boundary.analysisBoundary, /Text details were processed\./);
});

test("analysis boundary names only the evidence modality that was stored", () => {
  const boundary = buildFollowUpEvidenceBoundary({ photoStored: false, audioStored: true, videoStored: false, vibrationStored: false });
  assert.deepEqual(boundary.receivedInputTypes, ["description", "audio"]);
  assert.deepEqual(boundary.analyzedInputTypes, ["description"]);
  assert.equal(boundary.evidenceProcessing.audio, "stored_for_human_review_not_analyzed");
  assert.equal(boundary.evidenceProcessing.video, "not_provided");
  assert.equal(boundary.evidenceProcessing.vibration, "not_provided");
  assert.match(boundary.analysisBoundary, /Stored for reviewer use and not analyzed: audio\./);
  assert.doesNotMatch(boundary.analysisBoundary, /photos|video|vibration/i);
});
