import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

function clientRequestIdInitBlock() {
  const start = backend.indexOf("const [clientRequestId, setClientRequestId]");
  assert.ok(start !== -1, "clientRequestId initializer must exist");
  return backend.slice(start, start + 500);
}

function generateClientRequestIdBlock() {
  const start = backend.indexOf("function generateClientRequestId");
  assert.ok(start !== -1, "generateClientRequestId function must exist");
  return backend.slice(start, start + 800);
}

test("generateClientRequestId creates new ID and stores in sessionStorage", () => {
  const block = generateClientRequestIdBlock();
  assert.match(block, /function generateClientRequestId\(\)/);
  assert.match(block, /const newId = `req-/);
  assert.match(block, /sessionStorage\.setItem\(storageKey, newId\)/);
  assert.match(block, /setClientRequestId\(newId\)/);
  assert.match(block, /return newId/);
});

test("clientRequestId initialization read from sessionStorage is wrapped in try/catch for mobile private mode", () => {
  const block = clientRequestIdInitBlock();
  assert.match(block, /try \{/);
  assert.match(block, /sessionStorage\.getItem\(/);
  assert.match(block, /drivable-client-request-id/);
  assert.match(block, /catch \{[\s\S]*?return fallbackId/);
});

test("clientRequestId initialization write to sessionStorage never throws — guarded inner try/catch", () => {
  const block = clientRequestIdInitBlock();
  assert.match(block, /try \{ window\.sessionStorage\.setItem\(/);
});

test("clientRequestId initialization falls back to in-memory id when storage is blocked", () => {
  const block = clientRequestIdInitBlock();
  assert.match(block, /const fallbackId = `req-/);
  assert.match(block, /return fallbackId;/);
});

test("Copy Case ID still uses clipboard API for primary path", () => {
  assert.match(backend, /navigator\.clipboard\.writeText\(result\.id\)/);
});

test("Copy Case ID guards missing clipboard API for older mobile browsers", () => {
  assert.match(backend, /navigator\.clipboard\?\.writeText/);
});

test("Copy Case ID has textarea + execCommand fallback for iOS/legacy", () => {
  assert.match(backend, /document\.createElement\("textarea"\)/);
  assert.match(backend, /document\.execCommand\("copy"\)/);
  assert.match(backend, /document\.body\.removeChild\(ta\)/);
});

test("Copy Case ID surfaces a failure toast instead of failing silently", () => {
  assert.match(backend, /Copy failed/);
  assert.match(backend, /Long-press to copy/);
});

test("Copy failure falls back instead of swallowing the error", () => {
  // The clipboard rejection path must invoke the manual fallback.
  assert.match(backend, /\.catch\(\(\) => \{ fallbackCopy\(\); \}\)/);
});
