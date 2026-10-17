import assert from "node:assert/strict";
import test from "node:test";
import { createJourneyCase } from "../journey-state-machine.js";
import { createPgJourneyStore } from "../journey-store-pg.js";
import { caseArtifactDigest, JOURNEY_REVIEW_BINDINGS, recipientBinding } from "../journey-review-bridge.js";
import { InMemoryReviewRepository } from "../review/in-memory-review-repository.js";
import type { AsyncReviewReleaseReader } from "../review/async-release-gate.js";
import { InMemoryDeliveryOutbox } from "./in-memory-delivery-outbox.js";
import { DurablePaidDeliveryContextResolver, createJourneyPaidCasePersistenceRepository } from "./paid-delivery-context.js";
import { IdempotentPaidResultDeliveryProvider } from "./idempotent-paid-result-provider.js";
import { InMemoryPaidResultTestSink } from "./in-memory-paid-result-test-sink.js";
import { composePaidResultDeliveryWorker, composePostgresPaidResultDeliveryWorker } from "./paid-result-delivery-runtime.js";
import type { PaidResultDeliveryConsumer } from "./paid-result-delivery-consumer.js";
import type { LeasedDeliveryJob } from "./delivery-outbox.js";
import type { ApprovedPaidResult } from "./paid-delivery-context.js";

const now = "2026-10-15T12:00:00.000Z";
const retryPolicy = { maxAttempts: 3, initialRetryDelayMs: 100, backoffMultiplier: 2,
  maxRetryDelayMs: 1000, leaseDurationMs: 5000 } as const;

test("strict canonical Journey reads distinguish storage failure from a missing case", async () => {
  const unavailable = createPgJourneyStore({ async query() { throw new Error("synthetic unavailable"); } });
  await assert.rejects(unavailable.getStrict("case_test_01"));
  const missing = createPgJourneyStore({ async query() { return { rows: [] }; } });
  assert.equal(await missing.getStrict("case_test_01"), undefined);
});

test("durable context resolver binds current order, case, approved artifact, recipient and approval", async () => {
  let caseData = createJourneyCase({ vehicleInfo: "2018 Honda Civic", description: "Synthetic brake noise",
    customerId: "customer_test_01", customerEmail: "test@example.invalid" });
  const review = new InMemoryReviewRepository({ now: () => new Date(now), generateId: (() => {
    let i = 0; return () => `delivery_test_id_${++i}`;
  })() });
  const bindings = { caseId: caseData.id, artifactDigest: caseArtifactDigest(caseData),
    recipient: recipientBinding(caseData), riskLevel: "moderate" as const, ...JOURNEY_REVIEW_BINDINGS };
  const draft = review.createDraft(bindings);
  const final = review.createFinal({ ...bindings, sourceVersionId: draft.versionId });
  const approval = review.approve({ versionId: final.versionId, caseId: caseData.id, reviewerRef: "reviewer_test_12345678" });
  const reviews: AsyncReviewReleaseReader = {
    capabilities: review.capabilities,
    async getVersion(id) { return review.getVersion(id); },
    async getVersionState(id) { return review.getVersionState(id); },
    async getCurrentVersionId(id) { return review.getCurrentVersionId(id); },
  };
  const outbox = new InMemoryDeliveryOutbox({ now: () => new Date(now) });
  const queued = await outbox.enqueue({ caseId: caseData.id, deduplicationKey: `release:order_paid_test_001:${approval.approvalId}`,
    metadata: { resourceKind: "case", resourceId: caseData.id, resourceVersion: final.versionId,
      destinationKey: "journey-approved-result", channel: "internal_queue" }, retryPolicy });
  const job = await outbox.leaseNext({ caseId: caseData.id });
  assert.ok(job);
  const order = { schemaVersion: 1 as const, orderId: "order_paid_test_001", caseId: caseData.id,
    offer: { offerId: "review", offerVersion: "v1", label: "Review", amountMinor: 1000, currency: "USD" },
    state: "verified" as const, provider: { adapterId: "test", provider: "fake", providerOrderReference: "payment_test_01" },
    version: 2, eventCount: 1, createdAt: now, updatedAt: now, refundReasonCode: null, refundedAmountMinor: 0 };
  const resolver = new DurablePaidDeliveryContextResolver({
    orders: { capabilities: { backendClass: "durable-repository", durable: true, atomicCompareAndSwap: true,
      idempotentEvents: true, generatedIdentifiers: true }, get: async id => id === order.orderId ? order : null,
      hasVerifiedPayment: async () => true } as any,
    cases: { getStrict: async id => id === caseData.id ? caseData : undefined }, reviews,
    outbox: { capabilities: { backendClass: "durable-repository", durable: true, horizontallyScalable: true,
      atomicLeasing: true, fencedAcknowledgement: true, idempotentEnqueue: true } },
  });
  const context = await resolver.resolve(job);
  assert.ok(context);
  assert.equal(context.eligibilityInput.orderId, order.orderId);
  assert.equal(context.approvedResult.versionId, final.versionId);
  assert.equal(context.approvedResult.artifactDigest, final.artifactDigest);
  assert.equal(context.approvedResult.recipientEmail, caseData.customerEmail);
  const persistence = createJourneyPaidCasePersistenceRepository({ getStrict: async () => caseData });
  assert.equal((await persistence.getPersistence(caseData.id))?.persistenceVersion, caseArtifactDigest(caseData));

  const approvedSnapshot = caseData;
  caseData = { ...caseData, description: "Changed after approval" };
  assert.equal(await resolver.resolve(job), null);
  caseData = { ...approvedSnapshot, customerEmail: "changed-recipient@example.invalid" };
  assert.equal(await resolver.resolve(job), null);
  assert.ok(queued.job.jobId);
});

test("idempotent transport adapter forwards stable key and approved recipient/content", async () => {
  const sink = new InMemoryPaidResultTestSink({ now: () => new Date(now) });
  const adapter = new IdempotentPaidResultDeliveryProvider(sink);
  const approvedResult = { caseId: "case_test_01", versionId: "review_version_01", artifactDigest: "a".repeat(64),
    recipientEmail: "test@example.invalid", content: {} } as ApprovedPaidResult;
  const authorization = { allowed: true as const, code: "paid_fulfillment_allowed" as const,
    orderId: "order_test_01", caseId: "case_test_01", casePersistenceVersion: "case_digest_01",
    versionId: "review_version_01", approvalId: "approval_test_01",
    offer: { offerId: "review", offerVersion: "v1", label: "Review", amountMinor: 1000, currency: "USD" },
    recipient: { algorithm: "sha256" as const, digest: "b".repeat(64), bindingVersion: "v1" }, evaluatedAt: now };
  const job = { jobId: "job_stable_01" } as LeasedDeliveryJob;
  const deliveryInput = { idempotencyKey: job.jobId, job, approvedResult, authorization };
  const [first, replay] = await Promise.all([
    adapter.deliver(deliveryInput),
    adapter.deliver(deliveryInput),
  ]);
  assert.equal(adapter.capabilities.idempotentByKey, true);
  assert.equal(first.providerReference, replay.providerReference);
  assert.equal(sink.acceptedCount, 1);
  assert.equal(sink.attemptCount, 2);
  await assert.rejects(adapter.deliver({ ...deliveryInput,
    approvedResult: { ...approvedResult,
      content: { ...approvedResult.content, description: "Changed synthetic content" } } }));
  await assert.rejects(adapter.deliver({ ...deliveryInput,
    approvedResult: { ...approvedResult, recipientEmail: "customer@example.com" } }));
  assert.equal(sink.acceptedCount, 1);
  assert.throws(() => new IdempotentPaidResultDeliveryProvider({ provider: "bad",
    capabilities: { idempotencyEnforcedByProvider: false }, async send() { throw new Error("must not send"); } }));
});

test("worker composition is disabled by default and only creates a one-shot worker after both gates", async () => {
  let constructions = 0;
  const fake = { async processNext() { return { status: "idle" as const }; } } as PaidResultDeliveryConsumer;
  const factory = () => { constructions += 1; return fake; };
  assert.deepEqual(composePaidResultDeliveryWorker(factory), { enabled: false, reason: "disabled_by_default" });
  assert.equal(constructions, 0);
  assert.deepEqual(composePaidResultDeliveryWorker(factory, { enabled: "true", postgresValidated: false }),
    { enabled: false, reason: "postgres_validation_required" });
  assert.equal(constructions, 0);
  const ready = composePaidResultDeliveryWorker(factory, { enabled: "true", postgresValidated: true });
  assert.equal(ready.enabled, true);
  assert.equal(constructions, 1);
  assert.deepEqual(await ready.worker?.processCaseOnce("case_test_01"), { status: "idle" });
});

test("canonical PostgreSQL worker composition is inert by default", () => {
  let queries = 0;
  const executor = { async query() { queries += 1; return { rows: [] }; }, async transaction(work: any) { return work(this); } };
  const provider = { capabilities: { backendClass: "test-provider" as const, idempotentByKey: true },
    async deliver() { throw new Error("disabled worker must not deliver"); } };
  assert.deepEqual(composePostgresPaidResultDeliveryWorker(executor, provider, {}),
    { enabled: false, reason: "disabled_by_default" });
  assert.deepEqual(composePostgresPaidResultDeliveryWorker(executor, provider,
    { DRIVABLE_PAID_RESULT_DELIVERY_ENABLED: "true" }),
    { enabled: false, reason: "postgres_validation_required" });
  assert.equal(queries, 0);
});
