import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");
const marketplace = source("client/src/marketplace/Marketplace.tsx");

// P0 #1 #4 #9 mobile private mode: when sessionStorage is blocked (Safari
// private browsing throws on getItem/setItem), retries must reuse the same
// in-memory clientRequestId instead of generating a new one each time.
// Otherwise a timeout retry would arrive as a new request and create a
// duplicate case/listing.

function diagnosisIntakeBlock() {
  const start = backend.indexOf("function getStableClientRequestId");
  assert.ok(start !== -1, "getStableClientRequestId must exist for diagnosis intake");
  return backend.slice(start, start + 1800);
}

function sellerGenerateBlock() {
  const idx = marketplace.indexOf("const SELLER_CLIENT_REQUEST_STORAGE_KEY");
  const start = marketplace.indexOf("function generateClientRequestId()", idx);
  assert.ok(start !== -1, "seller generateClientRequestId must exist");
  return marketplace.slice(start, start + 1600);
}

function buyerGenerateBlock() {
  const idx = marketplace.indexOf("const BUYER_CLIENT_REQUEST_STORAGE_KEY");
  const start = marketplace.indexOf("function generateClientRequestId()", idx);
  assert.ok(start !== -1, "buyer generateClientRequestId must exist");
  return marketplace.slice(start, start + 1600);
}

test("diagnosis intake reuses in-memory clientRequestId when sessionStorage is blocked", () => {
  const block = diagnosisIntakeBlock();
  assert.match(block, /if \(clientRequestId && clientRequestId\.trim\(\)\)/);
  assert.match(block, /return clientRequestId/);
});

test("seller intake reuses in-memory clientRequestId when sessionStorage is blocked", () => {
  const block = sellerGenerateBlock();
  assert.match(block, /if \(clientRequestId && clientRequestId\.trim\(\)\)/);
  assert.match(block, /return clientRequestId/);
});

test("buyer interest reuses in-memory clientRequestId when sessionStorage is blocked", () => {
  const block = buyerGenerateBlock();
  assert.match(block, /if \(clientRequestId && clientRequestId\.trim\(\)\)/);
  assert.match(block, /return clientRequestId/);
});

test("shared helper caches fallback id per key for mechanic/concierge flows", () => {
  assert.match(backend, /const fallbackRequestIdByKey = new Map<string, string>\(\)/);
  assert.match(backend, /fallbackRequestIdByKey\.get\(storageKey\)/);
  assert.match(backend, /fallbackRequestIdByKey\.set\(storageKey,/);
});

test("shared helper preserves cached id across blocked-storage retries", () => {
  const start = backend.indexOf("function getOrCreateStableClientRequestId");
  const block = backend.slice(start, start + 1800);
  // On catch (storage blocked) the cached id must be returned before creating new
  assert.match(block, /catch \{/);
  const catchIdx = block.indexOf("catch {");
  const catchBlock = block.slice(catchIdx, catchIdx + 600);
  assert.match(catchBlock, /fallbackRequestIdByKey\.get\(storageKey\)/);
  assert.match(catchBlock, /if \(cached\) return cached/);
});

test("private-mode retry reuse does not clear form state", () => {
  // The 507/500 error paths already ensure form state is preserved; this test
  // locks that the new fallback path does not introduce a clear.
  assert.doesNotMatch(backend, /if \(clientRequestId && clientRequestId\.trim\(\)\)[\s\S]*?setPhotoFiles\(\[\]\)/);
  assert.doesNotMatch(marketplace, /if \(clientRequestId && clientRequestId\.trim\(\)\)[\s\S]*?setSubmitted\(false\)/);
});
