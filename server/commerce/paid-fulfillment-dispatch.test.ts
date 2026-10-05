import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryDeliveryOutbox } from "../jobs/in-memory-delivery-outbox.js";
import type { DeliveryOutboxCapabilities, DeliveryOutboxRepository } from "../jobs/delivery-outbox.js";
import { InMemoryReviewRepository } from "../review/in-memory-review-repository.js";
import type { ReviewRepository } from "../review/types.js";
import type { CommerceOrder, CommerceOrderRepositoryCapabilities } from "./order-contract.js";
import { PaidFulfillmentDispatcher } from "./paid-fulfillment-dispatch.js";
import { PaidFulfillmentEligibilityService } from "./paid-fulfillment-eligibility.js";

const recipient = Object.freeze({ algorithm: "sha256" as const, digest: "a".repeat(64), bindingVersion: "recipient_v1" });
const durableCommerce: CommerceOrderRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository", durable: true, atomicCompareAndSwap: true,
  idempotentEvents: true, generatedIdentifiers: true,
});
const durableOutboxCapabilities: DeliveryOutboxCapabilities = Object.freeze({
  backendClass: "durable-repository", durable: true, horizontallyScalable: true,
  atomicLeasing: true, fencedAcknowledgement: true, idempotentEnqueue: true,
});

function setup(state: CommerceOrder["state"] = "verified") {
  const order: CommerceOrder = Object.freeze({
    schemaVersion: 1,
    orderId: "ord_dispatch_1",
    caseId: "case_dispatch_1",
    offer: Object.freeze({ offerId: "human_pro_review", offerVersion: "v1", label: "Human Pro Review", amountMinor: 9900, currency: "USD" }),
    state,
    provider: state === "pending" ? null : Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_dispatch_1" }),
    version: 2,
    eventCount: 1,
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:01:00.000Z",
    refundReasonCode: null,
  });
  const reviewDb = new InMemoryReviewRepository({ generateId: (() => { let n = 0; return () => `dispatch_${++n}`; })() });
  const reviewInput = {
    caseId: order.caseId,
    artifactDigest: "b".repeat(64),
    recipient,
    riskLevel: "moderate" as const,
    policyVersion: "policy_dispatch_v1",
    modelVersion: "model_dispatch_v1",
    evidenceVersion: "evidence_dispatch_v1",
  };
  const draft = reviewDb.createDraft(reviewInput);
  const final = reviewDb.createFinal({ ...reviewInput, sourceVersionId: draft.versionId });
  reviewDb.approve({ versionId: final.versionId, caseId: order.caseId, reviewerRef: "reviewer_12345678" });
  const reviews: ReviewRepository = {
    capabilities: Object.freeze({ backendClass: "durable-repository", durable: true, appendOnlyAudit: true, caseBoundTransitions: true, generatedIdentifiers: true }),
    createDraft: reviewDb.createDraft.bind(reviewDb), createFinal: reviewDb.createFinal.bind(reviewDb),
    approve: reviewDb.approve.bind(reviewDb), reject: reviewDb.reject.bind(reviewDb), supersede: reviewDb.supersede.bind(reviewDb),
    getVersion: reviewDb.getVersion.bind(reviewDb), getVersionState: reviewDb.getVersionState.bind(reviewDb),
    getCurrentVersionId: reviewDb.getCurrentVersionId.bind(reviewDb),
  };
  const baseOutbox = new InMemoryDeliveryOutbox();
  const outbox: DeliveryOutboxRepository = {
    ...baseOutbox,
    capabilities: durableOutboxCapabilities,
    enqueue: baseOutbox.enqueue.bind(baseOutbox), get: baseOutbox.get.bind(baseOutbox),
    leaseNext: baseOutbox.leaseNext.bind(baseOutbox), ack: baseOutbox.ack.bind(baseOutbox),
    nack: baseOutbox.nack.bind(baseOutbox), replay: baseOutbox.replay.bind(baseOutbox),
  };
  const request = {
    orderId: order.orderId,
    caseId: order.caseId,
    casePersistenceVersion: "case_persist_dispatch_v1",
    versionId: final.versionId,
    policyVersion: reviewInput.policyVersion,
    modelVersion: reviewInput.modelVersion,
    evidenceVersion: reviewInput.evidenceVersion,
    recipient,
  };
  const eligibility = new PaidFulfillmentEligibilityService({
    commerceOrders: { capabilities: durableCommerce, get: async () => order },
    cases: {
      capabilities: Object.freeze({ backendClass: "durable-repository", durable: true, caseBound: true, versionedPersistence: true }),
      getPersistence: async () => Object.freeze({
        caseId: order.caseId,
        persistenceVersion: "case_persist_dispatch_v1",
        evidenceVersion: reviewInput.evidenceVersion,
        state: "persisted",
        persistedAt: "2026-10-05T10:00:00.000Z",
      }),
    },
    reviews,
    deliveryOutbox: outbox,
  });
  return { dispatcher: new PaidFulfillmentDispatcher(eligibility, outbox), request };
}

test("confirmed payment plus durable approval enqueues one idempotent result delivery", async () => {
  const { dispatcher, request } = setup();
  const first = await dispatcher.dispatch(request);
  const second = await dispatcher.dispatch(request);
  assert.equal(first.eligibility.allowed, true);
  assert.equal(first.delivery?.disposition, "created");
  assert.equal(second.eligibility.allowed, true);
  assert.equal(second.delivery?.disposition, "duplicate");
  assert.equal(first.delivery?.job.caseId, request.caseId);
  assert.equal(first.delivery?.job.metadata.resourceVersion, request.versionId);
});

test("failed payment cannot enqueue delivery even when a review is approved", async () => {
  const { dispatcher, request } = setup("failed");
  const result = await dispatcher.dispatch(request);
  assert.equal(result.eligibility.allowed, false);
  if (!result.eligibility.allowed) assert.equal(result.eligibility.code, "payment_not_verified");
  assert.equal(result.delivery, undefined);
});
