import Stripe from "stripe";
import { CommerceContractError, type CommerceOrder, type NormalizedProviderPaymentEvent, type PaymentProviderAdapter } from "./order-contract.js";

export const STRIPE_TEST_CONTRACT = Object.freeze({ adapterId: "stripe_test_v1", provider: "stripe_test", metadataKey: "drivableOrderId" });
export class UnsupportedStripePaymentEvent extends Error {}
export type StripeOrderResolver = (providerReference: string) => Promise<string | null>;

/** Canonical test-only provider contract. Signature verification never needs an API key. */
export class StripeTestPaymentAdapter implements PaymentProviderAdapter {
  readonly adapterId = STRIPE_TEST_CONTRACT.adapterId;
  readonly capabilities;
  private readonly stripe = new Stripe("sk_test_local_signature_verification_only");
  constructor(private readonly webhookSecret: string | undefined, private readonly resolveOrder?: StripeOrderResolver) {
    this.capabilities = Object.freeze({ configured: Boolean(webhookSecret?.startsWith("whsec_") && webhookSecret.length >= 16),
      serverSideOnly: true, verifiesAuthenticity: true, bindsOrderIdFromAuthenticatedMetadata: true });
  }

  async verifyAndNormalize(payload: unknown): Promise<NormalizedProviderPaymentEvent> {
    if (!this.capabilities.configured) throw new Error("Test webhook signing is not configured");
    const input = payload as { rawBody?: unknown; signature?: unknown } | null;
    if (!input || !Buffer.isBuffer(input.rawBody) || typeof input.signature !== "string") throw new Error("Original body and signature required");
    const event = this.stripe.webhooks.constructEvent(input.rawBody, input.signature, this.webhookSecret!, 300);
    if (event.livemode !== false || event.account) throw new Error("Only platform test-mode events are accepted");
    const object = event.data.object;
    if (!("livemode" in object) || object.livemode !== false) throw new Error("Live objects are rejected");
    let orderId: string | undefined, reference: string, amount: number, currency: string;
    let kind: NormalizedProviderPaymentEvent["kind"], refundedAmountMinor: number | undefined;
    if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
      const payment = object as Stripe.PaymentIntent;
      if (payment.object !== "payment_intent") throw new Error("Invalid payment object");
      if (event.type === "payment_intent.succeeded" && (payment.status !== "succeeded" || payment.amount_received !== payment.amount)) {
        throw new Error("A fully confirmed payment is required");
      }
      if (event.type === "payment_intent.payment_failed" && payment.status !== "requires_payment_method") throw new Error("Invalid failed attempt");
      orderId = payment.metadata?.drivableOrderId; reference = payment.id; amount = payment.amount; currency = payment.currency;
      kind = event.type === "payment_intent.succeeded" ? "payment_verified" : "payment_failed";
    } else if (event.type === "checkout.session.completed") {
      const session = object as Stripe.Checkout.Session;
      if (session.object !== "checkout.session" || session.mode !== "payment" || session.payment_status !== "paid"
        || session.status !== "complete" || typeof session.payment_intent !== "string") throw new Error("Checkout is not fully paid");
      orderId = session.metadata?.drivableOrderId; reference = session.payment_intent; amount = session.amount_total!; currency = session.currency!;
      kind = "payment_verified";
    } else if (event.type === "charge.refunded") {
      const charge = object as Stripe.Charge;
      if (charge.object !== "charge" || charge.status !== "succeeded" || !charge.paid
        || typeof charge.payment_intent !== "string" || !Number.isSafeInteger(charge.amount_refunded)
        || charge.amount_refunded <= 0 || charge.amount_refunded > charge.amount
        || charge.refunded !== (charge.amount_refunded === charge.amount)) throw new Error("Invalid cumulative refund");
      // Use a previously persisted authenticated PaymentIntent binding, never assumed Charge metadata inheritance.
      reference = charge.payment_intent;
      try { orderId = await this.resolveOrder?.(reference) ?? undefined; }
      catch (cause) { throw new CommerceContractError("persistence_failed", "Refund binding could not be loaded", { cause }); }
      if (!orderId) throw new CommerceContractError("persistence_failed", "Refund arrived before a durable payment binding; retry required");
      amount = charge.amount; currency = charge.currency; refundedAmountMinor = charge.amount_refunded;
      kind = charge.refunded ? "refund_confirmed" : "refund_partial";
    } else throw new UnsupportedStripePaymentEvent("Unsupported payment event");
    if (!orderId || !/^pi_[A-Za-z0-9_]+$/.test(reference) || !Number.isSafeInteger(amount) || amount <= 0
      || typeof currency !== "string" || !/^[a-z]{3}$/.test(currency)
      || !Number.isSafeInteger(event.created)) throw new Error("Invalid order-bound payment");
    return Object.freeze({ schemaVersion: 1, eventId: event.id, provider: STRIPE_TEST_CONTRACT.provider,
      providerOrderReference: reference, orderId, kind, amountMinor: amount, currency: currency.toUpperCase(),
      occurredAt: new Date(event.created * 1000).toISOString(), ...(refundedAmountMinor !== undefined ? { refundedAmountMinor } : {}) });
  }
}

export async function createStripeTestCheckout(order: CommerceOrder, apiKey: string | undefined,
  origin: string, customerEmail: string, client?: Pick<Stripe, "checkout">) {
  if (!apiKey?.startsWith("sk_test_")) throw new Error("Only a test-mode Stripe key is accepted");
  const stripe = client ?? new Stripe(apiKey);
  const metadata = { drivableOrderId: order.orderId, drivableCaseId: order.caseId };
  return stripe.checkout.sessions.create({ mode: "payment", payment_method_types: ["card"],
    client_reference_id: order.orderId, customer_email: customerEmail, metadata, payment_intent_data: { metadata },
    line_items: [{ price_data: { currency: order.offer.currency.toLowerCase(), unit_amount: order.offer.amountMinor,
      product_data: { name: order.offer.label } }, quantity: 1 }],
    success_url: `${origin}/?payment=returned&orderId=${encodeURIComponent(order.orderId)}`,
    cancel_url: `${origin}/?payment=canceled&orderId=${encodeURIComponent(order.orderId)}`,
  }, { idempotencyKey: `drivable-checkout-${order.orderId}` });
}
