import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const gate = source("client/src/components/CustomerAccountGate.tsx");
const backend = source("client/src/TestBackend.tsx");

test("CustomerAccountGate exposes register and login modes", () => {
  assert.match(gate, /useState<("register" \| "login"|"register" \| "login")>\("register"\)/);
  assert.match(gate, /mode === "register" \? "Create your Drivable account" : "Sign in to continue"/);
});

test("register posts to /api/auth/register with inviteCode", () => {
  assert.match(gate, /fetch\(`\/api\/auth\/\$\{mode\}`/);
  assert.match(gate, /inviteCode: mode === "register" \? String\(data\.get\("inviteCode"\) \|\| ""\) : undefined/);
});

test("login posts to /api/auth/login without inviteCode", () => {
  // inviteCode is only sent when mode === "register"
  assert.match(gate, /inviteCode: mode === "register"/);
});

test("mode toggle switches between register and login", () => {
  assert.match(gate, /setMode\(mode === "register" \? "login" : "register"\)/);
  assert.match(gate, /I already have an account/);
  assert.match(gate, /Create a new account/);
});

test("after registration success, gate transitions to login mode", () => {
  // Registration is intentionally opaque; the gate switches to login after success
  assert.match(gate, /if \(mode === "register"\)/);
  assert.match(gate, /setMode\("login"\)/);
});

test("after login success, gate calls onAuthenticated with user", () => {
  assert.match(gate, /if \(!result\.user\)/);
  assert.match(gate, /onAuthenticated\(result\.user\)/);
});

test("error display uses role=alert for accessibility", () => {
  assert.match(gate, /role="alert"/);
  assert.match(gate, /alert-card warning/);
});

test("busy state disables submit and shows Please wait", () => {
  assert.match(gate, /disabled=\{busy\}/);
  assert.match(gate, /busy \? "Please wait\.\.\." :/);
});

test("password minimum length is 12 characters", () => {
  assert.match(gate, /minLength=\{12\}/);
});

test("password maximum length is 128 characters", () => {
  assert.match(gate, /maxLength=\{128\}/);
});

test("auth gate shows helper text about password requirements", () => {
  assert.match(gate, /Use at least 12 characters/);
  assert.match(gate, /Do not reuse your banking or email password/);
});

test("TestBackend renders CustomerAccountGate when not authenticated", () => {
  // The intake page shows the auth gate when customer is null
  assert.match(backend, /<CustomerAccountGate onAuthenticated=\{.*\} \/>/);
});

test("TestBackend checks auth on mount via /api/auth/me", () => {
  assert.match(backend, /fetch\("\/api\/auth\/me"\)/);
  assert.match(backend, /setCustomer\(body\.user \|\| null\)/);
  assert.match(backend, /setAuthChecked\(true\)/);
});

test("TestBackend shows loading state while auth check is pending", () => {
  assert.match(backend, /if \(!authChecked\)/);
  assert.match(backend, /Checking your account\.\.\./);
});

test("TestBackend redirects to auth gate when customer is null after auth check", () => {
  assert.match(backend, /if \(!customer\)/);
  assert.match(backend, /<CustomerAccountGate/);
});

test("TestBackend propagates customer email from auth gate to intake form", () => {
  assert.match(backend, /setCustomerEmail\(user\.email\)/);
  assert.match(backend, /readOnly required/);
  assert.match(backend, /This verified delivery address comes from your signed-in account/);
});
