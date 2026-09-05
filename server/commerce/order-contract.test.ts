import assert from "node:assert/strict";
import test from "node:test";

import { DisabledPaymentProviderAdapter } from "./disabled-payment-provider-adapter.js";
import { InMemoryCommerceOrderRepository } from "./in-memory-commerce-order-repository.js";
import {
  COMMERCE_ORDER_SCHEMA_VERSION,
  CommerceContractError,
  CommerceOrderService,
  PAYMENT_PROVIDER_EVENT_SCHEMA_VERSION,
  assertDurableCommerceOrderRepository,
  type CommerceOrder,
  type CommerceOrderRepository,
  type CommitCommerceEventInput,
  type CommitCommerceEventResult,
  type PaymentProviderAdapter,
} from "./order-contract.js";

const CREATED_AT = "2026-09-01T12:00:00.000Z";

function pendingInput() {
  return {
    caseId: "case_123",
    offer: {
      offerId: "buyer_check",
      offerVersion: "v1",
      label: "Buyer Check",
      amountMinor: 4900,
      currency: "USD",
    },
  };
}

function providerEvent(
  order: CommerceOrder,
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: PAYMENT_PROVIDER_EVENT_SCHEMA_VERSION,
    eventId: "provider_event_1",
    provider: "test_provider",
    providerOrderReference: "provider_order_123",
    orderId: order.orderId,
    kind: "payment_verified",
    amountMinor: order.offer.amountMinor,
    currency: order.offer.currency,
    occurredAt: "2026-09-01T12:01:00.000Z",
    ...overrides,
  };
}

class TestDurableCommerceRepository implements CommerceOrderRepository {
  readonly capabilities = Object.freeze({
    backendClass: "durable-repository" as const,
    durable: true,
    atomicCompareAndSwap: true,
    idempotentEvents: true,
    generatedIdentifiers: true,
  });

  constructor(
    private readonly delegate = new InMemoryCommerceOrderRepository(),
  ) {}

  create(order: CommerceOrder): Promise<CommerceOrder> {
    return this.delegate.create(order);
  }

  get(orderId: string): Promise<CommerceOrder | null> {
    return this.delegate.get(orderId);
  }

  getEventFingerprint(orderId: string, eventId: string): Promise<string | null> {
    return this.delegate.getEventFingerprint(orderId, eventId);
  }

  commitEvent(input: CommitCommerceEventInput): Promise<CommitCommerceEventResult> {
    return this.delegate.commitEvent(input);
  }
}

function authenticatedAdapter(
  capabilityOverrides: Partial<PaymentProviderAdapter["capabilities"]> = {},
): PaymentProviderAdapter {
  return {
    adapterId: "test_provider_adapter",
    capabilities: Object.freeze({
      configured: true,
      serverSideOnly: true,
      verifiesAuthenticity: true,
      bindsOrderIdFromAuthenticatedMetadata: true,
      ...capabilityOverrides,
    }),
    async verifyAndNormalize(payload: unknown) {
      return payload;
    },
  };
}

function service(repository: CommerceOrderRepository) {
  let orderCounter = 0;
  let eventCounter = 0;
  return new CommerceOrderService(repository, {
    now: () => new Date(CREATED_AT),
    generateOrderId: () => `ord_server_${++orderCounter}`,
    generateEventId: () => `evt_server_${++eventCounter}`,
  });
}

async function expectCode(promise: Promise<unknown>, code: CommerceContractError["code"]) {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof CommerceContractError && error.code === code,
  );
}

test("pending orders use generated IDs and immutable server offer snapshots", async () => {
  const repository = new InMemoryCommerceOrderRepository();
  const commerce = service(repository);
  const input = pendingInput();
  const order = await commerce.createPendingOrder(input);

  input.offer.amountMinor = 1;
  input.offer.label = "mutated";

  assert.equal(order.schemaVersion, COMMERCE_ORDER_SCHEMA_VERSION);
  assert.equal(order.orderId, "ord_server_1");
  assert.equal(order.state, "pending");
  assert.equal(order.offer.amountMinor, 4900);
  assert.equal(order.offer.label, "Buyer Check");
  assert.equal(order.version, 1);
  assert.equal(order.eventCount, 0);
  assert.equal(Object.isFrozen(order), true);
  assert.equal(Object.isFrozen(order.offer), true);
});

test("client-asserted payment fields and invalid money fail before persistence", async () => {
  const commerce = service(new InMemoryCommerceOrderRepository());

  await expectCode(
    commerce.createPendingOrder({ ...pendingInput(), paid: true }),
    "invalid_order_input",
  );
  await expectCode(
    commerce.createPendingOrder({ ...pendingInput(), state: "verified" }),
    "invalid_order_input",
  );
  await expectCode(
    commerce.createPendingOrder({ ...pendingInput(), orderId: "client_order" }),
    "invalid_order_input",
  );
  await expectCode(
    commerce.createPendingOrder({
      ...pendingInput(),
      offer: { ...pendingInput().offer, amountMinor: 49.5 },
    }),
    "invalid_order_input",
  );
  await expectCode(
    commerce.createPendingOrder({
      ...pendingInput(),
      offer: { ...pendingInput().offer, currency: "usd" },
    }),
    "invalid_order_input",
  );
});

test("disabled or incompletely authenticating adapters fail closed", async () => {
  const repository = new TestDurableCommerceRepository();
  const commerce = service(repository);
  const order = await commerce.createPendingOrder(pendingInput());

  await expectCode(
    commerce.applyProviderPayload(new DisabledPaymentProviderAdapter(), providerEvent(order)),
    "provider_unavailable",
  );
  await expectCode(
    commerce.applyProviderPayload(
      authenticatedAdapter({ bindsOrderIdFromAuthenticatedMetadata: false }),
      providerEvent(order),
    ),
    "provider_unavailable",
  );
  assert.equal((await repository.get(order.orderId))?.state, "pending");
});

test("verified state requires a durable repository", async () => {
  const repository = new InMemoryCommerceOrderRepository();
  const commerce = service(repository);
  const order = await commerce.createPendingOrder(pendingInput());

  assert.throws(
    () => assertDurableCommerceOrderRepository(repository),
    (error: unknown) =>
      error instanceof CommerceContractError && error.code === "durable_repository_required",
  );
  await expectCode(
    commerce.applyProviderPayload(authenticatedAdapter(), providerEvent(order)),
    "durable_repository_required",
  );
  assert.equal((await repository.get(order.orderId))?.state, "pending");
});

test("authenticated verified events apply once and exact retries are idempotent", async () => {
  const repository = new TestDurableCommerceRepository();
  const commerce = service(repository);
  const order = await commerce.createPendingOrder(pendingInput());
  const event = providerEvent(order);

  const applied = await commerce.applyProviderPayload(authenticatedAdapter(), event);
  assert.equal(applied.status, "applied");
  assert.equal(applied.order.state, "verified");
  assert.equal(applied.order.version, 2);
  assert.equal(applied.order.eventCount, 1);
  assert.equal(applied.order.provider?.providerOrderReference, "provider_order_123");

  const duplicate = await commerce.applyProviderPayload(authenticatedAdapter(), event);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.order.version, 2);
  assert.equal(duplicate.order.eventCount, 1);

  await expectCode(
    commerce.applyProviderPayload(
      authenticatedAdapter(),
      providerEvent(order, { amountMinor: 5000 }),
    ),
    "event_conflict",
  );
});

test("mismatched and malformed provider events fail without changing the order", async () => {
  const cases: Array<[Record<string, unknown>, CommerceContractError["code"]]> = [
    [{ eventId: "amount_event", amountMinor: 5000 }, "amount_mismatch"],
    [{ eventId: "currency_event", currency: "CAD" }, "currency_mismatch"],
    [{ eventId: "bad_date", occurredAt: "2026-02-30T12:01:00.000Z" }, "invalid_provider_event"],
    [{ eventId: "future", occurredAt: "2026-09-01T12:10:01.000Z" }, "invalid_provider_event"],
  ];

  for (const [overrides, code] of cases) {
    const repository = new TestDurableCommerceRepository();
    const commerce = service(repository);
    const order = await commerce.createPendingOrder(pendingInput());
    await expectCode(
      commerce.applyProviderPayload(authenticatedAdapter(), providerEvent(order, overrides)),
      code,
    );
    assert.equal((await repository.get(order.orderId))?.state, "pending");
  }

  const repository = new TestDurableCommerceRepository();
  const commerce = service(repository);
  const order = await commerce.createPendingOrder(pendingInput());
  await expectCode(
    commerce.applyProviderPayload(
      authenticatedAdapter(),
      { ...providerEvent(order), eventId: "extra", paid: true },
    ),
    "invalid_provider_event",
  );
  await expectCode(
    commerce.applyProviderPayload(
      authenticatedAdapter(),
      providerEvent(order, { eventId: "missing", orderId: "ord_missing" }),
    ),
    "order_not_found",
  );
});

test("illegal payment transitions fail closed", async () => {
  const repository = new TestDurableCommerceRepository();
  const commerce = service(repository);
  const order = await commerce.createPendingOrder(pendingInput());

  const failed = await commerce.applyProviderPayload(
    authenticatedAdapter(),
    providerEvent(order, { eventId: "failed_event", kind: "payment_failed" }),
  );
  assert.equal(failed.order.state, "failed");

  await expectCode(
    commerce.applyProviderPayload(
      authenticatedAdapter(),
      providerEvent(failed.order, {
        eventId: "late_verified",
        kind: "payment_verified",
        occurredAt: "2026-09-01T12:02:00.000Z",
      }),
    ),
    "illegal_transition",
  );
});

test("refund-required and provider-confirmed refund states stay case-bound", async () => {
  const repository = new TestDurableCommerceRepository();
  const commerce = service(repository);
  const order = await commerce.createPendingOrder(pendingInput());
  const verified = await commerce.applyProviderPayload(
    authenticatedAdapter(),
    providerEvent(order),
  );

  const required = await commerce.markRefundRequired({
    orderId: verified.order.orderId,
    reasonCode: "fulfillment_unavailable",
  });
  assert.equal(required.state, "refund_required");
  assert.equal(required.refundReasonCode, "fulfillment_unavailable");

  const refunded = await commerce.applyProviderPayload(
    authenticatedAdapter(),
    providerEvent(required, {
      eventId: "refund_event",
      kind: "refund_confirmed",
      occurredAt: "2026-09-01T12:02:00.000Z",
    }),
  );
  assert.equal(refunded.order.state, "refunded");
  assert.equal(refunded.order.caseId, order.caseId);
  assert.equal(refunded.order.offer.amountMinor, order.offer.amountMinor);
  assert.equal(refunded.order.refundReasonCode, "fulfillment_unavailable");
});

test("persistence failures never return success", async () => {
  await expectCode(
    service(new InMemoryCommerceOrderRepository({ create: true })).createPendingOrder(pendingInput()),
    "persistence_failed",
  );

  const failingDelegate = new InMemoryCommerceOrderRepository({ commit: true });
  const repository = new TestDurableCommerceRepository(failingDelegate);
  const commerce = service(repository);
  const order = await commerce.createPendingOrder(pendingInput());
  await expectCode(
    commerce.applyProviderPayload(authenticatedAdapter(), providerEvent(order)),
    "persistence_failed",
  );
  assert.equal((await repository.get(order.orderId))?.state, "pending");
});
