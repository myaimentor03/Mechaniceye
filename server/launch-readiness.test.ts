import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLaunchReadiness, isEmailDeliveryConfigured, type LaunchCapabilityState } from "./launch-readiness.js";

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
  SENDGRID_API_KEY: "SG.test-key-for-launch-readiness",
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

test("isEmailDeliveryConfigured returns true when SENDGRID_API_KEY is set", () => {
  assert.equal(isEmailDeliveryConfigured({ SENDGRID_API_KEY: "SG.test-key" }), true);
});

test("isEmailDeliveryConfigured returns true when MAILGUN_API_KEY is set", () => {
  assert.equal(isEmailDeliveryConfigured({ MAILGUN_API_KEY: "mg-test-key" }), true);
});

test("isEmailDeliveryConfigured returns true when POSTMARK_API_KEY is set", () => {
  assert.equal(isEmailDeliveryConfigured({ POSTMARK_API_KEY: "pm-test-key" }), true);
});

test("isEmailDeliveryConfigured returns true when EMAIL_PROVIDER_API_KEY is set", () => {
  assert.equal(isEmailDeliveryConfigured({ EMAIL_PROVIDER_API_KEY: "generic-test-key" }), true);
});

test("isEmailDeliveryConfigured returns false when no email provider key is set", () => {
  assert.equal(isEmailDeliveryConfigured({}), false);
});

test("isEmailDeliveryConfigured returns false when email provider key is empty", () => {
  assert.equal(isEmailDeliveryConfigured({ SENDGRID_API_KEY: "" }), false);
  assert.equal(isEmailDeliveryConfigured({ SENDGRID_API_KEY: "   " }), false);
});

test("isEmailDeliveryConfigured rejects placeholder short keys that would fake launch readiness", () => {
  assert.equal(isEmailDeliveryConfigured({ SENDGRID_API_KEY: "x" }), false);
  assert.equal(isEmailDeliveryConfigured({ SENDGRID_API_KEY: "short" }), false);
  assert.equal(isEmailDeliveryConfigured({ SENDGRID_API_KEY: "1234567" }), false);
  assert.equal(isEmailDeliveryConfigured({ MAILGUN_API_KEY: "abc" }), false);
  assert.equal(isEmailDeliveryConfigured({ POSTMARK_API_KEY: "x".repeat(7) }), false);
});

test("isEmailDeliveryConfigured accepts 8+ char keys and trims whitespace", () => {
  assert.equal(isEmailDeliveryConfigured({ SENDGRID_API_KEY: "12345678" }), true);
  assert.equal(isEmailDeliveryConfigured({ SENDGRID_API_KEY: "  SG.test-key  " }), true);
  assert.equal(isEmailDeliveryConfigured({ MAILGUN_API_KEY: "  mg-valid-key-123  " }), true);
  assert.equal(isEmailDeliveryConfigured({ EMAIL_PROVIDER_API_KEY: "  generic-valid-key-12345  " }), true);
});

test("evaluateLaunchReadiness email_delivery check passes when email provider key is configured", () => {
  const envWithEmail = { ...completeEnvironment, SENDGRID_API_KEY: "SG.test-key" };
  const report = evaluateLaunchReadiness(envWithEmail, completeCapabilities, new Date("2026-08-24T00:00:00Z"));
  assert.equal(report.checks.find((check) => check.key === "email_delivery")?.ready, true);
  assert.equal(report.ready, true);
});

test("evaluateLaunchReadiness email_delivery check fails when no email provider key is configured", () => {
  const envWithoutEmail = { ...completeEnvironment };
  delete envWithoutEmail.SENDGRID_API_KEY;
  delete envWithoutEmail.MAILGUN_API_KEY;
  delete envWithoutEmail.POSTMARK_API_KEY;
  delete envWithoutEmail.EMAIL_PROVIDER_API_KEY;
  const report = evaluateLaunchReadiness(envWithoutEmail, completeCapabilities, new Date("2026-08-24T00:00:00Z"));
  assert.equal(report.checks.find((check) => check.key === "email_delivery")?.ready, false);
  assert.equal(report.ready, false);
});

test("evaluateLaunchReadiness email_delivery fails closed on short placeholder key", () => {
  const envWithShortKey = { ...completeEnvironment, SENDGRID_API_KEY: "short" };
  delete envWithShortKey.MAILGUN_API_KEY;
  delete envWithShortKey.POSTMARK_API_KEY;
  delete envWithShortKey.EMAIL_PROVIDER_API_KEY;
  const report = evaluateLaunchReadiness(envWithShortKey, completeCapabilities, new Date("2026-08-24T00:00:00Z"));
  assert.equal(report.checks.find((check) => check.key === "email_delivery")?.ready, false);
  assert.equal(report.ready, false);
});

test("evaluateLaunchReadiness email_delivery trims whitespace-padded keys", () => {
  const envWithPaddedKey = { ...completeEnvironment, SENDGRID_API_KEY: "  SG.test-key-valid-123  " };
  const report = evaluateLaunchReadiness(envWithPaddedKey, completeCapabilities, new Date("2026-08-24T00:00:00Z"));
  assert.equal(report.checks.find((check) => check.key === "email_delivery")?.ready, true);
});
