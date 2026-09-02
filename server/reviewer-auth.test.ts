import assert from "node:assert/strict";
import test from "node:test";
import { bearerToken, reviewerAuthorization, reviewerIdentityFromCredential, tokenMatches } from "./reviewer-auth.js";

test("extracts only bearer authorization", () => {
  assert.equal(bearerToken("Bearer beta-review-key"), "beta-review-key");
  assert.equal(bearerToken("bearer   beta-review-key "), "beta-review-key");
  assert.equal(bearerToken("Basic abc"), "");
  assert.equal(bearerToken(undefined), "");
});

test("requires a non-empty exact reviewer token", () => {
  assert.equal(tokenMatches("correct", "correct"), true);
  assert.equal(tokenMatches("correct ", " correct"), true);
  assert.equal(tokenMatches("wrong", "correct"), false);
  assert.equal(tokenMatches("", ""), false);
  assert.equal(tokenMatches(undefined, "correct"), false);
});

test("fails closed when reviewer access is not configured", () => {
  const configured = "configured-reviewer-token-that-is-long-enough";
  assert.equal(reviewerAuthorization("Bearer anything", ""), "not_configured");
  assert.equal(reviewerAuthorization("Bearer anything", "too-short"), "not_configured");
  assert.equal(reviewerAuthorization(undefined, configured), "unauthorized");
  assert.equal(reviewerAuthorization("Bearer wrong", configured), "unauthorized");
  assert.equal(reviewerAuthorization(`Bearer ${configured}`, configured), "authorized");
});

test("derives a stable opaque reviewer reference without exposing the credential", () => {
  const credential = "configured-reviewer-token-that-is-long-enough";
  const identity = reviewerIdentityFromCredential(credential);
  assert.match(identity.ref, /^reviewer_[a-f0-9]{32}$/);
  assert.equal(identity.ref.includes(credential), false);
  assert.deepEqual(reviewerIdentityFromCredential(credential), identity);
  assert.notDeepEqual(reviewerIdentityFromCredential("another-reviewer-token-that-is-long-enough"), identity);
  assert.throws(() => reviewerIdentityFromCredential("too-short"));
});
