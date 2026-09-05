import assert from "node:assert/strict";
import test from "node:test";

import type { DeliveryOutboxCapabilities } from "../jobs/delivery-outbox.js";
import { InMemoryReviewRepository } from "../review/in-memory-review-repository.js";
import type { RecipientIdentityBinding, ReviewRepository } from "../review/types.js";
import type { CommerceOrder, CommerceOrderRepositoryCapabilities } from "./order-contract.js";
import {
  PaidFulfillmentEligibilityService,
  type PaidCasePersistenceRecord,
  type PaidCasePersistenceRepository,
  type PaidCasePersistenceRepositoryCapabilities,
  type PaidFulfillmentEligibilityDependencies,
  type PaidFulfillmentEligibilityInput,
} from "./paid-fulfillment-eligibility.js";

const NOW = "2026-09-02T12:00:00.000Z";
const CASE_ID = "case_123";
const EVIDENCE_VERSION = "evidence_v1";
const RECIPIENT: RecipientIdentityBinding = Object.freeze({
  algorithm: "sha256",
  digest: "a".repeat(64),
  bindingVersion: "recipient_v1",
});

const DURABLE_COMMERCE_CAPABILITIES: CommerceOrderRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  atomicCompareAndSwap: true,
  idempotentEvents: true,
  generatedIdentifiers: true,
});

const DURABLE_CASE_CAPABILITIES: PaidCasePersistenceRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  caseBound: true,
  versionedPersistence: true,
});

const DURABLE_OUTBOX_CAPABILITIES: DeliveryOutboxCapabilities = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  horizontallyScalable: true,
  atomicLeasing: true,
  fencedAcknowledgement: true,
  idempotentEnqueue: true,
});

function order(overrides: Partial<CommerceOrder> = {}): CommerceOrder {
  return Object.freeze({
    schemaVersion: 1,
    orderId: "ord_server_1",
    caseId: CASE_ID,
    offer: Object.freeze({
      offerId: "buyer_check",
      offerVersion: "v1",
      label: "Buyer Check",
      amountMinor: 4900,
      currency: "USD",
    }),
    state: "verified",
    provider: Object.freeze({
      adapterId: "stripe_adapter",
      provider: "stripe",
      providerOrderReference: "pi_123",
    }),
    version: 2,
    eventCount: 1,
    createdAt: "2026-09-02T11:00:00.000Z",
    updatedAt: "2026-09-02T11:01:00.000Z",
    refundReasonCode: null,
    ...overrides,
  });
}

function persistedCase(
  overrides: Partial<PaidCasePersistenceRecord> = {},
): PaidCasePersistenceRecord {
  return Object.freeze({
    caseId: CASE_ID,
    persistenceVersion: "case_persist_v1",
    evidenceVersion: EVIDENCE_VERSION,
    state: "persisted",
    persistedAt: "2026-09-02T10:59:00.000Z",
    ...overrides,
  });
}

function caseRepository(
  record: PaidCasePersistenceRecord | null = persistedCase(),
  capabilities: PaidCasePersistenceRepositoryCapabilities = DURABLE_CASE_CAPABILITIES,
  throws = false,
): PaidCasePersistenceRepository {
  return {
    capabilities,
    async getPersistence() {
      if (throws) throw new Error("case repository unavailable");
      return record;
    },
  };
}

function commerceLookup(
  record: CommerceOrder | null = order(),
  capabilities: CommerceOrderRepositoryCapabilities = DURABLE_COMMERCE_CAPABILITIES,
  throws = false,
) {
  return {
    capabilities,
    async get() {
      if (throws) throw new Error("commerce repository unavailable");
      return record;
    },
  };
}

function reviewFixture(options: Readonly<{
  approve?: boolean;
  mock?: boolean;
}> = {}) {
  let id = 0;
  const delegate = new InMemoryReviewRepository({
    now: () => new Date("2026-09-02T11:10:00.000Z"),
    generateId: () => `generated_${++id}`,
  });
  const common = {
    caseId: CASE_ID,
    artifactDigest: "b".repeat(64),
    recipient: RECIPIENT,
    riskLevel: "moderate" as const,
    policyVersion: "policy_v1",
    modelVersion: "model_v1",
    evidenceVersion: EVIDENCE_VERSION,
    mock: options.mock === true,
  };
  const draft = delegate.createDraft(common);
  const final = delegate.createFinal({ ...common, sourceVersionId: draft.versionId });
  if (options.approve !== false) {
    delegate.approve({
      versionId: final.versionId,
      caseId: CASE_ID,
      reviewerRef: "reviewer_12345678",
    });
  }

  const repository: ReviewRepository = {
    capabilities: Object.freeze({
      backendClass: "durable-repository",
      durable: true,
      appendOnlyAudit: true,
      caseBoundTransitions: true,
      generatedIdentifiers: true,
    }),
    createDraft: delegate.createDraft.bind(delegate),
    createFinal: delegate.createFinal.bind(delegate),
    approve: delegate.approve.bind(delegate),
    reject: delegate.reject.bind(delegate),
    supersede: delegate.supersede.bind(delegate),
    getVersion: delegate.getVersion.bind(delegate),
    getVersionState: delegate.getVersionState.bind(delegate),
    getCurrentVersionId: delegate.getCurrentVersionId.bind(delegate),
  };
  return { repository, final };
}

function input(versionId: string, overrides: Record<string, unknown> = {}) {
  return {
    orderId: "ord_server_1",
    caseId: CASE_ID,
    casePersistenceVersion: "case_persist_v1",
    versionId,
    policyVersion: "policy_v1",
    modelVersion: "model_v1",
    evidenceVersion: EVIDENCE_VERSION,
    recipient: RECIPIENT,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<PaidFulfillmentEligibilityDependencies> = {},
): { dependencies: PaidFulfillmentEligibilityDependencies; request: PaidFulfillmentEligibilityInput } {
  const review = reviewFixture();
  return {
    dependencies: {
      commerceOrders: commerceLookup(),
      cases: caseRepository(),
      reviews: review.repository,
      deliveryOutbox: { capabilities: DURABLE_OUTBOX_CAPABILITIES },
      ...overrides,
    },
    request: input(review.final.versionId) as PaidFulfillmentEligibilityInput,
  };
}

function service(deps: PaidFulfillmentEligibilityDependencies) {
  return new PaidFulfillmentEligibilityService(deps, { now: () => new Date(NOW) });
}

test("verified payment alone is insufficient; all durable gates yield one bound approval", async () => {
  const setup = dependencies();
  const decision = await service(setup.dependencies).decide(setup.request);

  assert.equal(decision.allowed, true);
  if (!decision.allowed) return;
  assert.equal(decision.code, "paid_fulfillment_allowed");
  assert.equal(decision.orderId, "ord_server_1");
  assert.equal(decision.caseId, CASE_ID);
  assert.equal(decision.casePersistenceVersion, "case_persist_v1");
  assert.equal(decision.versionId, setup.request.versionId);
  assert.equal(decision.offer.amountMinor, 4900);
  assert.equal(decision.recipient.digest, RECIPIENT.digest);
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.offer), true);
});

test("pending, failed, refund-required, and refunded orders cannot be fulfilled", async () => {
  for (const state of ["pending", "failed", "refund_required", "refunded"] as const) {
    const setup = dependencies({ commerceOrders: commerceLookup(order({ state })) });
    const decision = await service(setup.dependencies).decide(setup.request);
    assert.deepEqual(
      { allowed: decision.allowed, code: decision.code },
      { allowed: false, code: "payment_not_verified" },
    );
  }
});

test("case association and persisted versions must match every boundary", async () => {
  const wrongOrderCase = dependencies({
    commerceOrders: commerceLookup(order({ caseId: "case_other" })),
  });
  assert.equal(
    (await service(wrongOrderCase.dependencies).decide(wrongOrderCase.request)).code,
    "wrong_case",
  );

  const missingCase = dependencies({ cases: caseRepository(null) });
  assert.equal(
    (await service(missingCase.dependencies).decide(missingCase.request)).code,
    "case_not_found",
  );

  const staleCase = dependencies({
    cases: caseRepository(persistedCase({ persistenceVersion: "case_persist_v0" })),
  });
  assert.equal(
    (await service(staleCase.dependencies).decide(staleCase.request)).code,
    "case_persistence_mismatch",
  );

  const staleEvidence = dependencies({
    cases: caseRepository(persistedCase({ evidenceVersion: "evidence_v0" })),
  });
  assert.equal(
    (await service(staleEvidence.dependencies).decide(staleEvidence.request)).code,
    "case_persistence_mismatch",
  );
});

test("every process-local dependency fails closed", async () => {
  const ephemeralCommerce: CommerceOrderRepositoryCapabilities = Object.freeze({
    ...DURABLE_COMMERCE_CAPABILITIES,
    backendClass: "process-local-test-fake",
    durable: false,
  });
  const commerce = dependencies({ commerceOrders: commerceLookup(order(), ephemeralCommerce) });
  assert.equal(
    (await service(commerce.dependencies).decide(commerce.request)).code,
    "commerce_repository_not_durable",
  );

  const ephemeralCase: PaidCasePersistenceRepositoryCapabilities = Object.freeze({
    ...DURABLE_CASE_CAPABILITIES,
    backendClass: "process-local-test-fake",
    durable: false,
  });
  const cases = dependencies({ cases: caseRepository(persistedCase(), ephemeralCase) });
  assert.equal(
    (await service(cases.dependencies).decide(cases.request)).code,
    "case_repository_not_durable",
  );

  const review = reviewFixture();
  const reviews = dependencies({
    reviews: { ...review.repository, capabilities: new InMemoryReviewRepository().capabilities },
  });
  assert.equal(
    (await service(reviews.dependencies).decide({
      ...reviews.request,
      versionId: review.final.versionId,
    })).code,
    "review_repository_not_durable",
  );

  const ephemeralOutbox: DeliveryOutboxCapabilities = Object.freeze({
    ...DURABLE_OUTBOX_CAPABILITIES,
    backendClass: "ephemeral-test-double",
    durable: false,
    horizontallyScalable: false,
  });
  const outbox = dependencies({ deliveryOutbox: { capabilities: ephemeralOutbox } });
  assert.equal(
    (await service(outbox.dependencies).decide(outbox.request)).code,
    "delivery_outbox_not_durable",
  );
});

test("review denial preserves the machine-readable review reason", async () => {
  const review = reviewFixture({ approve: false });
  const setup = dependencies({ reviews: review.repository });
  const decision = await service(setup.dependencies).decide({
    ...setup.request,
    versionId: review.final.versionId,
  });
  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.code, "review_denied");
  assert.equal(decision.reviewCode, "review_required");

  const mockReview = reviewFixture({ mock: true });
  const mockSetup = dependencies({ reviews: mockReview.repository });
  const mockDecision = await service(mockSetup.dependencies).decide({
    ...mockSetup.request,
    versionId: mockReview.final.versionId,
  });
  assert.equal(mockDecision.allowed, false);
  if (!mockDecision.allowed) assert.equal(mockDecision.reviewCode, "mock_content");
});

test("wrong recipients and malformed client assertions cannot authorize fulfillment", async () => {
  const setup = dependencies();
  const wrongRecipient = await service(setup.dependencies).decide({
    ...setup.request,
    recipient: { ...RECIPIENT, digest: "c".repeat(64) },
  });
  assert.equal(wrongRecipient.allowed, false);
  if (!wrongRecipient.allowed) assert.equal(wrongRecipient.reviewCode, "wrong_recipient");

  const assertedPaid = await service(setup.dependencies).decide({
    ...setup.request,
    paid: true,
  });
  assert.equal(assertedPaid.code, "invalid_request");

  const stringBoolean = await service(setup.dependencies).decide({
    ...setup.request,
    recipient: { ...RECIPIENT, algorithm: "sha256", verified: "true" },
  });
  assert.equal(stringBoolean.code, "invalid_request");
});

test("dependency failures and malformed stored records return no success", async () => {
  const orderFailure = dependencies({ commerceOrders: commerceLookup(order(), DURABLE_COMMERCE_CAPABILITIES, true) });
  assert.equal(
    (await service(orderFailure.dependencies).decide(orderFailure.request)).code,
    "dependency_unavailable",
  );

  const caseFailure = dependencies({ cases: caseRepository(persistedCase(), DURABLE_CASE_CAPABILITIES, true) });
  assert.equal(
    (await service(caseFailure.dependencies).decide(caseFailure.request)).code,
    "dependency_unavailable",
  );

  const malformed = dependencies({
    cases: caseRepository({ ...persistedCase(), persistedAt: "not-a-date" }),
  });
  assert.equal(
    (await service(malformed.dependencies).decide(malformed.request)).code,
    "dependency_unavailable",
  );

  const impossibleDate = dependencies({
    cases: caseRepository({ ...persistedCase(), persistedAt: "2026-02-30T10:00:00.000Z" }),
  });
  assert.equal(
    (await service(impossibleDate.dependencies).decide(impossibleDate.request)).code,
    "dependency_unavailable",
  );

  const malformedProvider = dependencies({
    commerceOrders: commerceLookup(order({
      provider: { adapterId: "", provider: "stripe", providerOrderReference: "pi_123" },
    })),
  });
  assert.equal(
    (await service(malformedProvider.dependencies).decide(malformedProvider.request)).code,
    "dependency_unavailable",
  );
});
