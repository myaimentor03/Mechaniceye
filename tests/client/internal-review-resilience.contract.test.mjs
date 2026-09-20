import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

function internalReviewSubmitBlock() {
  const start = backend.indexOf("async function submitInternalReview");
  assert.ok(start !== -1, "submitInternalReview must exist");
  return backend.slice(start, start + 3000);
}

test("Internal Review Desk submit uses AbortController with timeout for mobile resilience", () => {
  const block = internalReviewSubmitBlock();
  assert.match(block, /const controller = new AbortController\(\)/);
  assert.match(block, /window\.setTimeout\(\(\) => controller\.abort\(\),/);
  assert.match(block, /signal: controller\.signal/);
  assert.match(block, /window\.clearTimeout\(timeoutId\)/);
});

test("Internal Review Desk submit timeout produces a user-friendly AbortError message", () => {
  const block = internalReviewSubmitBlock();
  assert.match(block, /error instanceof DOMException && error\.name === "AbortError"/);
  assert.match(block, /Request timed out after \$/);
  assert.match(block, /seconds\. Please try again\./);
});

test("Internal Review Desk submit handles non-OK responses with error message", () => {
  const block = internalReviewSubmitBlock();
  assert.match(block, /if \(!response\.ok \|\| !result\.ok\)/);
  assert.match(block, /throw new Error\(result\.error \|\| "Internal review failed\."\)/);
});

test("Internal Review Desk submit clears abort timeout on success", () => {
  const block = internalReviewSubmitBlock();
  assert.match(block, /setSubmitSuccess\(true\)/);
  assert.match(block, /form\.reset\(\)/);
});

test("Internal Review Desk submit handles JSON parse failure gracefully", () => {
  const block = internalReviewSubmitBlock();
  assert.match(block, /\.catch\(\(\) => \(\{ ok: false, error: "Internal review failed\." \}\)\)/);
});