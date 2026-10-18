import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { StripeTestPaymentAdapter } from "./stripe-test-payment-adapter.js";
import { getTestPaymentRuntime, verifyTestPaymentReadiness } from "./payment-runtime.js";

const secret = "whsec_local_test_only_never_a_live_secret";
const stripe = new Stripe("sk_test_local_only");
function signed(eventOverrides = {}, paymentOverrides = {}) {
  const rawBody = Buffer.from(JSON.stringify({ id: "evt_test", type: "payment_intent.succeeded",
    created: Math.floor(Date.now() / 1000), livemode: false,
    data: { object: { object: "payment_intent", id: "pi_test", status: "succeeded", livemode: false,
      amount: 4900, amount_received: 4900, currency: "usd", metadata: { drivableOrderId: "ord_test" },
      ...paymentOverrides } }, ...eventOverrides }));
  return { rawBody, signature: stripe.webhooks.generateTestHeaderString({ payload: rawBody.toString(), secret }) };
}

test("authentic confirmed test payment is normalized with signed order metadata", async () => {
  const event = await new StripeTestPaymentAdapter(secret).verifyAndNormalize(signed());
  assert.equal(event.orderId, "ord_test"); assert.equal(event.kind, "payment_verified");
  assert.equal(event.amountMinor, 4900); assert.equal(event.currency, "USD");
  assert.equal(event.provider, "stripe_test");
});

test("invalid/missing signatures, tampered bytes, parsed body and stale signatures are rejected", async () => {
  const adapter = new StripeTestPaymentAdapter(secret);
  const valid = signed();
  for (const payload of [ { ...valid, signature: "invalid" }, { rawBody: valid.rawBody },
    { ...valid, rawBody: Buffer.from(valid.rawBody.toString().replace("4900", "4901")) },
    { ...valid, rawBody: JSON.parse(valid.rawBody.toString()) },
    { ...valid, signature: stripe.webhooks.generateTestHeaderString({ payload: valid.rawBody.toString(), secret,
      timestamp: Math.floor(Date.now() / 1000) - 301 }) } ]) {
    await assert.rejects(adapter.verifyAndNormalize(payload));
  }
});

test("unconfirmed, partial, unrelated, unbound, connected-account and live events are rejected", async () => {
  const adapter = new StripeTestPaymentAdapter(secret);
  for (const status of ["processing", "requires_capture", "requires_action", "canceled"]) {
    await assert.rejects(adapter.verifyAndNormalize(signed({}, { status })));
  }
  for (const payload of [signed({}, { amount_received: 100 }), signed({}, { metadata: {} }),
    signed({ type: "payment_intent.processing" }), signed({ livemode: true }),
    signed({}, { livemode: true }), signed({ account: "acct_other" })]) {
    await assert.rejects(adapter.verifyAndNormalize(payload));
  }
});

test("test runtime rejects production, disabled gate and missing signing configuration", () => {
  assert.throws(() => getTestPaymentRuntime({ NODE_ENV: "production", DRIVABLE_TEST_PAYMENTS_ENABLED: "true",
    DRIVABLE_STRIPE_TEST_WEBHOOK_SECRET: secret }));
  assert.throws(() => getTestPaymentRuntime({}));
  assert.throws(() => getTestPaymentRuntime({ DRIVABLE_TEST_PAYMENTS_ENABLED: "true" }));
  assert.equal(new StripeTestPaymentAdapter(undefined).capabilities.configured, false);
});

test("unconfigured runtime readiness remains closed", async () => {
  const old = process.env.DRIVABLE_TEST_PAYMENTS_ENABLED;
  delete process.env.DRIVABLE_TEST_PAYMENTS_ENABLED;
  try { assert.equal(await verifyTestPaymentReadiness(), false); }
  finally { if (old !== undefined) process.env.DRIVABLE_TEST_PAYMENTS_ENABLED = old; }
});

test("readiness requires actual storage verification and persisted verified-payment proof", async () => {
  function runtime(storage: boolean, proof: boolean, rows = true) {
    return { repository: { async verifyStorage() { return storage; }, async hasVerifiedPayment() { return proof; } },
      executor: { async query<Row>() { return { rows: (rows ? [{ order_id: "ord_test" }] : []) as Row[] }; } } };
  }
  assert.equal(await verifyTestPaymentReadiness(() => runtime(false, true)), false);
  assert.equal(await verifyTestPaymentReadiness(() => runtime(true, false)), false);
  assert.equal(await verifyTestPaymentReadiness(() => runtime(true, true, false)), false);
  assert.equal(await verifyTestPaymentReadiness(() => runtime(true, true)), true);
  assert.equal(await verifyTestPaymentReadiness(() => { throw new Error("database outage"); }), false);
});
