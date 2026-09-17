import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_AUDIO_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_COUNT,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_COUNT,
  baseMimeType,
  extensionForAudioMime,
  extensionForVideoMime,
  validateAudioFiles,
  validateVideoFiles,
} from "./mediaValidation";

function media(name: string, type = "audio/webm", size = 1024) {
  return { name, type, size };
}

test("strips MediaRecorder codec params so recordings pass the server allowlist", () => {
  assert.equal(baseMimeType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(baseMimeType("video/webm;codecs=vp9,opus"), "video/webm");
  assert.equal(baseMimeType("audio/mp4"), "audio/mp4");
  assert.equal(baseMimeType(""), "");
});

test("maps base MIME types to server-accepted extensions", () => {
  assert.equal(extensionForAudioMime("audio/webm"), ".webm");
  assert.equal(extensionForAudioMime("audio/mpeg"), ".mp3");
  assert.equal(extensionForVideoMime("video/webm"), ".webm");
  assert.equal(extensionForVideoMime("video/mp4"), ".mp4");
});

test("accepts valid audio within count and size limits, including codec-suffixed recorder output", () => {
  const result = validateAudioFiles(
    [media("clip.webm", "audio/webm;codecs=opus"), media("engine.mp3", "audio/mpeg")],
    0,
  );
  // Codec params are validation-relevant only via base type; File creation
  // strips them before upload, so validation must accept the base type.
  // validateAudioFiles itself normalizes via baseMimeType.
  assert.equal(result.validFiles.length, 2);
  assert.equal(result.errors.length, 0);
});

test("rejects unsupported audio types with a truthful message", () => {
  const result = validateAudioFiles([media("song.aac", "audio/aac")], 0);
  assert.equal(result.validFiles.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Unsupported audio type/);
  assert.match(result.errors[0], /MP3, WAV, M4A, WebM, or OGG/);
});

test("rejects oversize audio with the 50 MB limit message", () => {
  const result = validateAudioFiles(
    [media("long.webm", "audio/webm", MAX_AUDIO_BYTES + 1)],
    0,
  );
  assert.equal(result.validFiles.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /max 50 MB/);
});

test("caps total audio at the server limit and keeps the earliest picks", () => {
  const candidates = Array.from({ length: 5 }, (_, i) => media(`clip-${i}.webm`));
  const result = validateAudioFiles(candidates, MAX_AUDIO_COUNT - 2);
  assert.equal(result.validFiles.length, 2);
  assert.deepEqual(
    result.validFiles.map((f) => f.name),
    ["clip-0.webm", "clip-1.webm"],
  );
  assert.ok(result.errors.some((message) => message.includes(`Maximum ${MAX_AUDIO_COUNT}`)));
});

test("accepts valid video within count and size limits", () => {
  const result = validateVideoFiles(
    [media("walkaround.webm", "video/webm"), media("dash.mp4", "video/mp4")],
    0,
  );
  assert.equal(result.validFiles.length, 2);
  assert.equal(result.errors.length, 0);
});

test("rejects unsupported video types with a truthful message", () => {
  const result = validateVideoFiles([media("clip.mkv", "video/x-matroska")], 0);
  assert.equal(result.validFiles.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Unsupported video type/);
  assert.match(result.errors[0], /MP4, MOV, AVI, or WebM/);
});

test("rejects oversize video with the 100 MB limit message", () => {
  const result = validateVideoFiles(
    [media("long.mp4", "video/mp4", MAX_VIDEO_BYTES + 1)],
    0,
  );
  assert.equal(result.validFiles.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /max 100 MB/);
});

test("caps total video at the server limit", () => {
  const candidates = Array.from({ length: 5 }, (_, i) => media(`vid-${i}.mp4`, "video/mp4"));
  const result = validateVideoFiles(candidates, MAX_VIDEO_COUNT);
  assert.equal(result.validFiles.length, 0);
  assert.ok(result.errors.some((message) => message.includes("limit reached")));
});

test("keeps contract constants aligned with the server audio/video limits", () => {
  assert.equal(MAX_AUDIO_COUNT, 4);
  assert.equal(MAX_AUDIO_BYTES, 50 * 1024 * 1024);
  assert.deepEqual([...ALLOWED_AUDIO_TYPES].sort(), [
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
  ]);
  assert.equal(MAX_VIDEO_COUNT, 4);
  assert.equal(MAX_VIDEO_BYTES, 100 * 1024 * 1024);
  assert.deepEqual([...ALLOWED_VIDEO_TYPES].sort(), [
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-msvideo",
  ]);
});
