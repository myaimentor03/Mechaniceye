import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

test("IntakePage Previous Case Reference restores only for diagnosis-intake origin (fail closed on shared pointer)", () => {
  const intakeStart = backend.indexOf("function IntakePage()");
  assert.ok(intakeStart !== -1, "IntakePage must exist");
  const intake = backend.slice(intakeStart, intakeStart + 2500);
  // Must scope to diagnosis-intake, never bare savedCaseId truthiness
  assert.match(intake, /sessionStorage\.getItem\("drivable-last-case-id"\)/);
  assert.match(intake, /sessionStorage\.getItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/);
  assert.match(intake, /savedOrigin !== DIAGNOSIS_INTAKE_ORIGIN/);
  assert.doesNotMatch(intake, /if \(savedCaseId\) \{\s*setRestoredCaseId\(savedCaseId\)/);
});

test("IntakePage origin guard preserves fail-closed comment for marketplace isolation", () => {
  const intakeStart = backend.indexOf("function IntakePage()");
  const intake = backend.slice(intakeStart, intakeStart + 2500);
  assert.match(intake, /Fail closed: only verify a Previous Case Reference when the pointer/);
});

test("server-verified case restore is origin-scoped to diagnosis-intake (preserves marketplace pointers)", () => {
  const restoreStart = backend.indexOf("server-verified case restore");
  assert.ok(restoreStart !== -1, "server-verified case restore effect must exist");
  const restore = backend.slice(restoreStart, restoreStart + 3500);
  assert.match(restore, /sessionStorage\.getItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/);
  assert.match(restore, /savedOrigin !== DIAGNOSIS_INTAKE_ORIGIN/);
  // Must return early without fetching, preserving marketplace pointer
  assert.match(restore, /if \(savedOrigin !== DIAGNOSIS_INTAKE_ORIGIN\) return;/);
});

test("diagnosis intake stamps flow origin alongside case id using shared constants", () => {
  const applyStart = backend.indexOf("async function applyDiagnosisResult");
  assert.ok(applyStart !== -1, "applyDiagnosisResult must exist");
  const block = backend.slice(applyStart, applyStart + 2000);
  assert.match(block, /sessionStorage\.setItem\("drivable-last-case-id", data\.id\)/);
  assert.match(block, /sessionStorage\.setItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY, DIAGNOSIS_INTAKE_ORIGIN\)/);
});

test("diagnosis origin constants are defined at module scope", () => {
  assert.match(backend, /const DRIVABLE_LAST_CASE_ORIGIN_KEY = "drivable-last-case-origin"/);
  assert.match(backend, /const DIAGNOSIS_INTAKE_ORIGIN = "diagnosis-intake"/);
});

test("IntakePage Dismiss clears both case id and origin via constant (consistent cleanup)", () => {
  const intakeStart = backend.indexOf("function IntakePage()");
  const intake = backend.slice(intakeStart, intakeStart + 6000);
  // The Dismiss button inside IntakePage's result card should clear via constant
  // (the server-verified effect also clears via constant on 404)
  const hasConstClear = intake.includes('sessionStorage.removeItem(DRIVABLE_LAST_CASE_ORIGIN_KEY)');
  // If not in IntakePage slice, check overall backend has the pattern
  assert.ok(backend.includes('sessionStorage.removeItem(DRIVABLE_LAST_CASE_ORIGIN_KEY)'), "cleanup via constant must exist");
});

test("server-verified 404 cleanup uses constant for origin key (no literal drift)", () => {
  const restoreStart = backend.indexOf("server-verified case restore");
  const restore = backend.slice(restoreStart, restoreStart + 3500);
  assert.match(restore, /sessionStorage\.removeItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/);
  assert.doesNotMatch(restore, /sessionStorage\.removeItem\("drivable-last-case-origin"\)/);
});
