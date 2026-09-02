import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLaunchReadiness, type LaunchCapabilityState } from "./launch-readiness.js";

const completeCapabilities: LaunchCapabilityState = {
  durableEvidence: true,
  durableConsent: true,
  durableHumanReview: true,
  verifiedPaymentEntitlement: true,
  verifiedEmailDelivery: true,
};

const completeEnvironment: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgres://database",
  DRIVABLE_SESSION_SECRET: "s".repeat(32),
  DRIVABLE_REVIEWER_TOKEN: "r".repeat(32),
  DRIVABLE_BETA_INVITE_CODE: "invite-code-12",
  DRIVABLE_PUBLIC_ORIGIN: "https://beta.example.com",
  DRIVABLE_TERMS_VERSION: "2026-08-24",
  DRIVABLE_PRIVACY_VERSION: "2026-08-24",
  DRIVABLE_CONSENT_VERSION: "2026-08-24",
};

test("reports ready only when every configuration and capability gate passes", () => {
  const report = evaluateLaunchReadiness(completeEnvironment, completeCapabilities, new Date("2026-08-24T00:00:00Z"));
  assert.equal(report.ready, true);
  assert.equal(report.checkedAt, "2026-08-24T00:00:00.000Z");
  assert.equal(report.checks.every((check) => check.ready), true);
});

test("fails closed and identifies missing launch foundations", () => {
  const report = evaluateLaunchReadiness({}, {
    ...completeCapabilities,
    durableConsent: false,
    verifiedEmailDelivery: false,
  });
  assert.equal(report.ready, false);
  const failed = report.checks.filter((check) => !check.ready).map((check) => check.key);
  assert.ok(failed.includes("database"));
  assert.ok(failed.includes("durable_consent"));
  assert.ok(failed.includes("email_delivery"));
});

test("rejects insecure or non-origin public URLs and weak secrets", () => {
  const report = evaluateLaunchReadiness({
    ...completeEnvironment,
    DRIVABLE_PUBLIC_ORIGIN: "http://beta.example.com/path",
    DRIVABLE_REVIEWER_TOKEN: "too-short",
  }, completeCapabilities);
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((check) => check.key === "public_origin")?.ready, false);
  assert.equal(report.checks.find((check) => check.key === "reviewer_token")?.ready, false);
});
