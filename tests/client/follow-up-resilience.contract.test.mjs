import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const followUpPage = source("client/src/pages/follow-up.tsx");

test("Follow-up page uses AbortController with timeout for mobile resilience", () => {
  assert.match(followUpPage, /AbortController/);
  assert.match(followUpPage, /setTimeout.*controller\.abort/);
});

test("Follow-up page fetch aborts on unmount and clears timeout", () => {
  assert.match(followUpPage, /controller\.abort/);
  assert.match(followUpPage, /clearTimeout/);
});

test("Follow-up page timeout produces a user-friendly AbortError message", () => {
  assert.match(followUpPage, /timeout/i);
  assert.match(followUpPage, /AbortError|timed out/i);
});

test("Follow-up page handles 401 with explicit re-auth prompt", () => {
  assert.match(followUpPage, /401/);
  assert.match(followUpPage, /session expired|sign in again/i);
});

test("Follow-up page handles 429 rate-limit with Retry-After hint", () => {
  assert.match(followUpPage, /429/);
  assert.match(followUpPage, /Retry-After|Too many requests/i);
});

test("Follow-up page handles 507 media persistence failure with server message", () => {
  assert.match(followUpPage, /507/);
  assert.match(followUpPage, /Media evidence could not be saved|media evidence was not persisted/i);
});

test("Follow-up page surfaces server-provided error message before fallback", () => {
  assert.match(followUpPage, /res\.text\(\)|errorText/);
  assert.match(followUpPage, /parsed\?\.message|parsed\?\.error/);
});

test("Follow-up page handles empty or unreadable response bodies", () => {
  assert.match(followUpPage, /responseText.*trim|empty/);
});

test("Follow-up page handles JSON parse failure gracefully", () => {
  assert.match(followUpPage, /JSON\.parse.*catch|catch.*JSON\.parse/);
});

test("Follow-up page catches errors and sets error state", () => {
  assert.match(followUpPage, /catch.*setError|setError.*catch/);
});

test("Follow-up page submit button disabled while loading", () => {
  assert.match(followUpPage, /disabled.*\(isPending|loading\)|\(isPending|loading\).*disabled/);
});

test("Follow-up page file inputs accept audio/video/vibration for evidence capture (P0 #1)", () => {
  assert.match(followUpPage, /audioFile|videoFile|vibrationData/);
  assert.match(followUpPage, /accept.*audio|accept.*video/);
  assert.match(followUpPage, /type=["']file["']/);
});

test("Follow-up page uses sessionStorage not localStorage for case ID persistence", () => {
  assert.match(followUpPage, /sessionStorage/);
  assert.doesNotMatch(followUpPage, /localStorage/);
});

test("Follow-up page sessionStorage getItem for saved case id is wrapped in try/catch for private browsing mode", () => {
  assert.match(followUpPage, /sessionStorage\.getItem/);
  assert.match(followUpPage, /try\s*\{[\s\S]*?sessionStorage\.getItem[\s\S]*?\}\s*catch/);
});

test("Follow-up page sessionStorage setItem for case pointer on success is wrapped in try/catch", () => {
  assert.match(followUpPage, /try\s*\{[\s\S]*?sessionStorage\.setItem[\s\S]*?\}\s*catch/);
});

test("Follow-up page sessionStorage removeItem on 404 is wrapped in try/catch for private browsing mode", () => {
  assert.match(followUpPage, /sessionStorage\.removeItem/);
  assert.match(followUpPage, /try\s*\{[\s\S]*?sessionStorage\.removeItem[\s\S]*?\}\s*catch/);
});

test("Follow-up page failed submission preserves form state for mobile retry — no reset of evidence or description on error", () => {
  assert.match(followUpPage, /setAdditionalInfo|setFormData/);
  assert.doesNotMatch(followUpPage, /onError.*setAdditionalInfo\(.*\"\"\)/);
});

test("Follow-up page uses inputMode for mobile-optimized keyboards on text inputs", () => {
  assert.match(followUpPage, /inputMode/);
});

test("Follow-up page evidence draft stays local until submitted — no silent persistence", () => {
  assert.doesNotMatch(followUpPage, /auto-save|persist.*local|localStorage.*draft/);
});

test("Follow-up page additionalInfo minimum length validation (20 chars)", () => {
  assert.match(followUpPage, /20.*character|minimum.*20|length.*<.*20/);
});

test("Follow-up page scrolls to top on error for mobile visibility", () => {
  assert.match(followUpPage, /scrollTo.*top|scrollIntoView/);
});

test("Follow-up page has case recovery effect gated by authChecked and customer", () => {
  assert.match(followUpPage, /authChecked && customer/);
  assert.match(followUpPage, /useEffect[\s\S]*?authChecked[\s\S]*?customer[\s\S]*?diagnosisId/);
});

test("Follow-up page shared-device safety tracks customer id changes", () => {
  assert.match(followUpPage, /prevCustomerIdRef/);
  assert.match(followUpPage, /customer\?\.id/);
});

test("Follow-up page stamps flow origin alongside case id on success", () => {
  assert.match(followUpPage, /drivable-last-case-origin/);
  assert.match(followUpPage, /diagnosis-follow-up/);
});

test("Follow-up page origin-scoped restore only restores follow-up origin cases", () => {
  assert.match(followUpPage, /savedOrigin !== FOLLOW_UP_ORIGIN|savedOrigin !== "diagnosis-follow-up"/);
});