import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

function submitBlock() {
  const start = backend.indexOf("async function submitDiagnosis");
  assert.ok(start !== -1, "submitDiagnosis must exist");
  return backend.slice(start, start + 14000);
}

test("retry preserves clientRequestId for idempotent mobile retry — generateClientRequestId reuses stored id", () => {
  // The initial generateClientRequestId check must return existing before
  // creating a new one, so a network timeout retry sends the same marker.
  const genStart = backend.indexOf("function generateClientRequestId");
  assert.ok(genStart !== -1);
  const block = backend.slice(genStart, genStart + 800);
  assert.match(block, /sessionStorage\.getItem\(storageKey\)/);
  assert.match(block, /if \(existing\) \{[\s\S]*return existing/);
});

test("after successful intake the stored clientRequestId is rotated so the next case is not collapsed", () => {
  const block = submitBlock();
  // After setResult(data) and persisting drivable-last-case-id, the code must
  // remove the old drivable-client-request-id and store a fresh one.
  assert.match(block, /sessionStorage\.setItem\("drivable-last-case-id", data\.id\)/);
  assert.match(block, /drivable-client-request-id/);
  assert.match(block, /sessionStorage\.removeItem\(storageKey\)/);
  assert.match(block, /const nextId = `req-/);
  assert.match(block, /sessionStorage\.setItem\(storageKey, nextId\)/);
  assert.match(block, /setClientRequestId\(nextId\)/);
});

test("rotation happens before scroll and after result so retry continuity is preserved during the attempt", () => {
  const block = submitBlock();
  const resultAt = block.indexOf("setResult(data)");
  const rotateAt = block.indexOf('sessionStorage.removeItem');
  assert.ok(resultAt !== -1 && rotateAt !== -1, "anchors must exist");
  assert.ok(resultAt < rotateAt, "rotation must occur after setResult");
  const scrollAfterRotate = block.indexOf("window.scrollTo({ top: 0", rotateAt);
  assert.ok(scrollAfterRotate !== -1, "scrollTo after rotation must exist");
  assert.ok(rotateAt < scrollAfterRotate, "rotation must occur before the success scrollTo");
});

test("generation and rotation both use try/catch for mobile private mode (QuotaExceeded / blocked storage)", () => {
  const block = submitBlock();
  // The rotation after success must not throw in private mode.
  assert.match(block, /try \{\s*const storageKey = "drivable-client-request-id"/);
  assert.match(block, /catch \{\}/);
});
