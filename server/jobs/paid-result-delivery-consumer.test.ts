import assert from "node:assert/strict";
import test from "node:test";
import type { CommerceOrder, CommerceOrderRepositoryCapabilities } from "../commerce/order-contract.js";
import {
  PaidFulfillmentEligibilityService,
  type PaidCasePersistenceRepositoryCapabilities,
  type PaidFulfillmentEligibilityInput,
} from "../commerce/paid-fulfillment-eligibility.js";
import { InMemoryReviewRepository } from "../review/in-memory-review-repository.js";
import type { RecipientIdentityBinding, ReviewRepository } from "../review/types.js";
import type { DeliveryOutboxCapabilities, DeliveryOutboxRepository } from "./delivery-outbox.js";
import { InMemoryDeliveryOutbox } from "./in-memory-delivery-outbox.js";
import {
  PaidDeliveryProviderError,
  PaidResultDeliveryConsumer,
  type PaidDeliveryReceipt,
  type PaidDeliveryReceiptRepository,
  type PaidResultDeliveryProvider,
} from "./paid-result-delivery-consumer.js";
import type { PaidDeliveryAuthorizationContext, ApprovedPaidResult } from "./paid-delivery-context.js";

const NOW = "2026-10-15T12:00:00.000Z";
const CASE_ID = "case_consumer_1";
const ORDER_ID = "order_consumer_1";
const RECIPIENT: RecipientIdentityBinding = Object.freeze({
  algorithm: "sha256",
  digest: "a".repeat(64),
  bindingVersion: "recipient_v1",
});
const DURABLE_COMMERCE: CommerceOrderRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository", durable: true, atomicCompareAndSwap: true,
  idempotentEvents: true, generatedIdentifiers: true,
});
const DURABLE_CASE: PaidCasePersistenceRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository", durable: true, caseBound: true, versionedPersistence: true,
});
const DURABLE_OUTBOX: DeliveryOutboxCapabilities = Object.freeze({
  backendClass: "durable-repository", durable: true, horizontallyScalable: true,
  atomicLeasing: true, fencedAcknowledgement: true, idempotentEnqueue: true,
});

async function setup() {
  let order: CommerceOrder = Object.freeze({
    schemaVersion: 1,
    orderId: ORDER_ID,
    caseId: CASE_ID,
    offer: Object.freeze({ offerId: "human_review", offerVersion: "v1", label: "Human review", amountMinor: 9900, currency: "USD" }),
    state: "verified",
    provider: Object.freeze({ adapterId: "test_provider", provider: "test", providerOrderReference: "payment_ref_123" }),
    version: 2,
    eventCount: 1,
    createdAt: "2026-10-15T11:00:00.000Z",
    updatedAt: "2026-10-15T11:01:00.000Z",
    refundReasonCode: null,
    refundedAmountMinor: 0,
  });

  let sequence = 0;
  const reviewStore = new InMemoryReviewRepository({
    now: () => new Date(NOW),
    generateId: () => `consumer_generated_${++sequence}`,
  });
  const commonReview = {
    caseId: CASE_ID,
    artifactDigest: "b".repeat(64),
    recipient: RECIPIENT,
    riskLevel: "moderate" as const,
    policyVersion: "policy_v1",
    modelVersion: "model_v1",
    evidenceVersion: "evidence_v1",
  };
  const draft = reviewStore.createDraft(commonReview);
  const final = reviewStore.createFinal({ ...commonReview, sourceVersionId: draft.versionId });
  const approval = reviewStore.approve({ versionId: final.versionId, caseId: CASE_ID, reviewerRef: "reviewer_12345678" });
  const reviews: ReviewRepository = {
    capabilities: Object.freeze({ backendClass: "durable-repository", durable: true,
      appendOnlyAudit: true, caseBoundTransitions: true, generatedIdentifiers: true }),
    createDraft: reviewStore.createDraft.bind(reviewStore),
    createFinal: reviewStore.createFinal.bind(reviewStore),
    approve: reviewStore.approve.bind(reviewStore),
    reject: reviewStore.reject.bind(reviewStore),
    supersede: reviewStore.supersede.bind(reviewStore),
    getVersion: reviewStore.getVersion.bind(reviewStore),
    getVersionState: reviewStore.getVersionState.bind(reviewStore),
    getCurrentVersionId: reviewStore.getCurrentVersionId.bind(reviewStore),
  };

  let clock = Date.parse(NOW);
  const baseOutbox = new InMemoryDeliveryOutbox({ now: () => new Date(clock) });
  const outbox: DeliveryOutboxRepository = {
    capabilities: DURABLE_OUTBOX,
    enqueue: baseOutbox.enqueue.bind(baseOutbox),
    get: baseOutbox.get.bind(baseOutbox),
    leaseNext: baseOutbox.leaseNext.bind(baseOutbox),
    ack: baseOutbox.ack.bind(baseOutbox),
    nack: baseOutbox.nack.bind(baseOutbox),
    replay: baseOutbox.replay.bind(baseOutbox),
  };
  const request: PaidFulfillmentEligibilityInput = Object.freeze({
    orderId: ORDER_ID,
    caseId: CASE_ID,
    casePersistenceVersion: "case_persist_v1",
    versionId: final.versionId,
    policyVersion: commonReview.policyVersion,
    modelVersion: commonReview.modelVersion,
    evidenceVersion: commonReview.evidenceVersion,
    recipient: RECIPIENT,
  });
  const approvedResult: ApprovedPaidResult = Object.freeze({
    caseId: CASE_ID, versionId: final.versionId, artifactDigest: commonReview.artifactDigest,
    recipientEmail: "test-recipient@example.invalid",
    content: Object.freeze({ vehicleInfo: "2018 Test Vehicle", description: "Synthetic test only", outcome: "monitor",
      confidenceLevel: "medium", confidenceScore: 0.7, riskLevel: "medium", decisionPath: "monitor",
      matchedSymptomCategories: Object.freeze([]), safetyFlags: Object.freeze([]), safetyTriggered: false,
      evidence: Object.freeze([]) }),
  });
  const context: PaidDeliveryAuthorizationContext = Object.freeze({ eligibilityInput: request, approvedResult });
  const eligibility = new PaidFulfillmentEligibilityService({
    commerceOrders: {
      capabilities: DURABLE_COMMERCE,
      get: async () => order,
      hasVerifiedPayment: async () => order.state === "verified" && order.provider !== null,
    },
    cases: {
      capabilities: DURABLE_CASE,
      getPersistence: async () => ({ caseId: CASE_ID, persistenceVersion: request.casePersistenceVersion,
        evidenceVersion: request.evidenceVersion, state: "persisted", persistedAt: "2026-10-15T10:59:00.000Z" }),
    },
    reviews,
    deliveryOutbox: outbox,
  }, { now: () => new Date(NOW) });

  const enqueued = await outbox.enqueue({
    caseId: CASE_ID,
    deduplicationKey: `release:${ORDER_ID}:${approval.approvalId}`,
    metadata: { resourceKind: "case", resourceId: CASE_ID, resourceVersion: final.versionId,
      destinationKey: "journey-approved-result", channel: "internal_queue" },
    retryPolicy: { maxAttempts: 4, initialRetryDelayMs: 1000, backoffMultiplier: 2,
      maxRetryDelayMs: 60_000, leaseDurationMs: 30_000 },
  });

  const records = new Map<string, PaidDeliveryReceipt>();
  const receipts: PaidDeliveryReceiptRepository = {
    capabilities: Object.freeze({ backendClass: "durable-repository", durable: true, idempotentByJob: true }),
    async record(input) {
      const existing = records.get(input.jobId);
      if (existing) return existing;
      const receipt = Object.freeze({ ...input, receiptId: `receipt_${input.jobId}`, createdAt: NOW });
      records.set(input.jobId, receipt);
      return receipt;
    },
    async getByJobId(jobId) { return records.get(jobId) ?? null; },
  };
  const providerCalls: string[] = [];
  let providerFailure: PaidDeliveryProviderError | undefined;
  let ambiguousOnce = false;
  const acceptedByKey = new Map<string, { providerReference: string; acceptedAt: string }>();
  const provider: PaidResultDeliveryProvider = {
    capabilities: Object.freeze({ backendClass: "test-provider", idempotentByKey: true }),
    async deliver({ idempotencyKey }) {
      providerCalls.push(idempotencyKey);
      if (providerFailure) throw providerFailure;
      let accepted = acceptedByKey.get(idempotencyKey);
      if (!accepted) {
        accepted = { providerReference: `delivery_ref_${acceptedByKey.size + 1}`, acceptedAt: NOW };
        acceptedByKey.set(idempotencyKey, accepted);
        if (ambiguousOnce) { ambiguousOnce = false; throw new Error("synthetic response lost after acceptance"); }
      }
      return Object.freeze({ provider: "test_provider", ...accepted });
    },
  };
  const resolver = { resolve: async () => context, getReviewVersion: async (id: string) => reviewStore.getVersion(id) };
  const consumer = (overrideResolver = resolver) => new PaidResultDeliveryConsumer(outbox, eligibility,
    overrideResolver, provider, receipts, { allowIsolatedTestProvider: true });

  return {
    approval, baseOutbox, outbox, enqueued, eligibility, consumer, provider, providerCalls, receipts, records, acceptedByKey,
    setPaymentState(nextState: CommerceOrder["state"]) {
      order = Object.freeze({ ...order, state: nextState,
        provider: nextState === "pending" ? null : order.provider,
        refundReasonCode: ["refunded", "partial_refund", "refund_required"].includes(nextState) ? "provider_refund" : null,
        refundedAmountMinor: nextState === "refunded" ? order.offer.amountMinor : nextState === "partial_refund" ? 1 : 0,
      });
    },
    supersede() { reviewStore.createDraft(commonReview); },
    failProvider(retryable: boolean) { providerFailure = new PaidDeliveryProviderError(retryable); },
    makeAmbiguousOnce() { ambiguousOnce = true; },
    advanceClock(ms: number) { clock += ms; },
    resolver,
  };
}

test("rechecks approval and payment, stores an idempotent receipt, then acknowledges", async () => {
  const state = await setup();
  const result = await state.consumer().processNext(CASE_ID);
  assert.equal(result.status, "provider_accepted");
  assert.deepEqual(state.providerCalls, [state.enqueued.job.jobId]);
  assert.equal(state.records.size, 1);
  assert.equal((await state.outbox.get(CASE_ID, state.enqueued.job.jobId))?.state, "delivered");
});

test("a paid order that later becomes refunded cannot deliver queued content", async () => {
  const state = await setup();
  state.setPaymentState("refunded");
  const result = await state.consumer().processNext(CASE_ID);
  assert.equal(result.status, "dead_lettered");
  assert.equal(state.providerCalls.length, 0);
  assert.equal(state.records.size, 0);
});

test("failed, cancellation-required, and partially refunded payment states cannot deliver", async () => {
  for (const stateName of ["failed", "refund_required", "partial_refund"] as const) {
    const state = await setup();
    state.setPaymentState(stateName);
    const result = await state.consumer().processNext(CASE_ID);
    assert.equal(result.status, "dead_lettered", stateName);
    assert.equal(state.providerCalls.length, 0, stateName);
  }
});

test("a newer review version revokes the previous approval for queued delivery", async () => {
  const state = await setup();
  state.supersede();
  const result = await state.consumer().processNext(CASE_ID);
  assert.equal(result.status, "dead_lettered");
  assert.equal(result.code, "review_not_authorized");
  assert.equal(state.providerCalls.length, 0);
});

test("provider failures are NACKed without writing a receipt", async () => {
  const state = await setup();
  state.failProvider(true);
  const result = await state.consumer().processNext(CASE_ID);
  assert.equal(result.status, "retry_scheduled");
  assert.equal(result.code, "delivery_provider_unavailable");
  assert.equal(state.records.size, 0);
  assert.equal((await state.outbox.get(CASE_ID, state.enqueued.job.jobId))?.state, "failed");
});

test("provider acceptance with a lost response replays after restart using the same provider idempotency key", async () => {
  const state = await setup();
  state.makeAmbiguousOnce();
  const first = await state.consumer().processNext(CASE_ID);
  assert.equal(first.status, "retry_scheduled");
  assert.equal(state.acceptedByKey.size, 1);
  state.advanceClock(1_001);
  const restartedConsumer = state.consumer();
  const retry = await restartedConsumer.processNext(CASE_ID);
  assert.equal(retry.status, "provider_accepted");
  assert.equal(state.acceptedByKey.size, 1);
  assert.deepEqual(state.providerCalls, [state.enqueued.job.jobId, state.enqueued.job.jobId]);
  assert.equal(state.records.size, 1);
});

test("content changed between authorization reads is rejected before provider handoff", async () => {
  const state = await setup();
  let reads = 0;
  const changedResolver = {
    getReviewVersion: state.resolver.getReviewVersion,
    async resolve() {
      reads += 1;
      const base = await state.resolver.resolve(state.enqueued.job as any);
      if (reads < 2 || !base) return base;
      return Object.freeze({ ...base, approvedResult: Object.freeze({ ...base.approvedResult,
        artifactDigest: "c".repeat(64) }) });
    },
  };
  const result = await state.consumer(changedResolver).processNext(CASE_ID);
  assert.equal(result.status, "dead_lettered");
  assert.equal(result.code, "approved_content_changed");
  assert.equal(state.providerCalls.length, 0);
});

test("ephemeral repositories and non-idempotent providers cannot construct a consumer", async () => {
  const state = await setup();
  assert.throws(() => new PaidResultDeliveryConsumer(state.outbox, state.eligibility,
    state.resolver, state.provider, state.receipts));
  assert.throws(() => new PaidResultDeliveryConsumer(
    state.baseOutbox, state.eligibility, { resolve: async () => null }, state.provider, state.receipts,
  ));
  assert.throws(() => new PaidResultDeliveryConsumer(state.outbox, state.eligibility,
    { resolve: async () => null },
    { capabilities: { backendClass: "test-provider", idempotentByKey: false },
      deliver: async () => ({ provider: "test", providerReference: "x", acceptedAt: NOW }) },
    state.receipts));
});
