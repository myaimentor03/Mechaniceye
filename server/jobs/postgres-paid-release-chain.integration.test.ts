import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import Stripe from "stripe";
import {
  ConsentPurpose,
  createConsentAcceptedEvent,
  createConsentRevokedEvent,
} from "../../shared/consent/index.js";
import { mutationTargetGuard, verifyConnectedDatabaseTarget } from "../../scripts/lib/db-target-safe.mjs";
import { PgLaunchControlExecutor } from "../review/postgres-adapter.js";
import { caseArtifactDigest, JOURNEY_REVIEW_BINDINGS, recipientBinding } from "../journey-review-bridge.js";
import { createPgJourneyStore } from "../journey-store-pg.js";
import { PostgresCommerceOrderRepository } from "../commerce/postgres-commerce-order-repository.js";
import { CommerceOrderService } from "../commerce/order-contract.js";
import { StripeTestPaymentAdapter } from "../commerce/stripe-test-payment-adapter.js";
import { PaidFulfillmentEligibilityService } from "../commerce/paid-fulfillment-eligibility.js";
import { PostgresConsentRepository } from "../consent/postgres-consent-repository.js";
import { PostgresReviewReleaseReader } from "../review/postgres-review-release-reader.js";
import { PostgresReviewWriter } from "../review/postgres-review-writer.js";
import { createJourneyPaidCasePersistenceRepository, DurablePaidDeliveryContextResolver } from "./paid-delivery-context.js";
import { PostgresDeliveryOutboxRepository } from "./postgres-delivery-outbox.js";
import { PostgresDeliveryReceiptRepository } from "./postgres-delivery-receipt.js";
import { PaidResultDeliveryConsumer } from "./paid-result-delivery-consumer.js";
import { IdempotentPaidResultDeliveryProvider } from "./idempotent-paid-result-provider.js";
import { InMemoryPaidResultTestSink } from "./in-memory-paid-result-test-sink.js";
import type { LeasedDeliveryJob } from "./delivery-outbox.js";
import type { JourneyCase } from "../journey-state-machine.js";

const candidateUrl = process.env.DRIVABLE_ALLOW_COMMERCE_TEST_SCHEMA_SETUP === "true"
  ? process.env.DRIVABLE_COMMERCE_TEST_DATABASE_URL : undefined;
const testUrl = candidateUrl && mutationTargetGuard(candidateUrl).ok ? candidateUrl : undefined;
const CONSENT_ENV = {
  DRIVABLE_CONSENT_VERSION: "consent-v1",
  DRIVABLE_PRIVACY_VERSION: "privacy-v1",
  DRIVABLE_TERMS_VERSION: "terms-v1",
} as NodeJS.ProcessEnv;

test("Postgres: current consent, payment, case evidence, recipient, approval, outbox replay and release are revalidated", {
  skip: !testUrl ? "Explicit verified isolated commerce-test URL and schema-setup opt-in are unavailable" : false,
}, async () => {
  const schema = `paid_release_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: testUrl, ssl: { rejectUnauthorized: false }, max: 1 });
  let pool: pg.Pool | undefined;
  let targetVerified = false;
  try {
    // This is intentionally the first DB operation; helper verifies exact DB, server address and TLS.
    await verifyConnectedDatabaseTarget(admin);
    targetVerified = true;
    await admin.query(`create schema ${schema}`);
    const open = () => new pg.Pool({ connectionString: testUrl, ssl: { rejectUnauthorized: false },
      options: `-c search_path=${schema}`, max: 3 });
    pool = open();
    await verifyConnectedDatabaseTarget(pool);
    for (const migration of [
      "../../migrations/0001_drivable_launch_controls.sql",
      "../../migrations/0004_drivable_delivery_outbox.sql",
      "../../migrations/0006_journey_cases.sql",
      "../../migrations/0007_drivable_commerce_orders.sql",
      "../../migrations/0008_drivable_delivery_outbox_runtime.sql",
      "../../migrations/0009_drivable_delivery_receipts.sql",
      "../../migrations/0010_delivery_receipt_provider_acceptance.sql",
      "../../migrations/0011_journey_case_service_destination.sql",
    ]) {
      await pool.query(await readFile(new URL(migration, import.meta.url), "utf8"));
    }

    const caseId = `case_${randomUUID().replaceAll("-", "")}`;
    const recipientEmail = "paid-test-recipient@example.invalid";
    const caseData: JourneyCase = {
      id: caseId, state: "resolved", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      vehicleInfo: "2018 Synthetic Vehicle", description: "Synthetic brake noise; test only",
      customerId: `customer_${randomUUID().replaceAll("-", "")}`, customerEmail: recipientEmail,
      evidence: [{ id: "evidence_synthetic_1", kind: "text", addedAt: new Date().toISOString(),
        description: "Synthetic evidence", status: "text_only" }],
      safetyFlags: [], safetyTriggered: false, confidenceScore: 70, confidenceLevel: "medium",
      riskLevel: "medium", outcome: "monitor", decisionPath: "monitor", humanReviewRequested: true,
      matchedSymptomCategories: [], plannedEvidence: [],
    };

    let executor = new PgLaunchControlExecutor(pool);
    const cases = createPgJourneyStore(executor);
    await cases.setStrict(caseData);
    assert.equal((await cases.getStrict(caseId))?.customerEmail, recipientEmail);

    let orders = new PostgresCommerceOrderRepository(executor);
    let commerce = new CommerceOrderService(orders, {
      now: () => new Date(),
      generateOrderId: () => `order_${randomUUID().replaceAll("-", "")}`,
      generateEventId: () => `event_${randomUUID().replaceAll("-", "")}`,
    });
    const order = await commerce.createPendingOrder({ caseId, offer: {
      offerId: "owner_review", offerVersion: "v1", label: "Human-reviewed result", amountMinor: 1000, currency: "USD",
    } });
    const webhookSecret = "whsec_paid_release_chain_test_fixture";
    const stripe = new Stripe("sk_test_local_paid_release_signature_only");
    const paymentAdapter = new StripeTestPaymentAdapter(webhookSecret, reference => orders.getOrderIdForProvider(reference));
    await applySignedTestPayment(commerce, paymentAdapter, stripe, webhookSecret, order.orderId, order.offer.amountMinor);
    assert.equal(await orders.hasVerifiedPayment(order.orderId), true);
    const outbox = new PostgresDeliveryOutboxRepository(executor);
    const paymentReconciliation = await outbox.leaseNext({ caseId });
    assert.equal(paymentReconciliation?.metadata.destinationKey, "payment-reconcile");
    await outbox.nack({ caseId, jobId: paymentReconciliation!.jobId, leaseToken: paymentReconciliation!.lease.token,
      failure: { code: "test_fixture_scope_only", retryable: false } });

    const consent = new PostgresConsentRepository(executor);
    const acceptedAt = new Date(Date.now() - 1000).toISOString();
    const acceptance = createConsentAcceptedEvent({
      actorId: caseData.customerId!, accountId: caseData.customerId!, caseId,
      eventId: `consent_${randomUUID().replaceAll("-", "")}`, acceptedAt,
      consentVersion: CONSENT_ENV.DRIVABLE_CONSENT_VERSION!,
      privacyNoticeVersion: CONSENT_ENV.DRIVABLE_PRIVACY_VERSION!,
      termsVersion: CONSENT_ENV.DRIVABLE_TERMS_VERSION!,
      affirmativeChoices: { [ConsentPurpose.ServiceFulfillment]: true, [ConsentPurpose.MediaProcessing]: false,
        [ConsentPurpose.HumanReviewSharing]: false, [ConsentPurpose.OptionalProductLearning]: false },
    });
    await consent.append(acceptance);

    const reviewWriter = new PostgresReviewWriter(executor);
    const reviewBindings = { caseId, artifactDigest: caseArtifactDigest(caseData), recipient: recipientBinding(caseData),
      riskLevel: "moderate" as const, ...JOURNEY_REVIEW_BINDINGS };
    const draft = await reviewWriter.createDraft(reviewBindings);
    const final = await reviewWriter.createFinal({ ...reviewBindings, sourceVersionId: draft.versionId });
    const approval = await reviewWriter.approve({ caseId, versionId: final.versionId,
      reviewerRef: `reviewer_${randomUUID().replaceAll("-", "")}` });

    const queued = await outbox.enqueue({
      caseId, deduplicationKey: `release:${order.orderId}:${approval.approvalId}`,
      metadata: { resourceKind: "case", resourceId: caseId, resourceVersion: final.versionId,
        destinationKey: "journey-approved-result", channel: "internal_queue" },
      retryPolicy: { maxAttempts: 3, initialRetryDelayMs: 0, backoffMultiplier: 1,
        maxRetryDelayMs: 0, leaseDurationMs: 30_000 },
    });
    assert.equal(queued.disposition, "created");

    let reviews = new PostgresReviewReleaseReader(executor);
    let receipts = new PostgresDeliveryReceiptRepository(executor);
    const currentResolver = new DurablePaidDeliveryContextResolver({ orders, cases, reviews, consent, outbox }, CONSENT_ENV);
    const syntheticLease = leaseSnapshot(queued.job);
    const eligibleContext = await currentResolver.resolve(syntheticLease);
    assert.ok(eligibleContext, "verified payment, exact case/evidence/recipient, consent, and approval permit the current context");

    // Revoke service-fulfillment after the first authorization read but before the consumer's final reread.
    let consentReads = 0;
    const revokingConsent = {
      async listForSubject(subject: Parameters<typeof consent.listForSubject>[0]) {
        consentReads += 1;
        if (consentReads === 2) {
          await consent.append(createConsentRevokedEvent({
            actorId: subject.actorId, accountId: subject.accountId, caseId: subject.caseId,
            eventId: `consent_revoke_${randomUUID().replaceAll("-", "")}`,
            acceptanceEventId: acceptance.eventId, revokedAt: new Date().toISOString(),
            purposes: [ConsentPurpose.ServiceFulfillment],
          }));
        }
        return consent.listForSubject(subject);
      },
    };
    const sink = new InMemoryPaidResultTestSink();
    const provider = new IdempotentPaidResultDeliveryProvider(sink);
    let consumer = makeConsumer({ orders, cases, reviews, consent: revokingConsent, outbox, receipts }, provider);
    const preSendDenial = await consumer.processNext(caseId);
    assert.equal(preSendDenial.status, "dead_lettered");
    assert.equal(sink.attemptCount, 0, "the final current-consent reread must happen before provider handoff");
    assert.equal(consentReads, 2);

    // Explicit operator replay retains the same job/idempotency key. A new current acceptance is required.
    await consent.append(createConsentAcceptedEvent({
      actorId: caseData.customerId!, accountId: caseData.customerId!, caseId,
      eventId: `consent_reaccept_${randomUUID().replaceAll("-", "")}`,
      acceptedAt: new Date().toISOString(),
      consentVersion: CONSENT_ENV.DRIVABLE_CONSENT_VERSION!,
      privacyNoticeVersion: CONSENT_ENV.DRIVABLE_PRIVACY_VERSION!,
      termsVersion: CONSENT_ENV.DRIVABLE_TERMS_VERSION!,
      affirmativeChoices: { [ConsentPurpose.ServiceFulfillment]: true, [ConsentPurpose.MediaProcessing]: false,
        [ConsentPurpose.HumanReviewSharing]: false, [ConsentPurpose.OptionalProductLearning]: false },
    }));
    const replay = await outbox.replay({ caseId, jobId: queued.job.jobId });
    assert.equal(replay.jobId, queued.job.jobId);
    assert.equal(replay.replayCount, 1);

    // Simulate process restart: rebuild every repository around a fresh pool before the replay attempt.
    await pool.end();
    pool = open();
    await verifyConnectedDatabaseTarget(pool);
    executor = new PgLaunchControlExecutor(pool);
    const restarted = {
      orders: new PostgresCommerceOrderRepository(executor),
      cases: createPgJourneyStore(executor),
      reviews: new PostgresReviewReleaseReader(executor),
      consent: new PostgresConsentRepository(executor),
      outbox: new PostgresDeliveryOutboxRepository(executor),
      receipts: new PostgresDeliveryReceiptRepository(executor),
    };
    const replayedContext = new DurablePaidDeliveryContextResolver(restarted, CONSENT_ENV);
    assert.ok(await replayedContext.resolve(syntheticLease));
    // The job is due immediately; the consumer performs the final current-state checks itself.
    consumer = makeConsumer(restarted, provider);
    const delivered = await consumer.processNext(caseId);
    assert.equal(delivered.status, "provider_accepted");
    assert.equal(sink.acceptedCount, 1);
    const durableReceipt = await restarted.receipts.getByJobId(queued.job.jobId);
    assert.ok(durableReceipt);
    assert.equal(durableReceipt?.provider, "drivable_in_memory_test_sink");
    assert.equal((await restarted.outbox.get(caseId, queued.job.jobId))?.state, "delivered");

    // The exact authorized artifact and recipient remain bound; edits after approval deny re-resolution.
    const changedCase = { ...caseData, description: "Changed synthetic evidence/content" };
    await restarted.cases.setStrict(changedCase);
    assert.equal(await replayedContext.resolve(syntheticLease), null);
    await restarted.cases.setStrict(caseData);
    await restarted.cases.setStrict({ ...caseData, customerEmail: "changed-recipient@example.invalid" });
    assert.equal(await replayedContext.resolve(syntheticLease), null);
    await restarted.cases.setStrict(caseData);

    // Refund-required/cancelled entitlements are also denied by the canonical repository gate.
    const secondCommerce = new CommerceOrderService(restarted.orders, {
      now: () => new Date(), generateOrderId: () => `order_${randomUUID().replaceAll("-", "")}`,
      generateEventId: () => `event_${randomUUID().replaceAll("-", "")}`,
    });
    const secondOrder = await secondCommerce.createPendingOrder({ caseId, offer: order.offer });
    const secondPaymentAdapter = new StripeTestPaymentAdapter(webhookSecret, reference => restarted.orders.getOrderIdForProvider(reference));
    await applySignedTestPayment(secondCommerce, secondPaymentAdapter, stripe, webhookSecret,
      secondOrder.orderId, secondOrder.offer.amountMinor);
    const secondQueued = await restarted.outbox.enqueue({
      caseId, deduplicationKey: `release:${secondOrder.orderId}:${approval.approvalId}`,
      metadata: { resourceKind: "case", resourceId: caseId, resourceVersion: final.versionId,
        destinationKey: "journey-approved-result", channel: "internal_queue" },
      retryPolicy: { maxAttempts: 3, initialRetryDelayMs: 0, backoffMultiplier: 1,
        maxRetryDelayMs: 0, leaseDurationMs: 30_000 },
    });
    await secondCommerce.markRefundRequired({ orderId: secondOrder.orderId, reasonCode: "synthetic_cancel_before_release" });
    assert.equal(await replayedContext.resolve(leaseSnapshot(secondQueued.job)), null);

    // A subsequent current review version supersedes the approved version and revokes its release authority.
    await new PostgresReviewWriter(executor).createDraft({ ...reviewBindings,
      artifactDigest: caseArtifactDigest({ ...caseData, description: "post-approval change" }) });
    assert.equal(await replayedContext.resolve(syntheticLease), null);
  } finally {
    try {
      await pool?.end();
    } finally {
      try {
        if (targetVerified) await admin.query(`drop schema if exists ${schema} cascade`);
      } finally {
        await admin.end();
      }
    }
  }
});

function leaseSnapshot(job: import("./delivery-outbox.js").PendingDeliveryJob): LeasedDeliveryJob {
  return Object.freeze({ ...job, state: "leased", lease: Object.freeze({ token: "synthetic_lease_token_1234567890",
    leasedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }) });
}

async function applySignedTestPayment(
  commerce: CommerceOrderService,
  adapter: StripeTestPaymentAdapter,
  stripe: Stripe,
  secret: string,
  orderId: string,
  amountMinor: number,
): Promise<void> {
  const rawBody = Buffer.from(JSON.stringify({
    id: `evt_${randomUUID().replaceAll("-", "")}`,
    type: "payment_intent.succeeded",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: {
      object: "payment_intent", id: `pi_${randomUUID().replaceAll("-", "")}`,
      livemode: false, status: "succeeded", amount: amountMinor, amount_received: amountMinor,
      currency: "usd", metadata: { drivableOrderId: orderId },
    } },
  }));
  const signature = stripe.webhooks.generateTestHeaderString({ payload: rawBody.toString("utf8"), secret });
  await commerce.applyProviderPayload(adapter, { rawBody, signature });
}

function makeConsumer(
  repositories: Readonly<{
    orders: PostgresCommerceOrderRepository;
    cases: ReturnType<typeof createPgJourneyStore>;
    reviews: PostgresReviewReleaseReader;
    consent: Readonly<{ listForSubject(subject: Parameters<PostgresConsentRepository["listForSubject"]>[0]): ReturnType<PostgresConsentRepository["listForSubject"]> }>;
    outbox: PostgresDeliveryOutboxRepository;
    receipts: PostgresDeliveryReceiptRepository;
  }>,
  provider: IdempotentPaidResultDeliveryProvider,
): PaidResultDeliveryConsumer {
  const contexts = new DurablePaidDeliveryContextResolver({
    orders: repositories.orders,
    cases: repositories.cases,
    reviews: repositories.reviews,
    consent: repositories.consent,
    outbox: repositories.outbox,
  }, CONSENT_ENV);
  const eligibility = new PaidFulfillmentEligibilityService({
    commerceOrders: repositories.orders,
    cases: createJourneyPaidCasePersistenceRepository(repositories.cases),
    reviews: repositories.reviews,
    deliveryOutbox: repositories.outbox,
  });
  return new PaidResultDeliveryConsumer(repositories.outbox, eligibility, contexts, provider, repositories.receipts);
}
