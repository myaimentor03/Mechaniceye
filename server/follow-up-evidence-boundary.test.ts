import assert from "node:assert/strict";
import test from "node:test";
import { buildFollowUpEvidenceBoundary } from "./follow-up-evidence-boundary.js";

test("only text is labeled as analyzed when media is stored for review", () => {
  const boundary = buildFollowUpEvidenceBoundary({ audioStored: true, videoStored: true });
  assert.deepEqual(boundary.analyzedInputTypes, ["description"]);
  assert.equal(boundary.evidenceProcessing.audio, "stored_for_human_review_not_analyzed");
  assert.equal(boundary.evidenceProcessing.video, "stored_for_human_review_not_analyzed");
  assert.equal(boundary.evidenceProcessing.vibration, "unsupported_not_stored");
  assert.match(boundary.analysisBoundary, /not analyzed/i);
});

test("missing media is not implied to exist", () => {
  const boundary = buildFollowUpEvidenceBoundary({ audioStored: false, videoStored: false });
  assert.equal(boundary.evidenceProcessing.audio, "not_provided");
  assert.equal(boundary.evidenceProcessing.video, "not_provided");
});
