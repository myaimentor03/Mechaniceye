import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

test("shared-device safety: switching signed-in customer clears previously restored case", () => {
  // Prevents customer A's Case ID card from lingering under customer B's
  // session on a shared tablet/phone after logout → login without reload.
  assert.match(backend, /prevCustomerIdRef/);
  assert.match(backend, /useRef<string \| null>/);
  assert.match(backend, /setResult\(null\)/);
  assert.match(backend, /prevCustomerIdRef\.current !== null && prevCustomerIdRef\.current !== currentId/);
});

test("case recovery isolation tracks the signed-in customer id, not just truthiness", () => {
  assert.match(backend, /customer\?\.id/);
  assert.match(backend, /\[authChecked, customer\?\.id\]/);
});

test("restored case is still server-verified after isolation hardening", () => {
  assert.match(backend, /fetch\(`\/api\/my-cases\/\$\{encodeURIComponent\(savedCaseId\)\}`/);
  assert.match(backend, /setResult\(\{ id: body\.id, status: body\.status/);
  assert.doesNotMatch(backend, /setResult\(\{ id: savedCaseId, status: "received" \}\)/);
});

test("case isolation effect is gated by authChecked to avoid clearing before auth resolves", () => {
  assert.match(backend, /if \(!authChecked\) return;/);
});

test("IntakePage shared-device safety: switching signed-in customer clears previously restored case reference", () => {
  // Prevents customer A's Case ID reference from lingering under customer B's
  // session on a shared tablet/phone after logout → login without reload.
  const intakeStart = backend.indexOf("function IntakePage");
  assert.ok(intakeStart !== -1, "IntakePage must exist");
  const intake = backend.slice(intakeStart, intakeStart + 1500);
  assert.match(intake, /const prevCustomerIdRef = useRef<string \| null>\(null\)/);
  assert.match(intake, /prevCustomerIdRef\.current !== null && prevCustomerIdRef\.current !== currentId/);
  assert.match(intake, /setRestoredCaseId\(null\)/);
});

test("IntakePage case recovery isolation tracks the signed-in customer id, not just truthiness", () => {
  const intakeStart = backend.indexOf("function IntakePage");
  assert.ok(intakeStart !== -1, "IntakePage must exist");
  const intake = backend.slice(intakeStart, intakeStart + 1500);
  assert.match(intake, /customer\?\.id/);
  assert.match(intake, /\[authChecked, customer\?\.id\]/);
});

test("IntakePage case isolation effect is gated by authChecked to avoid clearing before auth resolves", () => {
  const intakeStart = backend.indexOf("function IntakePage");
  assert.ok(intakeStart !== -1, "IntakePage must exist");
  const intake = backend.slice(intakeStart, intakeStart + 1500);
  assert.match(intake, /if \(!authChecked\) return;/);
});
