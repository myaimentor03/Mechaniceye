import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

test("submission uses AbortController with a 20-second timeout", () => {
  assert.match(backend, /SUBMISSION_TIMEOUT_MS = 20000/);
  assert.match(backend, /new AbortController\(\)/);
  assert.match(backend, /window\.setTimeout\(\(\) => controller\.abort\(\), SUBMISSION_TIMEOUT_MS\)/);
});

test("submission passes abort signal to fetch", () => {
  assert.match(backend, /signal: controller\.signal/);
});

test("timeout produces a user-friendly AbortError message", () => {
  assert.match(backend, /err\?\.name === "AbortError"/);
  assert.match(backend, /Request timed out after \$/);
  assert.match(backend, /seconds\. Please try again\./);
});

test("submission handles empty or unreadable response bodies", () => {
  assert.match(backend, /const responseText = await res\.text\(\)/);
  assert.match(backend, /if \(!responseText\.trim\(\)\)/);
  assert.match(backend, /throw new Error\("empty"\)/);
  assert.match(backend, /We received a response we couldn't read\. Please try again\./);
});

test("submission clears the abort timeout on success", () => {
  assert.match(backend, /window\.clearTimeout\(timeoutId\)/);
});

test("submission handles 401 with explicit re-auth prompt", () => {
  assert.match(backend, /if \(res\.status === 401\)/);
  assert.match(backend, /setCustomer\(null\)/);
  assert.match(backend, /Your session expired\. Please sign in again to submit your case\./);
});

test("submission handles non-OK responses with retryable error message", () => {
  assert.match(backend, /We couldn't record your request \(HTTP \$\{res\.status\}\)/);
});

test("submission accumulates errors across retry attempts", () => {
  // The code loops through endpoints and tracks lastError
  assert.match(backend, /let lastError = ""/);
  assert.match(backend, /lastError = .*Submission failed/);
  assert.match(backend, /throw new Error\(lastError \|\| "Submission failed\."\)/);
});

test("submission scrolls to top on error for mobile visibility", () => {
  assert.match(backend, /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
});

test("submission disables submit button while loading", () => {
  assert.match(backend, /disabled=\{loading\}/);
  assert.match(backend, /loading \? "Submitting\.\.\." : "Submit Drivable Check"/);
});

test("submission stores case ID to sessionStorage on success", () => {
  assert.match(backend, /if \(data\?\.id\)/);
  assert.match(backend, /sessionStorage\.setItem\("drivable-last-case-id", data\.id\)/);
});

test("submission resets error and result state before new attempt", () => {
  assert.match(backend, /setLoading\(true\)/);
  assert.match(backend, /setError\(""\)/);
  assert.match(backend, /setResult\(null\)/);
});

test("submission handles JSON parse failure gracefully", () => {
  assert.match(backend, /try \{[\s\S]*JSON\.parse\(responseText\)/);
  assert.match(backend, /catch \{[\s\S]*lastError = "We received a response we couldn't read/);
});

test("case recovery restores from sessionStorage on mount", () => {
  assert.match(backend, /sessionStorage\.getItem\("drivable-last-case-id"\)/);
  assert.match(backend, /setResult\(\{ id: savedCaseId, status: "received" \}\)/);
  assert.match(backend, /Case Restored/);
});

test("case recovery uses sessionStorage not localStorage for mobile safety", () => {
  assert.match(backend, /sessionStorage\.setItem\("drivable-last-case-id"/);
  assert.doesNotMatch(backend, /localStorage\.setItem\("drivable-last-case-id"/);
});
