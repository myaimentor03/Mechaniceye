import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createSessionToken } from "../customer-auth.js";
import { getLaunchOffer } from "./commerce-offers.js";
import { InMemoryCommerceOrderRepository } from "./in-memory-commerce-order-repository.js";
import {
  CommerceOrderService,
  type CommerceOrder,
  type CommerceOrderRepository,
  type CommerceOrderRepositoryCapabilities,
  type CommitCommerceEventInput,
  type CommitCommerceEventResult,
  type PaymentProviderAdapter,
} from "./order-contract.js";

process.env.DRIVABLE_SESSION_SECRET = "test-only-session-secret-with-more-than-32-characters";

const DURABLE_CAPABILITIES: CommerceOrderRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  atomicCompareAndSwap: true,
  idempotentEvents: true,
  generatedIdentifiers: true,
});

/** Durable contract double backed by the in-memory delegate (no live DB needed). */
class TestDurableCommerceRepository implements CommerceOrderRepository {
  readonly capabilities = DURABLE_CAPABILITIES;
  private readonly delegate = new InMemoryCommerceOrderRepository();

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

function authenticatedAdapter(): PaymentProviderAdapter {
  return {
    adapterId: "entitlement_route_test_adapter",
    capabilities: Object.freeze({
      configured: true,
      serverSideOnly: true,
      verifiesAuthenticity: true,
      bindsOrderIdFromAuthenticatedMetadata: true,
    }),
    async verifyAndNormalize(payload: unknown) {
      return payload;
    },
  };
}

function customerCookie(): string {
  const token = createSessionToken({ id: "cust_entitle_1", email: "buyer@example.com" });
  return `drivable_session=${token}`;
}

async function withServer(
  repository: CommerceOrderRepository | undefined,
  work: (origin: string) => Promise<void>,
) {
  const { registerRoutes } = await import("../routes.js");
  const app = express();
  app.use(express.json());
  const server = repository === undefined
    ? await registerRoutes(app)
    : await registerRoutes(app, { paymentRepository: repository });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${(address as unknown as { port: number }).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function getEntitlement(origin: string, orderId: string, query = "", cookie?: string) {
  const response = await fetch(`${origin}/api/commerce/orders/${orderId}/entitlement${query}`, {
    headers: cookie ? { cookie } : {},
  });
  const parsed = (await response.json()) as Record<string, unknown>;
  return { response, body: parsed };
}

async function setupOrder(
  repository: TestDurableCommerceRepository,
  caseId: string,
  kind: "verified" | "failed" | "refund_required",
) {
  const service = new CommerceOrderService(repository);
  const pending = await service.createPendingOrder({
    caseId,
    offer: getLaunchOffer("buyer_precheck"),
  });
  const providerKind = kind === "failed" ? "payment_failed" : "payment_verified";
  const applied = await service.applyProviderPayload(authenticatedAdapter(), {
    schemaVersion: 1,
    eventId: `evt_entitle_setup_${caseId}_${kind}`,
    provider: "stripe",
    providerOrderReference: `pi_entitle_setup_${caseId}`,
    orderId: pending.orderId,
    kind: providerKind,
    amountMinor: pending.offer.amountMinor,
    currency: pending.offer.currency,
    occurredAt: new Date(Date.now() + 1_000).toISOString(),
  });
  if (kind === "refund_required") {
    assert.equal(applied.order.state, "verified");
    return service.markRefundRequired({
      orderId: pending.orderId,
      reasonCode: "fulfillment_unavailable",
    });
  }
  return applied.order;
}

test("GET /api/commerce/orders/:orderId/entitlement rejects unauthenticated callers", async () => {
  await withServer(undefined, async (origin) => {
    const { response, body } = await getEntitlement(origin, "ord_missing");
    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
    assert.equal(body.code, "CUSTOMER_AUTH_REQUIRED");
  });
});

test("GET /api/commerce/orders/:orderId/entitlement returns 404 for unknown orders", async () => {
  const repository = new TestDurableCommerceRepository();
  await withServer(repository, async (origin) => {
    const { response, body } = await getEntitlement(
      origin,
      "ord_does_not_exist",
      "",
      customerCookie(),
    );
    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
    assert.equal(body.code, "order_not_found");
  });
});

test("GET /api/commerce/orders/:orderId/entitlement reports entitled for verified orders", async () => {
  const repository = new TestDurableCommerceRepository();
  const verified = await setupOrder(repository, "case_entitle_ok", "verified");
  await withServer(repository, async (origin) => {
    const { response, body } = await getEntitlement(
      origin,
      verified.orderId,
      "",
      customerCookie(),
    );
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.entitled, true);
    assert.equal(body.code, "entitled");
    const order = body.order as Record<string, unknown>;
    assert.equal(order.orderId, verified.orderId);
    assert.equal(order.caseId, "case_entitle_ok");
    assert.equal(order.state, "verified");
    assert.equal(order.entitledHint, "fulfillment_eligible");
    // Receipts expose safe fields only: no versions, fingerprints, or secrets.
    assert.deepEqual(Object.keys(order).sort(), [
      "caseId",
      "createdAt",
      "entitledHint",
      "offer",
      "orderId",
      "providerOrderReference",
      "refundReasonCode",
      "state",
      "updatedAt",
    ]);
  });
});

test("GET /api/commerce/orders/:orderId/entitlement accepts a matching caseId assertion", async () => {
  const repository = new TestDurableCommerceRepository();
  const verified = await setupOrder(repository, "case_entitle_match", "verified");
  await withServer(repository, async (origin) => {
    const { response, body } = await getEntitlement(
      origin,
      verified.orderId,
      "?caseId=case_entitle_match",
      customerCookie(),
    );
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.entitled, true);
    assert.equal(body.code, "entitled");
  });
});

test("GET /api/commerce/orders/:orderId/entitlement rejects a wrong caseId without revealing the receipt", async () => {
  const repository = new TestDurableCommerceRepository();
  const verified = await setupOrder(repository, "case_entitle_mine", "verified");
  await withServer(repository, async (origin) => {
    const { response, body } = await getEntitlement(
      origin,
      verified.orderId,
      "?caseId=case_someone_else",
      customerCookie(),
    );
    assert.equal(response.status, 409);
    assert.equal(body.ok, false);
    assert.equal(body.code, "wrong_case");
    assert.equal("order" in body, false);
    assert.equal("entitled" in body, false);
  });
});

test("GET /api/commerce/orders/:orderId/entitlement rejects an empty caseId assertion", async () => {
  const repository = new TestDurableCommerceRepository();
  const verified = await setupOrder(repository, "case_entitle_empty", "verified");
  await withServer(repository, async (origin) => {
    const { response, body } = await getEntitlement(
      origin,
      verified.orderId,
      "?caseId=",
      customerCookie(),
    );
    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.code, "invalid_order_input");
  });
});

test("GET /api/commerce/orders/:orderId/entitlement is never entitled before verification", async () => {
  const repository = new TestDurableCommerceRepository();
  const service = new CommerceOrderService(repository);
  const pending = await service.createPendingOrder({
    caseId: "case_entitle_pending",
    offer: getLaunchOffer("buyer_precheck"),
  });
  await withServer(repository, async (origin) => {
    const { response, body } = await getEntitlement(
      origin,
      pending.orderId,
      "",
      customerCookie(),
    );
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.entitled, false);
    assert.equal(body.code, "payment_not_verified");
    const order = body.order as Record<string, unknown>;
    assert.equal(order.state, "pending");
    assert.equal(order.entitledHint, "not_entitled");
  });
});

test("GET /api/commerce/orders/:orderId/entitlement is never entitled after failure or refund", async () => {
  const repository = new TestDurableCommerceRepository();
  const failed = await setupOrder(repository, "case_entitle_failed", "failed");
  const refundRequired = await setupOrder(repository, "case_entitle_refreq", "refund_required");
  assert.equal(failed.state, "failed");
  assert.equal(refundRequired.state, "refund_required");
  await withServer(repository, async (origin) => {
    const cookie = customerCookie();
    for (const orderId of [failed.orderId, refundRequired.orderId]) {
      const { response, body } = await getEntitlement(origin, orderId, "", cookie);
      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.entitled, false);
      assert.equal(body.code, "payment_not_verified");
      assert.equal((body.order as Record<string, unknown>).entitledHint, "not_entitled");
    }
  });
});
