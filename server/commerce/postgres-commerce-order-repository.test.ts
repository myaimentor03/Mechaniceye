import assert from "node:assert/strict";
import test from "node:test";
import { freezeOrder } from "./order-contract.js";
import { PostgresCommerceOrderRepository, type CommerceSqlExecutor, CommerceRepositoryError } from "./postgres-commerce-order-repository.js";

const DURABLE_CAPABILITIES = Object.freeze({
  backendClass: "durable-repository" as const,
  durable: true,
  atomicCompareAndSwap: true,
  idempotentEvents: true,
  generatedIdentifiers: true,
});

function createMockExecutor(): CommerceSqlExecutor & {
  failNext: boolean;
  failCode?: string;
  rows: Record<string, unknown>[][];
  lastQuery?: string;
  lastValues?: readonly unknown[];
  transactionDepth: number;
} {
  const executor: CommerceSqlExecutor & {
    failNext: boolean;
    failCode?: string;
    rows: Record<string, unknown>[][];
    lastQuery?: string;
    lastValues?: readonly unknown[];
    transactionDepth: number;
  } = {
    failNext: false,
    rows: [],
    transactionDepth: 0,
    async query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      this.lastQuery = text;
      this.lastValues = values;
      if (this.failNext) {
        this.failNext = false;
        const err = new Error("simulated failure") as Error & { code?: string };
        if (this.failCode) err.code = this.failCode;
        throw err;
      }
      if (text.trim().startsWith("begin")) {
        this.transactionDepth++;
        return { rows: [] };
      }
      if (text.trim().startsWith("commit") || text.trim().startsWith("rollback")) {
        this.transactionDepth = Math.max(0, this.transactionDepth - 1);
        return { rows: [] };
      }
      return { rows: (this.rows.shift() ?? []) as Row[] };
    },
  };
  return executor;
}

function createTestOrder(overrides: Partial<{
  orderId: string;
  caseId: string;
  state: "pending" | "verified" | "failed" | "refund_required" | "refunded";
  provider: { adapterId: string; provider: string; providerOrderReference: string } | null;
  version: number;
  eventCount: number;
  refundReasonCode: string | null;
}> = {}) {
  const now = new Date().toISOString();
  return freezeOrder({
    schemaVersion: 1,
    orderId: overrides.orderId ?? "ord_test_1",
    caseId: overrides.caseId ?? "case_test_1",
    offer: Object.freeze({
      offerId: "buyer_precheck",
      offerVersion: "v1",
      label: "Buyer Pre-Check",
      amountMinor: 1900,
      currency: "USD",
    }),
    state: overrides.state ?? "pending",
    provider: overrides.provider ?? null,
    version: overrides.version ?? 1,
    eventCount: overrides.eventCount ?? 0,
    createdAt: now,
    updatedAt: now,
    refundReasonCode: overrides.refundReasonCode ?? null,
  });
}

function createStoredOrderRow(order: ReturnType<typeof createTestOrder>) {
  return {
    order_id: order.orderId,
    case_id: order.caseId,
    offer_id: order.offer.offerId,
    offer_version: order.offer.offerVersion,
    offer_label: order.offer.label,
    offer_amount_minor: order.offer.amountMinor,
    offer_currency: order.offer.currency,
    state: order.state,
    provider_adapter_id: order.provider?.adapterId ?? null,
    provider_name: order.provider?.provider ?? null,
    provider_order_reference: order.provider?.providerOrderReference ?? null,
    version: order.version,
    event_count: order.eventCount,
    refund_reason_code: order.refundReasonCode,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}

test("PostgresCommerceOrderRepository: capabilities match production requirements", () => {
  const executor = createMockExecutor();
  const repo = new PostgresCommerceOrderRepository(executor);
  assert.deepEqual(repo.capabilities, DURABLE_CAPABILITIES);
});

test("PostgresCommerceOrderRepository: create persists order and returns frozen copy", async () => {
  const executor = createMockExecutor();
  const repo = new PostgresCommerceOrderRepository(executor);
  const order = createTestOrder();

  const created = await repo.create(order);

  assert.deepEqual(created, order);
  assert.ok(executor.lastQuery?.includes("insert into drivable_commerce_orders"));
  assert.deepEqual(executor.lastValues, [
    order.orderId,
    order.caseId,
    order.offer.offerId,
    order.offer.offerVersion,
    order.offer.label,
    order.offer.amountMinor,
    order.offer.currency,
    order.state,
    null,
    null,
    null,
    1,
    0,
    null,
    order.createdAt,
    order.updatedAt,
  ]);
});

test("PostgresCommerceOrderRepository: create throws on duplicate orderId", async () => {
  const executor = createMockExecutor();
  executor.failNext = true;
  executor.failCode = "23505";
  const repo = new PostgresCommerceOrderRepository(executor);
  const order = createTestOrder();

  await assert.rejects(repo.create(order), (err: Error) => {
    assert.ok(err instanceof CommerceRepositoryError);
    assert.equal(err.code, "conflict");
    return true;
  });
});

test("PostgresCommerceOrderRepository: get returns order when found", async () => {
  const executor = createMockExecutor();
  const order = createTestOrder({ orderId: "ord_test_get" });
  executor.rows.push([createStoredOrderRow(order)]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const found = await repo.get("ord_test_get");

  assert.ok(found);
  assert.deepEqual(found, order);
});

test("PostgresCommerceOrderRepository: get returns null when not found", async () => {
  const executor = createMockExecutor();
  executor.rows.push([]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const found = await repo.get("ord_missing");

  assert.equal(found, null);
});

test("PostgresCommerceOrderRepository: getEventFingerprint returns fingerprint when exists", async () => {
  const executor = createMockExecutor();
  executor.rows.push([{ event_fingerprint: "fp_abc123" }]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const fp = await repo.getEventFingerprint("ord_test_1", "evt_test_1");

  assert.equal(fp, "fp_abc123");
});

test("PostgresCommerceOrderRepository: getEventFingerprint returns null when not exists", async () => {
  const executor = createMockExecutor();
  executor.rows.push([]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const fp = await repo.getEventFingerprint("ord_test_1", "evt_missing");

  assert.equal(fp, null);
});

test("PostgresCommerceOrderRepository: commitEvent applies new event atomically", async () => {
  const executor = createMockExecutor();
  const order = createTestOrder({ orderId: "ord_commit_1", state: "pending", version: 1, eventCount: 0 });
  executor.rows.push([createStoredOrderRow(order)]);
  executor.rows.push([]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const result = await repo.commitEvent({
    orderId: "ord_commit_1",
    expectedVersion: 1,
    eventId: "evt_1",
    eventFingerprint: "fp_1",
    nextState: "verified",
    provider: Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_1" }),
    occurredAt: new Date().toISOString(),
    refundReasonCode: null,
  });

  assert.equal(result.status, "applied");
  assert.equal(result.order.state, "verified");
  assert.equal(result.order.version, 2);
  assert.equal(result.order.eventCount, 1);
  assert.ok(result.order.provider);
  assert.equal(result.order.provider?.providerOrderReference, "pi_1");
});

test("PostgresCommerceOrderRepository: event transaction stays on one checked-out connection", async () => {
  const connection = createMockExecutor();
  const current = createTestOrder();
  connection.rows = [[createStoredOrderRow(current)], [], [], []];
  let checkedOut = 0;
  const executor: CommerceSqlExecutor = {
    query: connection.query.bind(connection),
    async withConnection(work) {
      checkedOut++;
      return work(connection);
    },
  };
  const repo = new PostgresCommerceOrderRepository(executor);
  const result = await repo.commitEvent({
    orderId: current.orderId,
    expectedVersion: current.version,
    eventId: "evt_checkout_connection",
    eventFingerprint: "a".repeat(64),
    nextState: "verified",
    provider: { adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_connection" },
    occurredAt: new Date(Date.parse(current.updatedAt) + 1_000).toISOString(),
    refundReasonCode: null,
  });

  assert.equal(result.status, "applied");
  assert.equal(checkedOut, 1);
  assert.equal(connection.transactionDepth, 0);
});

test("PostgresCommerceOrderRepository: commitEvent returns duplicate for same eventId and fingerprint", async () => {
  const executor = createMockExecutor();
  const order = createTestOrder({ orderId: "ord_dup_1", state: "pending" });
  executor.rows.push([createStoredOrderRow(order)]);
  executor.rows.push([{ event_fingerprint: "fp_same" }]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const result = await repo.commitEvent({
    orderId: "ord_dup_1",
    expectedVersion: 1,
    eventId: "evt_1",
    eventFingerprint: "fp_same",
    nextState: "verified",
    provider: Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_1" }),
    occurredAt: new Date().toISOString(),
    refundReasonCode: null,
  });

  assert.equal(result.status, "duplicate");
  assert.equal(result.order.state, "pending");
});

test("PostgresCommerceOrderRepository: commitEvent returns event_conflict for same eventId different fingerprint", async () => {
  const executor = createMockExecutor();
  const order = createTestOrder({ orderId: "ord_conflict_1", state: "pending" });
  executor.rows.push([createStoredOrderRow(order)]);
  executor.rows.push([{ event_fingerprint: "fp_different" }]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const result = await repo.commitEvent({
    orderId: "ord_conflict_1",
    expectedVersion: 1,
    eventId: "evt_1",
    eventFingerprint: "fp_new",
    nextState: "verified",
    provider: Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_1" }),
    occurredAt: new Date().toISOString(),
    refundReasonCode: null,
  });

  assert.equal(result.status, "event_conflict");
  assert.equal(result.order.state, "pending");
});

test("PostgresCommerceOrderRepository: commitEvent returns version_conflict on stale version", async () => {
  const executor = createMockExecutor();
  const order = createTestOrder({ orderId: "ord_ver_1", state: "pending", version: 2 });
  executor.rows.push([createStoredOrderRow(order)]);
  executor.rows.push([]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const result = await repo.commitEvent({
    orderId: "ord_ver_1",
    expectedVersion: 1,
    eventId: "evt_1",
    eventFingerprint: "fp_1",
    nextState: "verified",
    provider: Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_1" }),
    occurredAt: new Date().toISOString(),
    refundReasonCode: null,
  });

  assert.equal(result.status, "version_conflict");
  assert.equal(result.order.version, 2);
});

test("PostgresCommerceOrderRepository: commitEvent returns not_found for missing order", async () => {
  const executor = createMockExecutor();
  executor.rows.push([]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const result = await repo.commitEvent({
    orderId: "ord_missing",
    expectedVersion: 1,
    eventId: "evt_1",
    eventFingerprint: "fp_1",
    nextState: "verified",
    provider: Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_1" }),
    occurredAt: new Date().toISOString(),
    refundReasonCode: null,
  });

  assert.equal(result.status, "not_found");
});

test("PostgresCommerceOrderRepository: commitEvent rolls back on storage failure", async () => {
  const executor = createMockExecutor();
  const order = createTestOrder({ orderId: "ord_fail_1" });
  executor.rows.push([createStoredOrderRow(order)]);
  executor.failNext = true;
  executor.failCode = "57014";
  const repo = new PostgresCommerceOrderRepository(executor);

  await assert.rejects(
    repo.commitEvent({
      orderId: "ord_fail_1",
      expectedVersion: 1,
      eventId: "evt_1",
      eventFingerprint: "fp_1",
      nextState: "verified",
      provider: Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_1" }),
      occurredAt: new Date().toISOString(),
      refundReasonCode: null,
    }),
    (err: Error) => {
      assert.ok(err instanceof CommerceRepositoryError);
      assert.equal(err.code, "storage_unavailable");
      assert.equal(err.retryable, true);
      return true;
    },
  );
});

test("PostgresCommerceOrderRepository: maps corrupt stored record to error", async () => {
  const executor = createMockExecutor();
  executor.rows.push([{ ...createStoredOrderRow(createTestOrder()), state: "invalid_state" }]);
  const repo = new PostgresCommerceOrderRepository(executor);

  await assert.rejects(repo.get("ord_test"), (err: Error) => {
    assert.ok(err instanceof CommerceRepositoryError);
    assert.equal(err.code, "corrupt_record");
    return true;
  });
});

test("PostgresCommerceOrderRepository: create with verified order includes provider", async () => {
  const executor = createMockExecutor();
  const repo = new PostgresCommerceOrderRepository(executor);
  const order = createTestOrder({
    state: "verified",
    provider: Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_verified" }),
    version: 2,
    eventCount: 1,
  });

  const created = await repo.create(order);

  assert.deepEqual(created, order);
  assert.equal(executor.lastValues?.[8], "stripe_adapter");
  assert.equal(executor.lastValues?.[9], "stripe");
  assert.equal(executor.lastValues?.[10], "pi_verified");
});

test("PostgresCommerceOrderRepository: commitEvent updates refundReasonCode on refund", async () => {
  const executor = createMockExecutor();
  const order = createTestOrder({
    orderId: "ord_refund_1",
    state: "verified",
    provider: Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_refund" }),
    version: 2,
    eventCount: 1,
  });
  executor.rows.push([createStoredOrderRow(order)]);
  executor.rows.push([]);
  const repo = new PostgresCommerceOrderRepository(executor);

  const result = await repo.commitEvent({
    orderId: "ord_refund_1",
    expectedVersion: 2,
    eventId: "evt_refund",
    eventFingerprint: "fp_refund",
    nextState: "refunded",
    provider: Object.freeze({ adapterId: "stripe_adapter", provider: "stripe", providerOrderReference: "pi_refund" }),
    occurredAt: new Date().toISOString(),
    refundReasonCode: "customer_request",
  });

  assert.equal(result.status, "applied");
  assert.equal(result.order.state, "refunded");
  assert.equal(result.order.refundReasonCode, "customer_request");
  assert.equal(result.order.eventCount, 2);
});
