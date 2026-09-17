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

test("case recovery verifies the saved case id server-side instead of fabricating status", () => {
  // Launch blocker (Nov 2 paid beta): the client must never invent a
  // "received" status from a sessionStorage pointer. Restore must verify via
  // the customer-scoped GET /api/my-cases/:id endpoint and use the server's
  // id/status in the restored result.
  assert.match(backend, /sessionStorage\.getItem\("drivable-last-case-id"\)/);
  assert.match(backend, /fetch\(`\/api\/my-cases\/\$\{encodeURIComponent\(savedCaseId\)\}`/);
  assert.match(backend, /setResult\(\{ id: body\.id, status: body\.status/);
  assert.doesNotMatch(backend, /setResult\(\{ id: savedCaseId, status: "received" \}\)/);
});

test("case recovery requires an authenticated customer before verifying a saved case", () => {
  assert.match(backend, /if \(!result && authChecked && customer\)/);
});

test("case recovery drops a stale saved id when the server reports 404", () => {
  assert.match(backend, /if \(res\.status === 404\)/);
  assert.match(backend, /sessionStorage\.removeItem\("drivable-last-case-id"\)/);
});

test("case recovery on 401 prompts re-auth without restoring a case", () => {
  const restoreBlock = backend.slice(backend.indexOf("server-verified case restore"));
  assert.match(restoreBlock, /if \(res\.status === 401\)/);
  assert.match(restoreBlock, /setCustomer\(null\)/);
  assert.match(restoreBlock, /Your session expired\. Please sign in again to view your case\./);
});

test("case recovery on network failure preserves the saved id for retry without claiming status", () => {
  const restoreBlock = backend.slice(backend.indexOf("server-verified case restore"));
  assert.match(restoreBlock, /Couldn't verify your saved case \(network issue\)/);
  assert.doesNotMatch(restoreBlock, /setResult\(\{ id: savedCaseId/);
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

test("case recovery shows toast on restored case from sessionStorage", () => {
  assert.match(backend, /toast\(/);
  assert.match(backend, /Case Restored/);
});

test("diagnosis submission handles 500 server error with fail-closed behavior", () => {
  const submitBlock = backend.slice(
    backend.indexOf("async function submitDiagnosis"),
    backend.indexOf("async function submitDiagnosis") + 8000
  );
  assert.match(submitBlock, /lastError = `We couldn't record your request \(HTTP 500\)/);
  assert.doesNotMatch(submitBlock, /setResult\(/);
  assert.doesNotMatch(submitBlock, /sessionStorage\.setItem/);
});
