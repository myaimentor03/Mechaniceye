import assert from "node:assert/strict";
import test from "node:test";
import { PrivateObjectStorageError } from "./private-object-storage.js";
import { verifyEvidenceMedia } from "./verified-evidence-media.js";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = (() => {
  const buf = new Uint8Array(16);
  buf.set([0x52, 0x49, 0x46, 0x46], 0);
  buf.set([0x00, 0x00, 0x00, 0x00], 4);
  buf.set([0x57, 0x45, 0x42, 0x50], 8);
  buf.set([0x56, 0x50, 0x38, 0x20], 12);
  return buf;
})();
const HEIC = (() => {
  const buf = new Uint8Array(16);
  buf.set([0x00, 0x00, 0x00, 0x00], 0);
  buf.set([0x66, 0x74, 0x79, 0x70], 4);
  buf.set([0x68, 0x65, 0x69, 0x63], 8);
  return buf;
})();

function throwsInvalidMedia(fn: () => void, match?: RegExp) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof PrivateObjectStorageError);
    assert.equal(err.code, "invalid_media");
    if (match) assert.match(err.message, match);
    return true;
  });
}

test("accepts valid JPEG with matching declared type", () => {
  const result = verifyEvidenceMedia(JPEG, "image/jpeg");
  assert.equal(result.mediaType, "image/jpeg");
  assert.equal(result.extension, ".jpg");
});

test("accepts valid PNG with matching declared type", () => {
  const result = verifyEvidenceMedia(PNG, "image/png");
  assert.equal(result.mediaType, "image/png");
  assert.equal(result.extension, ".png");
});

test("accepts valid WebP with matching declared type", () => {
  const result = verifyEvidenceMedia(WEBP, "image/webp");
  assert.equal(result.mediaType, "image/webp");
  assert.equal(result.extension, ".webp");
});

test("accepts valid HEIC with matching declared type", () => {
  const result = verifyEvidenceMedia(HEIC, "image/heic");
  assert.equal(result.mediaType, "image/heic");
  assert.equal(result.extension, ".heic");
});

test("accepts HEIC bytes when declared as image/heif alias", () => {
  const result = verifyEvidenceMedia(HEIC, "image/heif");
  assert.equal(result.mediaType, "image/heic");
  assert.equal(result.extension, ".heic");
});

test("accepts HEIX brand as HEIC", () => {
  const buf = new Uint8Array(16);
  buf.set([0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x78], 0);
  assert.equal(verifyEvidenceMedia(buf, "image/heic").mediaType, "image/heic");
});

test("accepts MIF1 brand as HEIC", () => {
  const buf = new Uint8Array(16);
  buf.set([0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31], 0);
  assert.equal(verifyEvidenceMedia(buf, "image/heic").mediaType, "image/heic");
});

test("normalizes MIME type parameters before comparison", () => {
  const result = verifyEvidenceMedia(JPEG, "image/jpeg; charset=binary");
  assert.equal(result.mediaType, "image/jpeg");
});

test("normalizes case in declared MIME type", () => {
  const result = verifyEvidenceMedia(PNG, "IMAGE/PNG");
  assert.equal(result.mediaType, "image/png");
});

test("rejects empty bytes with invalid_media", () => {
  throwsInvalidMedia(
    () => verifyEvidenceMedia(new Uint8Array(0), "image/jpeg"),
    /Empty/,
  );
});

test("rejects unrecognized bytes with invalid_media", () => {
  throwsInvalidMedia(
    () => verifyEvidenceMedia(new Uint8Array([0x00, 0x01, 0x02, 0x03]), "image/png"),
    /do not match/,
  );
});

test("rejects JPEG bytes declared as PNG", () => {
  throwsInvalidMedia(
    () => verifyEvidenceMedia(JPEG, "image/png"),
    /Declared media type image\/png does not match verified image\/jpeg/,
  );
});

test("rejects PNG bytes declared as JPEG", () => {
  throwsInvalidMedia(
    () => verifyEvidenceMedia(PNG, "image/jpeg"),
    /Declared media type image\/jpeg does not match verified image\/png/,
  );
});

test("rejects JPEG bytes declared as image/heif", () => {
  throwsInvalidMedia(
    () => verifyEvidenceMedia(JPEG, "image/heif"),
    /does not match/,
  );
});

test("rejects JPEG bytes with empty declared MIME type", () => {
  throwsInvalidMedia(
    () => verifyEvidenceMedia(JPEG, ""),
    /\(missing\)/,
  );
});

test("rejects JPEG-like 2-byte prefix as unrecognized", () => {
  throwsInvalidMedia(
    () => verifyEvidenceMedia(new Uint8Array([0xff, 0xd8]), "image/jpeg"),
    /do not match/,
  );
});

test("rejects incomplete RIFF+WEBP (missing WEBP marker)", () => {
  const incomplete = new Uint8Array(12);
  incomplete.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x42, 0x41, 0x44, 0x21], 0);
  throwsInvalidMedia(
    () => verifyEvidenceMedia(incomplete, "image/webp"),
    /do not match/,
  );
});

test("rejects executable content disguised as JPEG", () => {
  throwsInvalidMedia(
    () => verifyEvidenceMedia(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]), "image/jpeg"),
    /do not match/,
  );
});

test("accepts minimum valid JPEG (3 bytes ff d8 ff)", () => {
  const result = verifyEvidenceMedia(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg");
  assert.equal(result.mediaType, "image/jpeg");
});

test("returned extension matches media type for all formats", () => {
  const cases: Array<[Uint8Array, string, string, string]> = [
    [JPEG, "image/jpeg", "image/jpeg", ".jpg"],
    [PNG, "image/png", "image/png", ".png"],
    [WEBP, "image/webp", "image/webp", ".webp"],
    [HEIC, "image/heic", "image/heic", ".heic"],
  ];
  for (const [bytes, declared, expectedType, expectedExt] of cases) {
    const result = verifyEvidenceMedia(bytes, declared);
    assert.equal(result.mediaType, expectedType);
    assert.equal(result.extension, expectedExt);
  }
});
