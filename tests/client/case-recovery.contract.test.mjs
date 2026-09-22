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

test("case recovery uses AbortController with timeout for mobile resilience", () => {
   const restoreBlock = backend.slice(backend.indexOf("server-verified case restore"));
   assert.match(restoreBlock, /const controller = new AbortController\(\)/);
   assert.match(restoreBlock, /window\.setTimeout\(\(\) => controller\.abort\(\), CASE_RECOVERY_TIMEOUT_MS/);
   assert.match(restoreBlock, /signal: controller\.signal/);
   assert.match(restoreBlock, /window\.clearTimeout\(timeoutId\)/);
});

test("case recovery timeout produces a user-friendly AbortError message", () => {
   const restoreBlock = backend.slice(backend.indexOf("server-verified case restore"));
   assert.match(restoreBlock, /err\.name === "AbortError"/);
   assert.match(restoreBlock, /Couldn't verify your saved case \(timeout\)/);
   assert.match(restoreBlock, /Your Case ID is preserved for retry/);
});

test("case recovery cleanup aborts the controller on unmount", () => {
   const restoreBlock = backend.slice(backend.indexOf("server-verified case restore"));
   assert.match(restoreBlock, /return \(\) => \{ controller\.abort\(\)/);
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

test("case recovery on 500 preserves the saved id for retry without claiming status", () => {
   const restoreStart = backend.indexOf("server-verified case restore");
   const restoreEnd = backend.indexOf("}, [authChecked, customer, result]);", restoreStart);
   const restoreBlock = backend.slice(restoreStart, restoreEnd);
   // 500 falls through the !res.ok block without matching 401 or 404,
   // so it must NOT remove the saved case id and must NOT setResult.
   assert.match(restoreBlock, /if \(res\.status === 401\)/);
   assert.match(restoreBlock, /if \(res\.status === 404\)/);
   // No explicit 500 handler means fallthrough to return, preserving sessionStorage.
   // Verify no explicit 500 block calls sessionStorage.removeItem (only in 404 block).
   assert.doesNotMatch(restoreBlock, /if \(res\.status === 500\)[\s\S]{0,200}sessionStorage\.removeItem/);
   // Verify 500 is not explicitly handled with an if statement (only mentioned in comment)
   const explicit500Handler = restoreBlock.match(/if \(res\.status === 500\) \{/);
   assert.ok(!explicit500Handler, "500 should not have an explicit if handler; it falls through correctly");
});

test("case recovery sessionStorage getItem for saved case id is wrapped in try/catch for private browsing mode", () => {
   const restoreBlock = backend.slice(backend.indexOf("server-verified case restore"));
   // The getItem calls must be inside a try/catch block to handle Safari/iOS private mode
   assert.match(restoreBlock, /try \{[\s\S]*savedCaseId = sessionStorage\.getItem\("drivable-last-case-id"\)/);
   assert.match(restoreBlock, /try \{[\s\S]*savedOrigin = sessionStorage\.getItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/);
   assert.match(restoreBlock, /\} catch \{\}/);
});

test("IntakePage restored case reference sessionStorage getItem is wrapped in try/catch for private browsing mode", () => {
   const intakeStart = backend.indexOf("function IntakePage");
   assert.ok(intakeStart !== -1, "IntakePage must exist");
   const intake = backend.slice(intakeStart, intakeStart + 8000);
   const restoredCaseIdEffect = intake.slice(intake.indexOf("restoredCaseId"));
   assert.match(restoredCaseIdEffect, /try \{[\s\S]*savedCaseId = sessionStorage\.getItem\("drivable-last-case-id"\)/);
   assert.match(restoredCaseIdEffect, /try \{[\s\S]*savedOrigin = sessionStorage\.getItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/);
   assert.match(restoredCaseIdEffect, /\} catch \{\}/);
});

test("case recovery sessionStorage setItem for case pointer on success is wrapped in try/catch", () => {
   const submitBlock = backend.slice(backend.indexOf("async function applyDiagnosisResult"));
   assert.match(submitBlock, /try \{ sessionStorage\.setItem\("drivable-last-case-id", data\.id\)/);
   assert.match(submitBlock, /sessionStorage\.setItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY, DIAGNOSIS_INTAKE_ORIGIN\)/);
   assert.match(submitBlock, /\} catch \{\}/);
});

test("case recovery sessionStorage removeItem on dismiss is wrapped in try/catch for private browsing mode", () => {
   const dismissHandlerStart = backend.indexOf("try { sessionStorage.removeItem(\"drivable-last-case-id\")");
   assert.ok(dismissHandlerStart !== -1, "dismiss handler with sessionStorage.removeItem must exist");
   const dismissHandlerEnd = backend.indexOf("}}", dismissHandlerStart);
   const dismissHandler = backend.slice(dismissHandlerStart, dismissHandlerEnd + 2);
   assert.match(dismissHandler, /try \{ sessionStorage\.removeItem\("drivable-last-case-id"\)/);
   assert.match(dismissHandler, /sessionStorage\.removeItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/);
   assert.match(dismissHandler, /\} catch \{\}/);
});

test("case recovery sessionStorage removeItem on 404 is wrapped in try/catch for private browsing mode", () => {
   const restoreBlock = backend.slice(backend.indexOf("server-verified case restore"));
   const removeBlock = restoreBlock.slice(restoreBlock.indexOf("if (res.status === 404)"));
   assert.match(removeBlock, /try \{ sessionStorage\.removeItem\("drivable-last-case-id"\)/);
   assert.match(removeBlock, /sessionStorage\.removeItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/);
   assert.match(removeBlock, /\} catch \{\}/);
});
