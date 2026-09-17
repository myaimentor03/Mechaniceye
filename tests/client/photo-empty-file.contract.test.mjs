import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

function addFilesBlock() {
  const start = backend.indexOf("const addFiles = (selected: FileList | null)");
  assert.ok(start !== -1, "PhotoPicker addFiles must exist");
  return backend.slice(start, start + 1500);
}

test("photo picker rejects 0-byte files fail-fast instead of submitting them to a server 507", () => {
  // Mobile picks can be 0 bytes (interrupted capture, cloud photo not yet
  // downloaded). The server already rejects them with 507, but the customer
  // would only learn that after completing the guided flow and uploading.
  const block = addFilesBlock();
  assert.match(block, /file\.size === 0/);
  assert.match(block, /emptyFile/);
});

test("empty-file rejection surfaces a friendly retake message via onError", () => {
  const block = addFilesBlock();
  assert.match(block, /looks empty \(0 bytes\)/);
  assert.match(block, /retake or reselect/);
  assert.match(block, /onError\(`\$\{emptyFile\.name\}/);
});

test("empty-file rejection runs before accept — the batch is not appended", () => {
  const block = addFilesBlock();
  const guardAt = block.indexOf("if (emptyFile)");
  const appendAt = block.indexOf("onChange([...files, ...incoming])");
  assert.ok(guardAt !== -1, "empty-file guard must exist");
  assert.ok(appendAt !== -1, "normal accept path must still exist");
  assert.ok(guardAt < appendAt, "guard must run before the batch is accepted");
  assert.match(block.slice(guardAt, guardAt + 300), /return;/);
});

test("empty-file guard does not weaken the existing type/size/count guards", () => {
  const block = addFilesBlock();
  assert.match(block, /!PHOTO_MIME_TYPES\.has\(file\.type\)/);
  assert.match(block, /file\.size > MAX_PHOTO_BYTES/);
  assert.match(block, /files\.length \+ incoming\.length > MAX_PHOTO_COUNT/);
  assert.match(block, /onChange\(\[\.\.\.files, \.\.\.incoming\]\)/);
});
