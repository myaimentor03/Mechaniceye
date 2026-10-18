import assert from "node:assert/strict";
import test from "node:test";
import { appendConsentEvent, ConsentPurpose, createConsentAcceptedEvent, createConsentRevokedEvent } from "../../shared/consent/index.js";
import { InMemoryDeliveryOutbox } from "./in-memory-delivery-outbox.js";
import { caseArtifactDigest, recipientBinding } from "../journey-review-bridge.js";
import { InMemoryReviewRepository } from "../review/in-memory-review-repository.js";
import { DurablePaidDeliveryContextResolver } from "./paid-delivery-context.js";
import type { JourneyCase } from "../journey-state-machine.js";

const NOW = "2026-10-17T12:00:00.000Z";
const ENV = {
  DRIVABLE_CONSENT_VERSION: "consent-v1",
  DRIVABLE_PRIVACY_VERSION: "privacy-v1",
  DRIVABLE_TERMS_VERSION: "terms-v1",
} as NodeJS.ProcessEnv;

function makeCase(customerId = "customer_test_12345678"): JourneyCase {
  return {
    id: "case_paid_test_12345678", state: "resolved", createdAt: NOW, updatedAt: NOW,
    vehicleInfo: "2018 Synthetic Vehicle", description: "Synthetic test only", customerId,
    customerEmail: "recipient@example.invalid", evidence: [], safetyFlags: [], safetyTriggered: false,
    confidenceScore: 0.75, confidenceLevel: "medium", riskLevel: "medium", outcome: "monitor",
    decisionPath: "monitor", humanReviewRequested: true, matchedSymptomCategories: [], plannedEvidence: [],
  };
}

function acceptedConsent(caseData: JourneyCase) {
  return createConsentAcceptedEvent({
    actorId: caseData.customerId!, accountId: caseData.customerId!, caseId: caseData.id,
    eventId: "consent_accepted_paid_test_12345678", acceptedAt: NOW,
    consentVersion: "consent-v1", privacyNoticeVersion: "privacy-v1", termsVersion: "terms-v1",
    affirmativeChoices: {
      [ConsentPurpose.ServiceFulfillment]: true,
      [ConsentPurpose.MediaProcessing]: false,
      [ConsentPurpose.HumanReviewSharing]: false,
      [ConsentPurpose.OptionalProductLearning]: false,
    },
  });
}

async function setup(options: {
  caseData?: JourneyCase;
  consentEvents?: import("../../shared/consent/index.js").ConsentEventV1[];
  consentFailure?: boolean;
} = {}) {
  const caseData = options.caseData ?? makeCase();
  const digest = caseArtifactDigest(caseData);
  const recipient = recipientBinding(caseData);
  const reviews = new InMemoryReviewRepository({ now: () => new Date(NOW), generateId: (() => {
    let id = 0;
    return () => `review_paid_test_${++id}`;
  })() });
  const bindings = { caseId: caseData.id, artifactDigest: digest, recipient, riskLevel: "moderate" as const,
    policyVersion: "journey-review-v1", modelVersion: "journey-guided-v1", evidenceVersion: "evidence-v1" };
  const draft = reviews.createDraft(bindings);
  const final = reviews.createFinal({ ...bindings, sourceVersionId: draft.versionId });
  const approval = reviews.approve({ caseId: caseData.id, versionId: final.versionId, reviewerRef: "reviewer_test_12345678" });
  const accepted = options.consentEvents ? undefined : acceptedConsent(caseData);
  let events: readonly import("../../shared/consent/index.js").ConsentEventV1[] = options.consentEvents ?? (accepted ? [accepted] : []);
  const order = {
    schemaVersion: 1 as const, orderId: "order_paid_test_12345678", caseId: caseData.id,
    offer: { offerId: "review", offerVersion: "v1", label: "Review", amountMinor: 9900, currency: "USD" },
    state: "verified" as const,
    provider: { adapterId: "synthetic", provider: "test", providerOrderReference: "payment_ref_test" },
    version: 1, eventCount: 1, createdAt: NOW, updatedAt: NOW, refundReasonCode: null, refundedAmountMinor: 0,
  };
  const outbox = new InMemoryDeliveryOutbox({ now: () => new Date(NOW) });
  const queued = await outbox.enqueue({
    caseId: caseData.id, deduplicationKey: `release:${order.orderId}:${approval.approvalId}`,
    metadata: { resourceKind: "case", resourceId: caseData.id, resourceVersion: final.versionId,
      destinationKey: "journey-approved-result", channel: "internal_queue" },
    retryPolicy: { maxAttempts: 3, initialRetryDelayMs: 0, backoffMultiplier: 1, maxRetryDelayMs: 0, leaseDurationMs: 30_000 },
  });
  const leased = await outbox.leaseNext({ caseId: caseData.id });
  assert.ok(leased);

  const repositories: PaidDeliveryContextRepositories = {
    orders: {
      capabilities: { backendClass: "durable-repository", durable: true, atomicCompareAndSwap: true, idempotentEvents: true, generatedIdentifiers: true },
      async create() { throw new Error("not used"); },
      async get(id) { return id === order.orderId ? order : null; },
      async getEventFingerprint() { return null; },
      async commitEvent() { throw new Error("not used"); },
      async hasVerifiedPayment(id) { return id === order.orderId; },
    },
    cases: { async getStrict(id) { return id === caseData.id ? caseData : undefined; } },
    reviews,
    consent: { async listForSubject(subject) {
      if (options.consentFailure) throw new Error("synthetic storage outage");
      if (subject.actorId !== caseData.customerId || subject.accountId !== caseData.customerId || subject.caseId !== caseData.id) return [];
      return events;
    } },
    outbox: { capabilities: outbox.capabilities },
  };
  return {
    caseData, accepted, outbox, queued, leased, approval,
    resolver: new DurablePaidDeliveryContextResolver(repositories, ENV),
    replaceEvents(next: typeof events) { events = next; },
  };
}

test("paid delivery context requires current case-bound service fulfillment consent", async () => {
  const state = await setup();
  assert.ok(await state.resolver.resolve(state.leased!));

  const revoked = createConsentRevokedEvent({
    actorId: state.caseData.customerId!, accountId: state.caseData.customerId!, caseId: state.caseData.id,
    eventId: "consent_revoked_paid_test_12345678", acceptanceEventId: state.accepted!.eventId,
    revokedAt: "2026-10-17T12:01:00.000Z", purposes: [ConsentPurpose.ServiceFulfillment],
  });
  state.replaceEvents(appendConsentEvent([state.accepted!], revoked));
  assert.equal(await state.resolver.resolve(state.leased!), null, "revoked service fulfillment consent must prevent release");
});

test("paid delivery denies missing, stale, wrong-subject, or unreadable consent", async () => {
  const missing = await setup({ consentEvents: [] });
  assert.equal(await missing.resolver.resolve(missing.leased!), null);

  const stale = await setup();
  const staleEvent = createConsentAcceptedEvent({ ...stale.accepted, consentVersion: "old-consent" });
  stale.replaceEvents([staleEvent]);
  assert.equal(await stale.resolver.resolve(stale.leased!), null);

  const wrongOwner = await setup();
  const wrongEvent = createConsentAcceptedEvent({ ...wrongOwner.accepted, actorId: "different_owner_12345678" });
  wrongOwner.replaceEvents([wrongEvent]);
  assert.equal(await wrongOwner.resolver.resolve(wrongOwner.leased!), null);

  const unavailable = await setup({ consentFailure: true });
  // A canonical repository error is surfaced so the consumer can retry without releasing.
  await assert.rejects(unavailable.resolver.resolve(unavailable.leased!));
});

test("missing owner identity cannot inherit consent from the queue", async () => {
  const ownedCase = makeCase();
  const state = await setup({ caseData: { ...ownedCase, customerId: undefined }, consentEvents: [acceptedConsent(ownedCase)] });
  assert.equal(await state.resolver.resolve(state.leased!), null);
});
