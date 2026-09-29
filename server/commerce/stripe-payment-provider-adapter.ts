import Stripe from "stripe";
import {
  CommerceContractError,
  type PaymentProviderAdapter,
  type NormalizedProviderPaymentEvent,
} from "./order-contract.js";

const STRIPE_ADAPTER_ID = "stripe_adapter";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new CommerceContractError(
      "provider_unavailable",
      `${name} is not configured`,
    );
  }
  return value;
}

function stripeClient(): Stripe {
  return new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    typescript: true,
  });
}

function parseStripeWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string,
): Stripe.Event {
  return stripeClient().webhooks.constructEvent(payload, signature, webhookSecret);
}

function normalizeStripeEvent(event: Stripe.Event): NormalizedProviderPaymentEvent {
  const timestamp = new Date(event.created * 1000).toISOString();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.payment_intent || !session.amount_total || !session.currency) {
        throw new CommerceContractError(
          "invalid_provider_event",
          "Checkout session missing payment intent, amount, or currency",
        );
      }
      return Object.freeze({
        schemaVersion: 1,
        eventId: event.id,
        provider: "stripe",
        providerOrderReference: session.payment_intent as string,
        orderId: session.metadata?.orderId ?? "",
        kind: "payment_verified",
        amountMinor: session.amount_total,
        currency: session.currency.toUpperCase(),
        occurredAt: timestamp,
      });
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (!intent.amount || !intent.currency) {
        throw new CommerceContractError(
          "invalid_provider_event",
          "Payment intent missing amount or currency",
        );
      }
      return Object.freeze({
        schemaVersion: 1,
        eventId: event.id,
        provider: "stripe",
        providerOrderReference: intent.id,
        orderId: intent.metadata?.orderId ?? "",
        kind: "payment_failed",
        amountMinor: intent.amount,
        currency: intent.currency.toUpperCase(),
        occurredAt: timestamp,
      });
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      if (!charge.amount || !charge.currency || !charge.payment_intent) {
        throw new CommerceContractError(
          "invalid_provider_event",
          "Refunded charge missing amount, currency, or payment intent",
        );
      }
      return Object.freeze({
        schemaVersion: 1,
        eventId: event.id,
        provider: "stripe",
        providerOrderReference: charge.payment_intent as string,
        orderId: charge.metadata?.orderId ?? "",
        kind: "refund_confirmed",
        amountMinor: charge.amount,
        currency: charge.currency.toUpperCase(),
        occurredAt: timestamp,
      });
    }
    default:
      throw new CommerceContractError(
        "invalid_provider_event",
        `Unsupported Stripe event type: ${event.type}`,
      );
  }
}

export class StripePaymentProviderAdapter implements PaymentProviderAdapter {
  readonly adapterId = STRIPE_ADAPTER_ID;
  readonly capabilities = Object.freeze({
    configured: true,
    serverSideOnly: true,
    verifiesAuthenticity: true,
    bindsOrderIdFromAuthenticatedMetadata: true,
  });

  private readonly webhookSecret: string;

  constructor() {
    this.webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  }

  async verifyAndNormalize(payload: unknown): Promise<NormalizedProviderPaymentEvent> {
    const request = payload as {
      rawBody: string | Buffer;
      signature: string;
    };

    if (!request || (typeof request.rawBody !== "string" && !Buffer.isBuffer(request.rawBody))) {
      throw new CommerceContractError(
        "invalid_provider_event",
        "Stripe webhook payload must contain rawBody as string or Buffer",
      );
    }
    if (!request.signature || typeof request.signature !== "string") {
      throw new CommerceContractError(
        "invalid_provider_event",
        "Stripe webhook payload must contain signature header",
      );
    }

    let event: Stripe.Event;
    try {
      event = parseStripeWebhookEvent(request.rawBody, request.signature, this.webhookSecret);
    } catch (cause) {
      throw new CommerceContractError(
        "invalid_provider_event",
        "Stripe webhook signature verification failed",
        { cause },
      );
    }

    return normalizeStripeEvent(event);
  }

  static createCheckoutSession(
    params: Readonly<{
      orderId: string;
      amountMinor: number;
      currency: string;
      successUrl: string;
      cancelUrl: string;
      customerEmail?: string;
      metadata?: Record<string, string>;
    }>,
  ): Promise<Stripe.Checkout.Session> {
    return stripeClient().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: {
              name: `Drivable Order ${params.orderId}`,
            },
            unit_amount: params.amountMinor,
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      metadata: {
        orderId: params.orderId,
        ...params.metadata,
      },
    });
  }
}

export { STRIPE_ADAPTER_ID };