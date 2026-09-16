import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const uploadTabs = source("client/src/components/upload-tabs.tsx");
const analysisProgress = source("client/src/components/analysis-progress.tsx");

test("upload-tabs: photo-first release does not expose audio/video/vibration tabs", () => {
  assert.doesNotMatch(uploadTabs, /\{ id: "audio"/);
  assert.doesNotMatch(uploadTabs, /\{ id: "video"/);
  assert.doesNotMatch(uploadTabs, /\{ id: "vibration"/);
});

test("upload-tabs: photo-first release does not render audio/video/vibration capture UI", () => {
  assert.doesNotMatch(uploadTabs, /Audio Capture/);
  assert.doesNotMatch(uploadTabs, /Video Capture/);
  assert.doesNotMatch(uploadTabs, /Vibration Data/);
});

test("upload-tabs: photo-first release does not import audio/video/vibration icons", () => {
  assert.doesNotMatch(uploadTabs, /import.*Mic.*from/);
  assert.doesNotMatch(uploadTabs, /import.*Video.*from/);
  assert.doesNotMatch(uploadTabs, /import.*Waves.*from/);
});

test("upload-tabs: photo-first release shows photo-only future notice", () => {
  assert.match(uploadTabs, /Audio, video, and vibration uploads will be available in a future release/);
});

test("upload-tabs: photo-first release preserves photo capture capability", () => {
  assert.match(uploadTabs, /Take Photo/);
  assert.match(uploadTabs, /capturePhoto/);
});

test("analysis-progress: photo-first steps do not reference audio processing", () => {
  assert.doesNotMatch(analysisProgress, /Processing audio data/);
  assert.doesNotMatch(analysisProgress, /Matching sound patterns/);
});

test("analysis-progress: photo-first steps reference photo evidence", () => {
  assert.match(analysisProgress, /Processing photo evidence/);
  assert.match(analysisProgress, /Analyzing vehicle condition/);
  assert.match(analysisProgress, /Generating diagnosis/);
});
