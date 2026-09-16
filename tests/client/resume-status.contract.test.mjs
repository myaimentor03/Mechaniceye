import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

test("restored case success card is dismissible and clears sessionStorage", () => {
  assert.match(backend, /sessionStorage\.removeItem\("drivable-last-case-id"\)/);
  assert.match(backend, /setResult\(null\)/);
  assert.match(backend, /Dismiss/);
});

test("dismiss action uses sessionStorage removeItem inside try/catch for mobile private mode", () => {
  assert.match(backend, /try \{ sessionStorage\.removeItem\("drivable-last-case-id"\)/);
});

test("dismiss shows toast for confirmation", () => {
  assert.match(backend, /toast\(\{ title: "Cleared"/);
});

test("case recovery still persists to sessionStorage on success behind try/catch", () => {
  assert.match(backend, /try \{ sessionStorage\.setItem\("drivable-last-case-id", data\.id\)/);
});

test("failed submission preserves form state for mobile retry — no reset of evidence or description on error", () => {
  // On error the code must NOT clear photoFiles, description, problemCategory, urgency
  // Preserve retry: only setError/setLoading are reset, not form fields.
  // Detect regression where catch/finally would wipe files.
  const submitBlock = backend.slice(backend.indexOf("async function submitDiagnosis"));
  assert.match(submitBlock, /setError\(/);
  assert.match(submitBlock, /setLoading\(false\)/);
  // Ensure no destructive resets in error path - these would lose customer input on flaky mobile network
  // The success path intentionally keeps photos; the error path must never clear them.
  const errorSection = submitBlock.slice(submitBlock.indexOf("catch (err"));
  assert.doesNotMatch(errorSection, /setPhotoFiles\(\[\]\)/);
  assert.doesNotMatch(errorSection, /setDescription\(""\)/);
  assert.doesNotMatch(errorSection, /setProblemCategory\(""\)/);
  assert.doesNotMatch(errorSection, /setUrgency\(""\)/);
});

test("copy case id action remains for customer resume", () => {
  assert.match(backend, /Copy Case ID/);
  assert.match(backend, /navigator\.clipboard\.writeText\(result\.id\)/);
});

test("restored toast title Case Restored is still present", () => {
  assert.match(backend, /Case Restored/);
  assert.match(backend, /toast\(\{ title: "Case Restored"/);
});

test("intake payload never includes payment or entitlement fields (payment safety)", () => {
  assert.doesNotMatch(backend, /payload\s*=\s*\{[^}]*\bpayment\b/i);
  assert.doesNotMatch(backend, /payload\s*=\s*\{[^}]*\bentitlement\b/i);
  assert.doesNotMatch(backend, /payload\s*=\s*\{[^}]*\btier\b/i);
  assert.doesNotMatch(backend, /FormData[^}]*append\("price"/i);
  assert.doesNotMatch(backend, /FormData[^}]*append\("payment"/i);
});
