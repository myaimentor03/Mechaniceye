import assert from "node:assert/strict";
import test from "node:test";
import {
  filterSubmittableEvidence,
  isModalityAvailable,
  mediaUnavailableMessage,
  parseMediaCapabilities,
} from "./mediaAvailability";

function fileGroup() {
  const stub = (name: string) => ({ name }) as File;
  return {
    photos: [stub("dash.jpg")],
    audio: [stub("knock.webm")],
    video: [stub("rattle.webm")],
    vibration: [stub("vibration.json")],
  };
}

test("untrusted capabilities bodies default to unavailable, never open", () => {
  assert.deepEqual(parseMediaCapabilities(null), {
    photoUpload: false,
    audioUpload: false,
    videoUpload: false,
    vibrationSensorCapture: false,
  });
  assert.deepEqual(parseMediaCapabilities({}), {
    photoUpload: false,
    audioUpload: false,
    videoUpload: false,
    vibrationSensorCapture: false,
  });
  assert.deepEqual(
    parseMediaCapabilities({ photoUpload: "true", audioUpload: 1, videoUpload: 1, vibrationSensorCapture: {} }),
    {
      photoUpload: false,
      audioUpload: false,
      videoUpload: false,
      vibrationSensorCapture: false,
    },
  );
});

test("explicit true flags are honored per modality", () => {
  const parsed = parseMediaCapabilities({
    photoUpload: true,
    audioUpload: true,
    videoUpload: false,
    vibrationSensorCapture: true,
  });
  assert.equal(parsed.photoUpload, true);
  assert.equal(parsed.audioUpload, true);
  assert.equal(parsed.videoUpload, false);
  assert.equal(parsed.vibrationSensorCapture, true);
  assert.equal(isModalityAvailable("video", parsed), false);
  assert.equal(isModalityAvailable("audio", parsed), true);
});

test("unavailable modalities are stripped before submit, never silently sent", () => {
  const files = fileGroup();
  const filtered = filterSubmittableEvidence(files, {
    photoUpload: true,
    audioUpload: false,
    videoUpload: false,
    vibrationSensorCapture: true,
  });
  assert.equal(filtered.photos.length, 1);
  assert.equal(filtered.audio.length, 0);
  assert.equal(filtered.video.length, 0);
  assert.equal(filtered.vibration.length, 1);
});

test("all-available capabilities keep every selected file", () => {
  const files = fileGroup();
  const filtered = filterSubmittableEvidence(files, {
    photoUpload: true,
    audioUpload: true,
    videoUpload: true,
    vibrationSensorCapture: true,
  });
  assert.equal(filtered.photos.length, 1);
  assert.equal(filtered.audio.length, 1);
  assert.equal(filtered.video.length, 1);
  assert.equal(filtered.vibration.length, 1);
});

test("unavailable messages are truthful and never promise AI analysis", () => {
  for (const modality of ["photos", "audio", "video", "vibration"] as const) {
    const message = mediaUnavailableMessage(modality);
    assert.match(message, /temporarily unavailable/i);
    assert.doesNotMatch(message, /\bAI\b/);
  }
});
