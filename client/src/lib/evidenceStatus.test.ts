import assert from "node:assert/strict";
import test from "node:test";
import {
  failedUploadStatus,
  followUpProcessingToStatus,
  intakeSummaryToStatus,
} from "./evidenceStatus";

test("follow-up: stored modalities map to persisted, missing to not_provided", () => {
  assert.deepEqual(
    followUpProcessingToStatus({
      photo: "stored_for_human_review_not_analyzed",
      audio: "not_provided",
      video: "stored_for_human_review_not_analyzed",
      vibration: "not_provided",
    }),
    { photo: "persisted", audio: "not_provided", video: "persisted", vibration: "not_provided" },
  );
});

test("follow-up: absent or unknown processing values never claim persisted or failed", () => {
  assert.deepEqual(followUpProcessingToStatus(null), {
    photo: "not_provided",
    audio: "not_provided",
    video: "not_provided",
    vibration: "not_provided",
  });
  assert.deepEqual(followUpProcessingToStatus({ photo: "analyzed", audio: 1, video: {}, vibration: true }), {
    photo: "not_provided",
    audio: "not_provided",
    video: "not_provided",
    vibration: "not_provided",
  });
});

test("intake: summary statuses pass through, missing entries default to not_provided", () => {
  assert.deepEqual(
    intakeSummaryToStatus({
      photos: { status: "persisted" },
      audio: { status: "failed" },
      video: { status: "not_provided" },
    }),
    { photo: "persisted", audio: "failed", video: "not_provided", vibration: "not_provided" },
  );
  assert.deepEqual(intakeSummaryToStatus(undefined), {
    photo: "not_provided",
    audio: "not_provided",
    video: "not_provided",
    vibration: "not_provided",
  });
});

test("failure: only modalities with selected files surface as failed", () => {
  assert.deepEqual(failedUploadStatus({ photo: 2, audio: 0, video: 1, vibration: 0 }), {
    photo: "failed",
    audio: "not_provided",
    video: "failed",
    vibration: "not_provided",
  });
  assert.deepEqual(failedUploadStatus({ photo: 0, audio: 0, video: 0, vibration: 0 }), {
    photo: "not_provided",
    audio: "not_provided",
    video: "not_provided",
    vibration: "not_provided",
  });
});
