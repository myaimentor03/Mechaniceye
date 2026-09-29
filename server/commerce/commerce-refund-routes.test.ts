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
    adapterId: "refund_route_test_adapter",
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
  const token = createSessionToken({ id: "cust_refund_1", email: "buyer@example.com" });
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

async function postRefundRequired(
  origin: string,
  orderId: string,
  body: unknown,
  cookie?: string,
) {
  const response = await fetch(`${origin}/api/commerce/orders/${orderId}/refund-required`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as Record<string, unknown>;
  return { response, body: parsed };
}

async function setupVerifiedOrder(repository: TestDurableCommerceRepository, caseId: string) {
  const service = new CommerceOrderService(repository);
  const order = await service.createPendingOrder({ caseId, offer: getLaunchOffer("buyer_precheck") });
  const applied = await service.applyProviderPayload(authenticatedAdapter(), {
    schemaVersion: 1,
    eventId: `evt_refund_setup_${caseId}`,
    provider: "stripe",
    providerOrderReference: `pi_refund_setup_${caseId}`,
    orderId: order.orderId,
    kind: "payment_verified",
    amountMinor: order.offer.amountMinor,
    currency: order.offer.currency,
    occurredAt: new Date(Date.now() + 1_000).toISOString(),
  });
  assert.equal(applied.order.state, "verified");
  return applied.order;
}

test("POST /api/commerce/orders/:orderId/refund-required rejects unauthenticated callers", async () => {
  await withServer(undefined, async (origin) => {
    const { response, body } = await postRefundRequired(origin, "ord_missing", {
      reasonCode: "fulfillment_unavailable",
    });
    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
    assert.equal(body.code, "CUSTOMER_AUTH_REQUIRED");
  });
});

test("POST /api/commerce/orders/:orderId/refund-required fails closed without a durable repository", async () => {
  await withServer(undefined, async (origin) => {
    const { response, body } = await postRefundRequired(
      origin,
      "ord_any",
      { reasonCode: "fulfillment_unavailable" },
      customerCookie(),
    );
    // The default production wiring is process-local, which can never hold
    // verified payment state: refund operations must fail closed, never apply.
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.code, "durable_repository_required");
  });
});

test("POST /api/commerce/orders/:orderId/refund-required moves verified -> refund_required with a safe receipt", async () => {
  const repository = new TestDurableCommerceRepository();
  const verified = await setupVerifiedOrder(repository, "case_refund_ok");
  await withServer(repository, async (origin) => {
    const { response, body } = await postRefundRequired(
      origin,
      verified.orderId,
      { reasonCode: "fulfillment_unavailable" },
      customerCookie(),
    );
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    const order = body.order as Record<string, unknown>;
    assert.equal(order.orderId, verified.orderId);
    assert.equal(order.caseId, "case_refund_ok");
    assert.equal(order.state, "refund_required");
    assert.equal(order.refundReasonCode, "fulfillment_unavailable");
    assert.equal(order.providerOrderReference, `pi_refund_setup_case_refund_ok`);
    assert.equal(order.entitledHint, "not_entitled");
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

    const stored = await repository.get(verified.orderId);
    assert.equal(stored?.state, "refund_required");
    assert.equal(stored?.version, 3);
    assert.equal(stored?.eventCount, 2);
  });
});

test("POST /api/commerce/orders/:orderId/refund-required rejects pending orders without changing them", async () => {
  const repository = new TestDurableCommerceRepository();
  const service = new CommerceOrderService(repository);
  const pending = await service.createPendingOrder({
    caseId: "case_refund_pending",
    offer: getLaunchOffer("buyer_precheck"),
  });
  await withServer(repository, async (origin) => {
    const { response, body } = await postRefundRequired(
      origin,
      pending.orderId,
      { reasonCode: "fulfillment_unavailable" },
      customerCookie(),
    );
    assert.equal(response.status, 409);
    assert.equal(body.ok, false);
    assert.equal(body.code, "illegal_transition");
    assert.equal((await repository.get(pending.orderId))?.state, "pending");
  });
});

test("POST /api/commerce/orders/:orderId/refund-required returns 404 for unknown orders", async () => {
  const repository = new TestDurableCommerceRepository();
  await withServer(repository, async (origin) => {
    const { response, body } = await postRefundRequired(
      origin,
      "ord_does_not_exist",
      { reasonCode: "fulfillment_unavailable" },
      customerCookie(),
    );
    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
    assert.equal(body.code, "order_not_found");
  });
});

test("POST /api/commerce/orders/:orderId/refund-required rejects unsafe reason codes", async () => {
  const repository = new TestDurableCommerceRepository();
  const verified = await setupVerifiedOrder(repository, "case_refund_badcode");
  await withServer(repository, async (origin) => {
    const { response, body } = await postRefundRequired(
      origin,
      verified.orderId,
      { reasonCode: "NOT A VALID CODE!!" },
      customerCookie(),
    );
    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.code, "invalid_order_input");
    assert.equal((await repository.get(verified.orderId))?.state, "verified");
  });
});

test("POST /api/commerce/orders/:orderId/refund-required cannot re-apply on a refund_required order", async () => {
  const repository = new TestDurableCommerceRepository();
  const verified = await setupVerifiedOrder(repository, "case_refund_once");
  await withServer(repository, async (origin) => {
    const cookie = customerCookie();
    const first = await postRefundRequired(origin, verified.orderId, {
      reasonCode: "fulfillment_unavailable",
    }, cookie);
    assert.equal(first.response.status, 200);

    const second = await postRefundRequired(origin, verified.orderId, {
      reasonCode: "fulfillment_unavailable",
    }, cookie);
    assert.equal(second.response.status, 409);
    assert.equal(second.body.code, "illegal_transition");

    const stored = await repository.get(verified.orderId);
    assert.equal(stored?.state, "refund_required");
    assert.equal(stored?.version, 3);
    assert.equal(stored?.eventCount, 2);
  });
});
