import assert from "node:assert/strict";
import test from "node:test";
import {
  ConsentPurpose,
  appendConsentEvent,
  createConsentAcceptedEvent,
  createConsentPolicyConfig,
  createConsentRevokedEvent,
  decideConsentAuthorization,
  decideRetentionAndDeletion,
  isConsentEventLog,
  isConsentEventV1,
  type ConsentPolicyConfig,
} from "./index.js";

const subject = Object.freeze({ actorId: "actor-1", accountId: "account-1", caseId: "case-1" });

function policy(): ConsentPolicyConfig {
  return createConsentPolicyConfig({
    consentVersion: "consent-2026-08",
    privacyNoticeVersion: "privacy-2026-08",
    termsVersion: "terms-2026-08",
    providers: {
      mediaPersistence: ["first-party-media"],
      humanReviewSharing: ["review-team"],
      productLearning: ["learning-pipeline"],
    },
    retentionDeletionPolicy: {
      policyId: "configured-lifecycle-policy",
      policyVersion: "policy-7",
      decide: ({ consentState }) => ({
        retention: consentState === "revoked" ? "retention_not_required" : "retain",
        deletionEligibility: consentState === "revoked" ? "eligible" : "not_eligible",
        reasonCode: consentState === "revoked" ? "configured-revoked-rule" : "configured-active-rule",
      }),
    },
  });
}

function accepted(
  choices: Partial<Record<ConsentPurpose, boolean>> = {},
  overrides: Partial<Parameters<typeof createConsentAcceptedEvent>[0]> = {},
) {
  return createConsentAcceptedEvent({
    ...subject,
    eventId: "accept-1",
    acceptedAt: "2026-08-24T18:00:00.000Z",
    consentVersion: "consent-2026-08",
    privacyNoticeVersion: "privacy-2026-08",
    termsVersion: "terms-2026-08",
    affirmativeChoices: {
      [ConsentPurpose.ServiceFulfillment]: true,
      [ConsentPurpose.MediaProcessing]: true,
      [ConsentPurpose.HumanReviewSharing]: true,
      ...choices,
    },
    ...overrides,
  });
}

test("accepted events are versioned and immutable, with optional learning defaulted off", () => {
  const event = accepted();

  assert.equal(event.schemaVersion, 1);
  assert.equal(event.actorId, subject.actorId);
  assert.equal(event.accountId, subject.accountId);
  assert.equal(event.caseId, subject.caseId);
  assert.equal(event.affirmativeChoices[ConsentPurpose.OptionalProductLearning], false);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.affirmativeChoices), true);

  const log = appendConsentEvent([], event);
  assert.equal(Object.isFrozen(log), true);
  assert.equal(log.length, 1);
});

test("runtime validation accepts a valid consent event and event log", () => {
  const event = accepted();

  assert.equal(isConsentEventV1(event), true);
  assert.equal(isConsentEventLog([event]), true);
  assert.equal(
    decideConsentAuthorization({
      events: [event],
      subject,
      action: { kind: "persist_media", providerId: "first-party-media" },
      config: policy(),
    }).allowed,
    true,
  );
});

test("unsupported or malformed schema versions fail closed", () => {
  for (const schemaVersion of [2, "1", undefined]) {
    const malformed = { ...accepted(), schemaVersion };
    const decision = decideConsentAuthorization({
      events: [malformed],
      subject,
      action: { kind: "persist_media", providerId: "first-party-media" },
      config: policy(),
    });

    assert.equal(isConsentEventV1(malformed), false);
    assert.deepEqual(decision, {
      allowed: false,
      code: "invalid_consent_event",
      requiredPurposes: [ConsentPurpose.ServiceFulfillment, ConsentPurpose.MediaProcessing],
    });
  }
});

test("invalid or non-ISO consent timestamps fail closed", () => {
  for (const acceptedAt of ["not-a-date", "2026-02-30T18:00:00.000Z", "August 24, 2026"]) {
    const malformed = { ...accepted(), acceptedAt };
    const decision = decideConsentAuthorization({
      events: [malformed],
      subject,
      action: { kind: "fulfill_service" },
      config: policy(),
    });

    assert.equal(isConsentEventV1(malformed), false);
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.code, "invalid_consent_event");
  }
});

test("non-boolean choices, including the string false, fail closed", () => {
  for (const invalidChoice of ["false", 0, null]) {
    const valid = accepted();
    const malformed = {
      ...valid,
      affirmativeChoices: {
        ...valid.affirmativeChoices,
        [ConsentPurpose.MediaProcessing]: invalidChoice,
      },
    };
    const decision = decideConsentAuthorization({
      events: [malformed],
      subject,
      action: { kind: "persist_media", providerId: "first-party-media" },
      config: policy(),
    });

    assert.equal(isConsentEventV1(malformed), false);
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.code, "invalid_consent_event");
  }
});

test("retention policy is not called with a malformed consent log", () => {
  const malformed = { ...accepted(), acceptedAt: "not-a-date" };

  assert.throws(
    () =>
      decideRetentionAndDeletion({
        events: [malformed],
        subject,
        now: "2026-08-24T20:00:00.000Z",
        config: policy(),
      }),
    /acceptedAt must be an ISO date-time/,
  );
});

test("media persistence and reviewer sharing fail closed when consent is missing", () => {
  const config = policy();
  const media = decideConsentAuthorization({
    events: [],
    subject,
    action: { kind: "persist_media", providerId: "first-party-media" },
    config,
  });
  const review = decideConsentAuthorization({
    events: [],
    subject,
    action: { kind: "share_with_human_reviewer", providerId: "review-team" },
    config,
  });

  assert.deepEqual(media, {
    allowed: false,
    code: "missing_consent",
    requiredPurposes: [ConsentPurpose.ServiceFulfillment, ConsentPurpose.MediaProcessing],
  });
  assert.equal(review.allowed, false);
  if (!review.allowed) assert.equal(review.code, "missing_consent");
});

test("stale consent, privacy, or terms versions are rejected", () => {
  for (const stale of [
    { consentVersion: "consent-old" },
    { privacyNoticeVersion: "privacy-old" },
    { termsVersion: "terms-old" },
  ]) {
    const event = accepted({}, stale);
    const decision = decideConsentAuthorization({
      events: [event],
      subject,
      action: { kind: "persist_media", providerId: "first-party-media" },
      config: policy(),
    });
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.code, "stale_consent");
  }
});

test("case-bound consent cannot authorize a different case", () => {
  const decision = decideConsentAuthorization({
    events: [accepted()],
    subject: { ...subject, caseId: "case-2" },
    action: { kind: "share_with_human_reviewer", providerId: "review-team" },
    config: policy(),
  });

  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.code, "wrong_case");
});

test("revocation blocks its protected action and is surfaced to configured lifecycle policy", () => {
  const acceptance = accepted();
  const revocation = createConsentRevokedEvent({
    ...subject,
    eventId: "revoke-1",
    acceptanceEventId: acceptance.eventId,
    revokedAt: "2026-08-24T19:00:00.000Z",
    purposes: [
      ConsentPurpose.ServiceFulfillment,
      ConsentPurpose.MediaProcessing,
      ConsentPurpose.HumanReviewSharing,
    ],
  });
  const events = appendConsentEvent(appendConsentEvent([], acceptance), revocation);
  const authorization = decideConsentAuthorization({
    events,
    subject,
    action: { kind: "persist_media", providerId: "first-party-media" },
    config: policy(),
  });

  assert.equal(authorization.allowed, false);
  if (!authorization.allowed) assert.equal(authorization.code, "revoked_consent");

  const lifecycle = decideRetentionAndDeletion({
    events,
    subject,
    now: "2026-08-24T20:00:00.000Z",
    config: policy(),
  });
  assert.equal(lifecycle.consentState, "revoked");
  assert.equal(lifecycle.policyId, "configured-lifecycle-policy");
  assert.equal(lifecycle.policyVersion, "policy-7");
  assert.equal(lifecycle.retention, "retention_not_required");
  assert.equal(lifecycle.deletionEligibility, "eligible");
  assert.deepEqual(lifecycle.revokedPurposes, [
    ConsentPurpose.ServiceFulfillment,
    ConsentPurpose.MediaProcessing,
    ConsentPurpose.HumanReviewSharing,
  ]);
});

test("optional learning is independent and cannot substitute for required consent", () => {
  const config = policy();
  const optionalOff = accepted();
  const serviceDecision = decideConsentAuthorization({
    events: [optionalOff],
    subject,
    action: { kind: "fulfill_service" },
    config,
  });
  const learningDecision = decideConsentAuthorization({
    events: [optionalOff],
    subject,
    action: { kind: "use_for_product_learning", providerId: "learning-pipeline" },
    config,
  });
  assert.equal(serviceDecision.allowed, true);
  assert.equal(learningDecision.allowed, false);
  if (!learningDecision.allowed) assert.equal(learningDecision.code, "purpose_not_granted");

  const optionalOnlyCannotAuthorizeMedia = accepted({
    [ConsentPurpose.ServiceFulfillment]: false,
    [ConsentPurpose.MediaProcessing]: false,
    [ConsentPurpose.HumanReviewSharing]: false,
    [ConsentPurpose.OptionalProductLearning]: true,
  });
  const mediaDecision = decideConsentAuthorization({
    events: [optionalOnlyCannotAuthorizeMedia],
    subject,
    action: { kind: "persist_media", providerId: "first-party-media" },
    config,
  });
  assert.equal(mediaDecision.allowed, false);
  if (!mediaDecision.allowed) assert.equal(mediaDecision.code, "purpose_not_granted");
});

test("configured provider allowlists are enforced independently from consent", () => {
  const decision = decideConsentAuthorization({
    events: [accepted()],
    subject,
    action: { kind: "persist_media", providerId: "unknown-provider" },
    config: policy(),
  });

  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.code, "provider_not_configured");
});
