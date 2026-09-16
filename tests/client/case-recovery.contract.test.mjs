import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

test("case recovery persists the case id to sessionStorage on successful intake", () => {
  // Survives page refresh on mobile; localStorage is intentionally avoided so
  // the case id does not linger across tabs/sessions on shared devices.
  assert.match(backend, /sessionStorage\.setItem\("drivable-last-case-id", data\.id\)/);
  assert.doesNotMatch(backend, /localStorage\.setItem\("drivable-last-case-id"/);
});

test("case recovery restores the saved case id on mount instead of losing it", () => {
  assert.match(backend, /sessionStorage\.getItem\("drivable-last-case-id"\)/);
  assert.match(backend, /setResult\(\{ id: savedCaseId, status: "received" \}\)/);
});

test("expired session on submit prompts re-auth instead of a generic error", () => {
  assert.match(backend, /if \(res\.status === 401\)/);
  assert.match(backend, /setCustomer\(null\)/);
  assert.match(backend, /Your session expired\. Please sign in again to submit your case\./);
});

test("case recovery exposes a Copy Case ID action backed by the clipboard", () => {
  assert.match(backend, /Copy Case ID/);
  assert.match(backend, /navigator\.clipboard\.writeText\(result\.id\)/);
});
