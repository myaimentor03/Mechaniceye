import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_COUNT,
  validatePhotoFiles,
} from "./photoValidation";

function photo(name: string, type = "image/jpeg", size = 1024) {
  return { name, type, size };
}

test("accepts valid photos within count and size limits", () => {
  const result = validatePhotoFiles(
    [photo("dash.jpg"), photo("tire.png", "image/png")],
    0,
  );
  assert.equal(result.validFiles.length, 2);
  assert.equal(result.errors.length, 0);
});

test("rejects unsupported file types with a truthful message", () => {
  const result = validatePhotoFiles([photo("notes.pdf", "application/pdf")], 0);
  assert.equal(result.validFiles.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Unsupported file type/);
  assert.match(result.errors[0], /JPEG, PNG, WebP, or HEIC/);
});

test("rejects oversize photos with the 12 MB limit message", () => {
  const result = validatePhotoFiles(
    [photo("huge.jpg", "image/jpeg", MAX_PHOTO_BYTES + 1)],
    0,
  );
  assert.equal(result.validFiles.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /max 12 MB/);
});

test("caps total photos at the server limit and keeps the earliest picks", () => {
  const candidates = Array.from({ length: 5 }, (_, i) =>
    photo(`photo-${i}.jpg`),
  );
  const result = validatePhotoFiles(candidates, MAX_PHOTO_COUNT - 2);
  assert.equal(result.validFiles.length, 2);
  assert.deepEqual(
    result.validFiles.map((f) => f.name),
    ["photo-0.jpg", "photo-1.jpg"],
  );
  assert.ok(
    result.errors.some((message) =>
      message.includes(`Maximum ${MAX_PHOTO_COUNT} photos`),
    ),
  );
});

test("rejects everything when the case already holds the maximum", () => {
  const result = validatePhotoFiles([photo("extra.jpg")], MAX_PHOTO_COUNT);
  assert.equal(result.validFiles.length, 0);
  assert.ok(
    result.errors.some((message) => message.includes("Photo limit reached")),
  );
});

test("keeps contract constants aligned with the server photo limits", () => {
  assert.equal(MAX_PHOTO_COUNT, 8);
  assert.equal(MAX_PHOTO_BYTES, 12 * 1024 * 1024);
  assert.deepEqual([...ALLOWED_PHOTO_TYPES].sort(), [
    "image/heic",
    "image/heif",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
});
