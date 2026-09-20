import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

function authMeBlock() {
  const start = backend.indexOf('fetch("/api/auth/me"');
  assert.ok(start !== -1, 'fetch("/api/auth/me" must exist');
  return backend.slice(Math.max(0, start - 800), start + 2000);
}

function capabilitiesBlock() {
  const start = backend.indexOf('fetch("/api/capabilities"');
  assert.ok(start !== -1, 'fetch("/api/capabilities" must exist');
  return backend.slice(Math.max(0, start - 800), start + 1500);
}

test("auth/me timeout constants are defined for mobile resilience", () => {
  assert.match(backend, /const AUTH_ME_TIMEOUT_MS = 15000/);
  assert.match(backend, /const CAPABILITIES_TIMEOUT_MS = 10000/);
});

test("auth/me fetch uses AbortController with timeout for mobile resilience", () => {
  const block = authMeBlock();
  assert.match(block, /const controller = new AbortController\(\)/);
  assert.match(block, /window\.setTimeout\(\(\) => controller\.abort\(\), AUTH_ME_TIMEOUT_MS\)/);
  assert.match(block, /signal: controller\.signal/);
  assert.match(block, /window\.clearTimeout\(timeoutId\)/);
});

test("auth/me fetch aborts on unmount and clears timeout", () => {
  const block = authMeBlock();
  assert.match(block, /controller\.abort\(\)/);
  assert.match(block, /return \(\) => \{ active = false; controller\.abort\(\)/);
});

test("auth/me timeout degrades gracefully to unauthenticated without hanging", () => {
  const block = authMeBlock();
  assert.match(block, /err\.name === "AbortError"/);
  // Should still set authChecked so the page does not hang on spinner forever
  assert.match(block, /setAuthChecked\(true\)/);
});

test("capabilities fetch uses AbortController with timeout for mobile resilience", () => {
  const block = capabilitiesBlock();
  assert.match(block, /const controller = new AbortController\(\)/);
  assert.match(block, /window\.setTimeout\(\(\) => controller\.abort\(\), CAPABILITIES_TIMEOUT_MS\)/);
  assert.match(block, /signal: controller\.signal/);
  assert.match(block, /window\.clearTimeout\(timeoutId\)/);
});

test("capabilities fetch aborts on unmount and defaults to disabled on failure", () => {
  const block = capabilitiesBlock();
  assert.match(block, /controller\.abort\(\)/);
  assert.match(block, /setPhotoUploadEnabled\(false\)/);
});

test("both auth and capabilities fetches never claim success on timeout", () => {
  const authBlock = authMeBlock();
  // Timeout must not fabricate a customer
  assert.doesNotMatch(authBlock, /setCustomer\(body\.user\)[\s\S]*AbortError/);
  // Capabilities must not fabricate photoUpload true on failure
  const capBlock = capabilitiesBlock();
  assert.match(capBlock, /setPhotoUploadEnabled\(false\)/);
  assert.match(capBlock, /\.catch\(/);
});
