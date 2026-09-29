import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createHmac } from "node:crypto";
import { InMemoryCommerceOrderRepository } from "./in-memory-commerce-order-repository.js";
import { getLaunchOffer } from "./commerce-offers.js";
import { toCommerceReceipt } from "./commerce-receipt.js";
import { CommerceOrderService, type CommerceOrderRepository, type CommerceOrderRepositoryCapabilities, type CommitCommerceEventInput, type CommitCommerceEventResult } from "./order-contract.js";

// Test Stripe keys (test mode)
const TEST_STRIPE_SECRET_KEY = "sk_test_doesnotmatter";
const TEST_STRIPE_WEBHOOK_SECRET = "whsec_test_doesnotmatter";

process.env.STRIPE_SECRET_KEY = TEST_STRIPE_SECRET_KEY;
process.env.STRIPE_WEBHOOK_SECRET = TEST_STRIPE_WEBHOOK_SECRET;

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

  create(order: any): Promise<any> { return this.delegate.create(order); }
  get(orderId: string): Promise<any> { return this.delegate.get(orderId); }
  getEventFingerprint(orderId: string, eventId: string): Promise<string | null> { return this.delegate.getEventFingerprint(orderId, eventId); }
  commitEvent(input: CommitCommerceEventInput): Promise<CommitCommerceEventResult> { return this.delegate.commitEvent(input); }
}

async function withTestServer(work: (baseUrl: string, repo: TestDurableCommerceRepository) => Promise<void>) {
  const testRepo = new TestDurableCommerceRepository();
  const app = express();
  // NOTE: no global JSON parser before the webhook route. The raw body must
  // reach signature verification untouched, mirroring server/index.ts.
  app.use("/api/commerce/webhook/stripe", express.raw({ type: "application/json" }), (req, _res, next) => {
    (req as any).rawBody = req.body;
    next();
  });

  // Manually register just the webhook route with our test repository
  const { StripePaymentProviderAdapter, CommerceOrderService: COS, CommerceContractError } = await import("./index.js");

  app.post("/api/commerce/webhook/stripe", async (req, res) => {
    try {
      const signature = req.headers["stripe-signature"];
      if (!signature || typeof signature !== "string") {
        return res.status(400).json({ ok: false, error: "Missing stripe-signature header" });
      }

      const rawBody = (req as unknown as { rawBody?: unknown }).rawBody ?? req.body;
      const adapter = new StripePaymentProviderAdapter();
      const orderService = new COS(testRepo);
      const result = await orderService.applyProviderPayload(adapter, { rawBody, signature });

      res.json({ ok: true, status: result.status, orderId: result.order.orderId, state: result.order.state });
    } catch (error) {
      if (error instanceof CommerceContractError) {
        const status = error.code === "invalid_provider_event" ? 400 : 503;
        return res.status(status).json({ ok: false, error: error.message, code: error.code });
      }
      res.status(500).json({ ok: false, error: "Webhook processing failed" });
    }
  });

  const server = await new Promise<any>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${(address as any).port}`;
    await work(baseUrl, testRepo);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function signPayload(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
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
  const body = await response.json();
  return { response, body: body as Record<string, any> };
}

test("stripe webhook: checkout.session.completed transitions order to verified", async () => {
  // NOTE: events use created = now + 5s. Stripe timestamps truncate to whole
  // seconds while order timestamps carry milliseconds, so a same-second event
  // can look older than the order and be rejected as stale.
  await withTestServer(async (baseUrl, repo) => {
    const orderService = new CommerceOrderService(repo);
    const offer = getLaunchOffer("buyer_precheck");
    const order = await orderService.createPendingOrder({ caseId: "case_test_1", offer });
    assert.equal(order.state, "pending");
    assert.equal(order.provider, null);

    const event = {
      id: "evt_test_1",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "cs_test_1",
          payment_intent: "pi_test_1",
          amount_total: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId: order.orderId },
        },
      },
    };

    const payload = JSON.stringify(event);
    const signature = signPayload(payload, TEST_STRIPE_WEBHOOK_SECRET);

    const { response, body } = await postWebhook(baseUrl, payload, signature);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "applied");
    assert.equal(body.state, "verified");
    assert.equal(body.orderId, order.orderId);

    const updatedOrder = await orderService.getOrder(order.orderId);
    assert.ok(updatedOrder);
    assert.equal(updatedOrder!.state, "verified");
    assert.ok(updatedOrder!.provider);
    assert.equal(updatedOrder!.provider!.providerOrderReference, "pi_test_1");

    // Receipt/entitlement follows the verified order.
    const receipt = toCommerceReceipt(updatedOrder!);
    assert.equal(receipt.state, "verified");
    assert.equal(receipt.entitledHint, "fulfillment_eligible");
    assert.equal(receipt.providerOrderReference, "pi_test_1");
  });
});

test("stripe webhook: duplicate event is idempotent", async () => {
  await withTestServer(async (baseUrl, repo) => {
    const orderService = new CommerceOrderService(repo);
    const offer = getLaunchOffer("buyer_precheck");
    const order = await orderService.createPendingOrder({ caseId: "case_test_2", offer });

    const event = {
      id: "evt_test_2",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "cs_test_2",
          payment_intent: "pi_test_2",
          amount_total: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId: order.orderId },
        },
      },
    };

    const payload = JSON.stringify(event);
    const signature = signPayload(payload, TEST_STRIPE_WEBHOOK_SECRET);

    const first = await postWebhook(baseUrl, payload, signature);
    assert.equal(first.response.status, 200);
    assert.equal(first.body.status, "applied");

    const second = await postWebhook(baseUrl, payload, signature);
    assert.equal(second.response.status, 200);
    assert.equal(second.body.status, "duplicate");

    const updatedOrder = await orderService.getOrder(order.orderId);
    assert.equal(updatedOrder!.state, "verified");
    assert.equal(updatedOrder!.version, 2);
    assert.equal(updatedOrder!.eventCount, 1);
  });
});

test("stripe webhook: payment_intent.payment_failed transitions order to failed", async () => {
  await withTestServer(async (baseUrl, repo) => {
    const orderService = new CommerceOrderService(repo);
    const offer = getLaunchOffer("buyer_precheck");
    const order = await orderService.createPendingOrder({ caseId: "case_test_3", offer });

    const event = {
      id: "evt_test_3",
      type: "payment_intent.payment_failed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "pi_test_3",
          amount: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId: order.orderId },
        },
      },
    };

    const payload = JSON.stringify(event);
    const signature = signPayload(payload, TEST_STRIPE_WEBHOOK_SECRET);

    const { response, body } = await postWebhook(baseUrl, payload, signature);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "applied");
    assert.equal(body.state, "failed");

    const updatedOrder = await orderService.getOrder(order.orderId);
    assert.equal(updatedOrder!.state, "failed");
    // Failed payments are safe: never entitled, provider binding stays case-bound.
    const receipt = toCommerceReceipt(updatedOrder!);
    assert.equal(receipt.entitledHint, "not_entitled");
    assert.equal(receipt.providerOrderReference, "pi_test_3");
  });
});

test("stripe webhook: invalid signature returns 400", async () => {
  await withTestServer(async (baseUrl, repo) => {
    const orderService = new CommerceOrderService(repo);
    const offer = getLaunchOffer("buyer_precheck");
    const order = await orderService.createPendingOrder({ caseId: "case_test_4", offer });

    const event = {
      id: "evt_test_4",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "cs_test_4",
          payment_intent: "pi_test_4",
          amount_total: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId: order.orderId },
        },
      },
    };

    const payload = JSON.stringify(event);
    const invalidSignature = "t=1234567890,v1=invalidsignature";

    const { response, body } = await postWebhook(baseUrl, payload, invalidSignature);

    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.code, "invalid_provider_event");

    const updatedOrder = await orderService.getOrder(order.orderId);
    assert.equal(updatedOrder!.state, "pending");
  });
});

test("stripe webhook: amount mismatch returns 503", async () => {
  await withTestServer(async (baseUrl, repo) => {
    const orderService = new CommerceOrderService(repo);
    const offer = getLaunchOffer("buyer_precheck");
    const order = await orderService.createPendingOrder({ caseId: "case_test_5", offer });

    const event = {
      id: "evt_test_5",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "cs_test_5",
          payment_intent: "pi_test_5",
          amount_total: 9999,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId: order.orderId },
        },
      },
    };

    const payload = JSON.stringify(event);
    const signature = signPayload(payload, TEST_STRIPE_WEBHOOK_SECRET);

    const { response, body } = await postWebhook(baseUrl, payload, signature);

    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.code, "amount_mismatch");

    const updatedOrder = await orderService.getOrder(order.orderId);
    assert.equal(updatedOrder!.state, "pending");
  });
});

test("stripe webhook: currency mismatch returns 503", async () => {
  await withTestServer(async (baseUrl, repo) => {
    const orderService = new CommerceOrderService(repo);
    const offer = getLaunchOffer("buyer_precheck");
    const order = await orderService.createPendingOrder({ caseId: "case_test_6", offer });

    const event = {
      id: "evt_test_6",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "cs_test_6",
          payment_intent: "pi_test_6",
          amount_total: offer.amountMinor,
          currency: "cad",
          metadata: { orderId: order.orderId },
        },
      },
    };

    const payload = JSON.stringify(event);
    const signature = signPayload(payload, TEST_STRIPE_WEBHOOK_SECRET);

    const { response, body } = await postWebhook(baseUrl, payload, signature);

    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.code, "currency_mismatch");

    const updatedOrder = await orderService.getOrder(order.orderId);
    assert.equal(updatedOrder!.state, "pending");
  });
});

test("stripe webhook: unknown event type is rejected without applying", async () => {
  await withTestServer(async (baseUrl, repo) => {
    const orderService = new CommerceOrderService(repo);
    const offer = getLaunchOffer("buyer_precheck");
    const order = await orderService.createPendingOrder({ caseId: "case_test_7", offer });

    const event = {
      id: "evt_test_7",
      type: "customer.created",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "cus_test_7",
        },
      },
    };

    const payload = JSON.stringify(event);
    const signature = signPayload(payload, TEST_STRIPE_WEBHOOK_SECRET);

    const { response, body } = await postWebhook(baseUrl, payload, signature);

    // Unsupported event types are rejected as unauthenticated/unusable
    // provider events (400), never applied.
    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.code, "invalid_provider_event");

    const updatedOrder = await orderService.getOrder(order.orderId);
    assert.equal(updatedOrder!.state, "pending");
  });
});

test("stripe webhook: charge.refunded transitions a verified order to refunded and replays are idempotent", async () => {
  await withTestServer(async (baseUrl, repo) => {
    const orderService = new CommerceOrderService(repo);
    const offer = getLaunchOffer("buyer_precheck");
    const order = await orderService.createPendingOrder({ caseId: "case_test_8", offer });

    const paidEvent = {
      id: "evt_test_8_paid",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "cs_test_8",
          payment_intent: "pi_test_8",
          amount_total: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId: order.orderId },
        },
      },
    };
    const paidPayload = JSON.stringify(paidEvent);
    const paidSignature = signPayload(paidPayload, TEST_STRIPE_WEBHOOK_SECRET);
    const paid = await postWebhook(baseUrl, paidPayload, paidSignature);
    assert.equal(paid.response.status, 200);
    assert.equal(paid.body.state, "verified");

    const refundEvent = {
      id: "evt_test_8_refund",
      type: "charge.refunded",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "ch_test_8",
          payment_intent: "pi_test_8",
          amount: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId: order.orderId },
        },
      },
    };
    const refundPayload = JSON.stringify(refundEvent);
    const refundSignature = signPayload(refundPayload, TEST_STRIPE_WEBHOOK_SECRET);

    const first = await postWebhook(baseUrl, refundPayload, refundSignature);
    assert.equal(first.response.status, 200);
    assert.equal(first.body.ok, true);
    assert.equal(first.body.status, "applied");
    assert.equal(first.body.state, "refunded");

    // Replayed refund webhook must not double-apply.
    const replay = await postWebhook(baseUrl, refundPayload, refundSignature);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.status, "duplicate");
    assert.equal(replay.body.state, "refunded");

    const updatedOrder = await orderService.getOrder(order.orderId);
    assert.equal(updatedOrder!.state, "refunded");
    assert.equal(updatedOrder!.caseId, "case_test_8");
    assert.equal(updatedOrder!.provider!.providerOrderReference, "pi_test_8");
    assert.equal(updatedOrder!.version, 3);
    assert.equal(updatedOrder!.eventCount, 2);

    // Refunded orders are never entitled.
    const receipt = toCommerceReceipt(updatedOrder!);
    assert.equal(receipt.state, "refunded");
    assert.equal(receipt.entitledHint, "not_entitled");
  });
});

test("stripe webhook: charge.refunded on a never-verified order stays safe", async () => {
  await withTestServer(async (baseUrl, repo) => {
    const orderService = new CommerceOrderService(repo);
    const offer = getLaunchOffer("buyer_precheck");
    const order = await orderService.createPendingOrder({ caseId: "case_test_9", offer });

    const refundEvent = {
      id: "evt_test_9_refund",
      type: "charge.refunded",
      created: Math.floor(Date.now() / 1000) + 5,
      data: {
        object: {
          id: "ch_test_9",
          payment_intent: "pi_test_9",
          amount: offer.amountMinor,
          currency: offer.currency.toLowerCase(),
          metadata: { orderId: order.orderId },
        },
      },
    };
    const payload = JSON.stringify(refundEvent);
    const signature = signPayload(payload, TEST_STRIPE_WEBHOOK_SECRET);

    const { response, body } = await postWebhook(baseUrl, payload, signature);
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.code, "illegal_transition");

    const updatedOrder = await orderService.getOrder(order.orderId);
    assert.equal(updatedOrder!.state, "pending");
    assert.equal(toCommerceReceipt(updatedOrder!).entitledHint, "not_entitled");
  });

  test("stripe webhook: charge.refunded on a never-verified order stays safe with human_pro_review offer", async () => {
    await withTestServer(async (baseUrl, repo) => {
      const orderService = new CommerceOrderService(repo);
      const offer = getLaunchOffer("human_pro_review");
      const order = await orderService.createPendingOrder({ caseId: "case_test_10", offer });

      const refundEvent = {
        id: "evt_test_10_refund",
        type: "charge.refunded",
        created: Math.floor(Date.now() / 1000) + 5,
        data: {
          object: {
            id: "ch_test_10",
            payment_intent: "pi_test_10",
            amount: offer.amountMinor,
            currency: offer.currency.toLowerCase(),
            metadata: { orderId: order.orderId },
          },
        },
      };
      const payload = JSON.stringify(refundEvent);
      const signature = signPayload(payload, TEST_STRIPE_WEBHOOK_SECRET);

      const { response, body } = await postWebhook(baseUrl, payload, signature);
      assert.equal(response.status, 503);
      assert.equal(body.ok, false);
      assert.equal(body.code, "illegal_transition");

      const updatedOrder = await orderService.getOrder(order.orderId);
      assert.equal(updatedOrder!.state, "pending");
      assert.equal(toCommerceReceipt(updatedOrder!).entitledHint, "not_entitled");
    });
  });
});
