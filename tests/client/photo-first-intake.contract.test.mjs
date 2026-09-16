import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

test("photo-first intake blocks audio/video/vibration on client before server 415", () => {
  // Guard must exist: client prevents unsupported media selection from being submitted
  assert.match(backend, /audioFiles\.length \|\| videoFiles\.length \|\| vibrationFiles\.length/);
  assert.match(backend, /Audio, video, and vibration uploads are not available in this photo-first release/);
});

test("photo-first intake only appends photos to FormData, not unsupported fields", () => {
  assert.match(backend, /photoFiles\.forEach\(\(file\) => requestBody\.append\("photos", file, file\.name\)\)/);
  assert.doesNotMatch(backend, /requestBody\.append\("audio"/);
  assert.doesNotMatch(backend, /requestBody\.append\("video"/);
  assert.doesNotMatch(backend, /requestBody\.append\("vibration"/);
});

test("photo-first EvidenceCards do not expose actionable file inputs for unsupported media", () => {
  // Video/Audio cards must be static notes, not file pickers that would waste mobile time and hit 415
  assert.doesNotMatch(backend, /accept="video\/\*".*setVideoFiles/);
  assert.doesNotMatch(backend, /accept="audio\/\*".*setAudioFiles/);
  assert.match(backend, /Video upload will be available in a future release/);
  assert.match(backend, /Audio upload will be available in a future release/);
});
