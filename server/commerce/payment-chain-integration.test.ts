import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createHmac } from "node:crypto";
import { createSessionToken } from "../customer-auth.js";
import { getLaunchOffer } from "./commerce-offers.js";
import { InMemoryCommerceOrderRepository } from "./in-memory-commerce-order-repository.js";
import { StripePaymentProviderAdapter } from "./stripe-payment-provider-adapter.js";
import { logEventError } from "../observability/safe-log.js";
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
process.env.STRIPE_SECRET_KEY = "sk_test_doesnotmatter";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_doesnotmatter";

const MOCK_CHECKOUT_SESSIONS = new Map<string, { id: string; url: string }>();

const DURABLE_CAPABILITIES: CommerceOrderRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  atomicCompareAndSwap: true,
  idempotentEvents: true,
  generatedIdentifiers: true,
});

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

async function withFullServer(
  repository: CommerceOrderRepository,
  work: (baseUrl: string) => Promise<void>,
) {
  const { registerRoutes } = await import("../routes.js");
  const app = express();
  app.use(
    "/api/commerce/webhook/stripe",
    express.raw({ type: "application/json" }),
    (req, _res, next) => {
      (req as any).rawBody = req.body;
      next();
    },
  );
  app.use(express.json());

  // Mock checkout session creation for testing
  app.post("/api/commerce/orders/:orderId/checkout", async (req, res) => {
    try {
      const { orderId } = req.params;
      const { successUrl, cancelUrl } = req.body as { successUrl?: unknown; cancelUrl?: unknown };

      if (!successUrl || !cancelUrl || typeof successUrl !== "string" || typeof cancelUrl !== "string") {
        return res.status(400).json({ ok: false, error: "successUrl and cancelUrl are required" });
      }

      const orderService = new CommerceOrderService(repository);
      const order = await orderService.getOrder(orderId);

      if (!order) {
        return res.status(404).json({ ok: false, error: "Order not found" });
      }
      if (order.state !== "pending") {
        return res.status(409).json({ ok: false, error: `Order is not in pending state: ${order.state}` });
      }
      if (order.provider !== null) {
        return res.status(409).json({ ok: false, error: "Order already has a provider binding" });
      }

      // Create mock checkout session
      const sessionId = `cs_test_${orderId}_${Date.now()}`;
      const url = `${successUrl}?session_id=${sessionId}`;
      MOCK_CHECKOUT_SESSIONS.set(sessionId, { id: sessionId, url });

      res.json({ ok: true, sessionId, url });
    } catch (error) {
      logEventError("api.checkout_session_failed", error);
      res.status(500).json({ ok: false, error: "Checkout session creation failed" });
    }
  });

  const server = await registerRoutes(app, { paymentRepository: repository });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${(address as any).port}`;
    await work(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function customerCookie(customerId = "cust_integration_1", email = "buyer@example.com"): string {
  const token = createSessionToken({ id: customerId, email });
  return `drivable_session=${token}`;
}

function signStripePayload(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function postJson(baseUrl: string, path: string, body: unknown, cookie?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const parsed = await response.json();
  return { response, body: parsed as Record<string, unknown> };
}

async function getJson(baseUrl: string, path: string, cookie?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { cookie } : {},
  });
  const parsed = await response.json();
  return { response, body: parsed as Record<string, unknown> };
}

async function postWebhook(baseUrl: string, payload: string, signature: string) {
  const response = await fetch(`${baseUrl}/api/commerce/webhook/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
  const parsed = await response.json();
  return { response, body: parsed as Record<string, unknown> };
}

test("payment chain: create order -> checkout -> webhook verified -> entitlement -> receipt", async () => {
  const repository = new TestDurableCommerceRepository();
  await withFullServer(repository, async (baseUrl) => {
    const cookie = customerCookie();
    const offer = getLaunchOffer("buyer_precheck");

    // 1. Create pending order
    const createOrder = await postJson(baseUrl, "/api/commerce/orders", { offerId: "buyer_precheck", caseId: "case_integration_1" }, cookie);
    assert.equal(createOrder.response.status, 201);
    assert.equal(createOrder.body.ok, true);
    const orderId = createOrder.body.order?.orderId as string;
    assert.ok(orderId);
    assert.equal(createOrder.body.order?.state, "pending");
    assert.equal(createOrder.body.order?.entitledHint, "not_entitled");

    // 2. Create checkout session
    const successUrl = "https://example.com/success";
    const cancelUrl = "https://example.com/cancel";
    const checkout = await postJson(baseUrl, `/api/commerce/orders/${orderId}/checkout`, { successUrl, cancelUrl }, cookie);
    assert.equal(checkout.response.status, 200);
    assert.equal(checkout.body.ok, true);
    const sessionId = checkout.body.sessionId as string;
    const checkoutUrl = checkout.body.url as string;
    assert.ok(sessionId);
    assert.ok(checkoutUrl);

    // 3. Simulate Stripe checkout.session.completed webhook
    const webhookEvent = {
      id: "evt_integration_paid",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: sessionId,
          payment_intent: "pi_integration_1",
          amount_total: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId },
        },
      },
    };
    const payload = JSON.stringify(webhookEvent);
    const signature = signStripePayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);

    const webhook = await postWebhook(baseUrl, payload, signature);
    assert.equal(webhook.response.status, 200);
    assert.equal(webhook.body.ok, true);
    assert.equal(webhook.body.status, "applied");
    assert.equal(webhook.body.state, "verified");
    assert.equal(webhook.body.orderId, orderId);

    // 4. Check entitlement
    const entitlement = await getJson(baseUrl, `/api/commerce/orders/${orderId}/entitlement`, cookie);
    assert.equal(entitlement.response.status, 200);
    assert.equal(entitlement.body.ok, true);
    assert.equal(entitlement.body.entitled, true);
    assert.equal(entitlement.body.code, "entitled");
    assert.equal(entitlement.body.order?.state, "verified");
    assert.equal(entitlement.body.order?.entitledHint, "fulfillment_eligible");
    assert.equal(entitlement.body.order?.providerOrderReference, "pi_integration_1");

    // 5. Verify receipt/status endpoint
    const receipt = await getJson(baseUrl, `/api/commerce/orders/${orderId}`, cookie);
    assert.equal(receipt.response.status, 200);
    assert.equal(receipt.body.ok, true);
    assert.equal(receipt.body.order?.state, "verified");
    assert.equal(receipt.body.order?.entitledHint, "fulfillment_eligible");
    assert.equal(receipt.body.order?.providerOrderReference, "pi_integration_1");

    // 6. Verify case binding works - wrong caseId rejected
    const wrongCase = await getJson(baseUrl, `/api/commerce/orders/${orderId}/entitlement?caseId=case_wrong`, cookie);
    assert.equal(wrongCase.response.status, 409);
    assert.equal(wrongCase.body.ok, false);
    assert.equal(wrongCase.body.code, "wrong_case");
    assert.equal("order" in wrongCase.body, false);

    // 7. Verify correct caseId accepted
    const correctCase = await getJson(baseUrl, `/api/commerce/orders/${orderId}/entitlement?caseId=case_integration_1`, cookie);
    assert.equal(correctCase.response.status, 200);
    assert.equal(correctCase.body.ok, true);
    assert.equal(correctCase.body.entitled, true);
    assert.equal(correctCase.body.code, "entitled");
  });
});

test("payment chain: buyer_check_full uses the fixed price and reaches verified entitlement", async () => {
  const repository = new TestDurableCommerceRepository();
  await withFullServer(repository, async (baseUrl) => {
    const cookie = customerCookie("cust_buyer_check_full", "buyer-full@example.com");
    const offer = getLaunchOffer("buyer_check_full");
    assert.equal(offer.amountMinor, 3900);
    assert.equal(offer.currency, "USD");

    const createOrder = await postJson(
      baseUrl,
      "/api/commerce/orders",
      { offerId: "buyer_check_full", caseId: "case_buyer_check_full" },
      cookie,
    );
    assert.equal(createOrder.response.status, 201);
    assert.equal(createOrder.body.ok, true);
    const order = createOrder.body.order as Record<string, unknown>;
    const orderId = order.orderId as string;
    assert.ok(orderId);
    assert.equal(order.state, "pending");
    assert.deepEqual(order.offer, {
      offerId: "buyer_check_full",
      offerVersion: "v1",
      label: "Buyer Check Full",
      amountMinor: 3900,
      currency: "USD",
    });

    const checkout = await postJson(
      baseUrl,
      `/api/commerce/orders/${orderId}/checkout`,
      { successUrl: "https://example.com/buyer-check-full/success", cancelUrl: "https://example.com/buyer-check-full/cancel" },
      cookie,
    );
    assert.equal(checkout.response.status, 200);
    const sessionId = checkout.body.sessionId as string;

    const webhookEvent = {
      id: "evt_buyer_check_full_paid",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: sessionId,
          payment_intent: "pi_buyer_check_full",
          amount_total: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId },
        },
      },
    };
    const payload = JSON.stringify(webhookEvent);
    const signature = signStripePayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);
    const webhook = await postWebhook(baseUrl, payload, signature);
    assert.equal(webhook.response.status, 200);
    assert.equal(webhook.body.state, "verified");

    const entitlement = await getJson(
      baseUrl,
      `/api/commerce/orders/${orderId}/entitlement?caseId=case_buyer_check_full`,
      cookie,
    );
    assert.equal(entitlement.response.status, 200);
    assert.equal(entitlement.body.entitled, true);
    assert.equal(entitlement.body.code, "entitled");
    assert.equal((entitlement.body.order as Record<string, unknown>).offer &&
      ((entitlement.body.order as Record<string, unknown>).offer as Record<string, unknown>).offerId,
      "buyer_check_full");
  });
});

test("payment chain: failed payment stays safe and never entitled", async () => {
  const repository = new TestDurableCommerceRepository();
  await withFullServer(repository, async (baseUrl) => {
    const cookie = customerCookie();
    const offer = getLaunchOffer("buyer_precheck");

    const createOrder = await postJson(baseUrl, "/api/commerce/orders", { offerId: "buyer_precheck", caseId: "case_failed_1" }, cookie);
    assert.equal(createOrder.response.status, 201);
    const orderId = createOrder.body.order?.orderId as string;

    const successUrl = "https://example.com/success";
    const cancelUrl = "https://example.com/cancel";
    await postJson(baseUrl, `/api/commerce/orders/${orderId}/checkout`, { successUrl, cancelUrl }, cookie);

    // Simulate payment_intent.payment_failed webhook
    const webhookEvent = {
      id: "evt_integration_failed",
      type: "payment_intent.payment_failed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "pi_integration_failed",
          amount: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId },
        },
      },
    };
    const payload = JSON.stringify(webhookEvent);
    const signature = signStripePayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);

    const webhook = await postWebhook(baseUrl, payload, signature);
    assert.equal(webhook.response.status, 200);
    assert.equal(webhook.body.ok, true);
    assert.equal(webhook.body.status, "applied");
    assert.equal(webhook.body.state, "failed");

    // Entitlement should be false
    const entitlement = await getJson(baseUrl, `/api/commerce/orders/${orderId}/entitlement`, cookie);
    assert.equal(entitlement.response.status, 200);
    assert.equal(entitlement.body.ok, true);
    assert.equal(entitlement.body.entitled, false);
    assert.equal(entitlement.body.code, "payment_not_verified");
    assert.equal(entitlement.body.order?.state, "failed");
    assert.equal(entitlement.body.order?.entitledHint, "not_entitled");
  });
});

test("payment chain: duplicate webhook is idempotent", async () => {
  const repository = new TestDurableCommerceRepository();
  await withFullServer(repository, async (baseUrl) => {
    const cookie = customerCookie();
    const offer = getLaunchOffer("buyer_precheck");

    const createOrder = await postJson(baseUrl, "/api/commerce/orders", { offerId: "buyer_precheck", caseId: "case_idempotent_1" }, cookie);
    const orderId = createOrder.body.order?.orderId as string;

    const successUrl = "https://example.com/success";
    const cancelUrl = "https://example.com/cancel";
    const checkout = await postJson(baseUrl, `/api/commerce/orders/${orderId}/checkout`, { successUrl, cancelUrl }, cookie);
    const sessionId = checkout.body.sessionId as string;

    const webhookEvent = {
      id: "evt_integration_idempotent",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: sessionId,
          payment_intent: "pi_integration_idempotent",
          amount_total: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId },
        },
      },
    };
    const payload = JSON.stringify(webhookEvent);
    const signature = signStripePayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);

    // First webhook
    const first = await postWebhook(baseUrl, payload, signature);
    assert.equal(first.response.status, 200);
    assert.equal(first.body.status, "applied");
    assert.equal(first.body.state, "verified");

    // Duplicate webhook
    const duplicate = await postWebhook(baseUrl, payload, signature);
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.body.status, "duplicate");
    assert.equal(duplicate.body.state, "verified");

    // Order should still be verified, version incremented only once
    const entitlement = await getJson(baseUrl, `/api/commerce/orders/${orderId}/entitlement`, cookie);
    assert.equal(entitlement.body.order?.state, "verified");
    assert.equal(entitlement.body.entitled, true);
  });
});

test("payment chain: refund flow - refund_required -> refund_confirmed", async () => {
  const repository = new TestDurableCommerceRepository();
  await withFullServer(repository, async (baseUrl) => {
    const cookie = customerCookie();
    const offer = getLaunchOffer("buyer_precheck");

    const createOrder = await postJson(baseUrl, "/api/commerce/orders", { offerId: "buyer_precheck", caseId: "case_refund_1" }, cookie);
    const orderId = createOrder.body.order?.orderId as string;

    const successUrl = "https://example.com/success";
    const cancelUrl = "https://example.com/cancel";
    const checkout = await postJson(baseUrl, `/api/commerce/orders/${orderId}/checkout`, { successUrl, cancelUrl }, cookie);
    const sessionId = checkout.body.sessionId as string;

    // Payment verified
    const paidEvent = {
      id: "evt_refund_paid",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: sessionId,
          payment_intent: "pi_refund_1",
          amount_total: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId },
        },
      },
    };
    const paidPayload = JSON.stringify(paidEvent);
    const paidSignature = signStripePayload(paidPayload, process.env.STRIPE_WEBHOOK_SECRET!);
    await postWebhook(baseUrl, paidPayload, paidSignature);

    // Verify verified state
    let entitlement = await getJson(baseUrl, `/api/commerce/orders/${orderId}/entitlement`, cookie);
    assert.equal(entitlement.body.entitled, true);
    assert.equal(entitlement.body.order?.state, "verified");

    // Request refund
    const refundReq = await postJson(baseUrl, `/api/commerce/orders/${orderId}/refund-required`, { reasonCode: "fulfillment_unavailable" }, cookie);
    assert.equal(refundReq.response.status, 200);
    assert.equal(refundReq.body.ok, true);
    assert.equal(refundReq.body.order?.state, "refund_required");

    // Simulate charge.refunded webhook
    const refundEvent = {
      id: "evt_refund_confirmed",
      type: "charge.refunded",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "ch_refund_1",
          payment_intent: "pi_refund_1",
          amount: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId },
        },
      },
    };
    const refundPayload = JSON.stringify(refundEvent);
    const refundSignature = signStripePayload(refundPayload, process.env.STRIPE_WEBHOOK_SECRET!);

    const refundWebhook = await postWebhook(baseUrl, refundPayload, refundSignature);
    assert.equal(refundWebhook.response.status, 200);
    assert.equal(refundWebhook.body.ok, true);
    assert.equal(refundWebhook.body.status, "applied");
    assert.equal(refundWebhook.body.state, "refunded");

    // Verify refunded state - never entitled
    entitlement = await getJson(baseUrl, `/api/commerce/orders/${orderId}/entitlement`, cookie);
    assert.equal(entitlement.response.status, 200);
    assert.equal(entitlement.body.entitled, false);
    assert.equal(entitlement.body.code, "payment_not_verified");
    assert.equal(entitlement.body.order?.state, "refunded");
    assert.equal(entitlement.body.order?.entitledHint, "not_entitled");

    // Duplicate refund webhook is idempotent
    const replay = await postWebhook(baseUrl, refundPayload, refundSignature);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.status, "duplicate");
    assert.equal(replay.body.state, "refunded");
  });
});

test("payment chain: unverified order cannot be refunded via webhook", async () => {
  const repository = new TestDurableCommerceRepository();
  await withFullServer(repository, async (baseUrl) => {
    const cookie = customerCookie();
    const offer = getLaunchOffer("human_pro_review");

    const createOrder = await postJson(baseUrl, "/api/commerce/orders", { offerId: "human_pro_review", caseId: "case_unverified_refund" }, cookie);
    const orderId = createOrder.body.order?.orderId as string;

    // Simulate charge.refunded on never-verified order
    const refundEvent = {
      id: "evt_unverified_refund",
      type: "charge.refunded",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "ch_unverified",
          payment_intent: "pi_unverified",
          amount: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId },
        },
      },
    };
    const payload = JSON.stringify(refundEvent);
    const signature = signStripePayload(payload, process.env.STRIPE_WEBHOOK_SECRET!);

    const webhook = await postWebhook(baseUrl, payload, signature);
    assert.equal(webhook.response.status, 503);
    assert.equal(webhook.body.ok, false);
    assert.equal(webhook.body.code, "illegal_transition");

    // Order should remain pending
    const entitlement = await getJson(baseUrl, `/api/commerce/orders/${orderId}/entitlement`, cookie);
    assert.equal(entitlement.body.order?.state, "pending");
    assert.equal(entitlement.body.entitled, false);
  });
});
