import type { CommerceOrder } from "./order-contract.js";

export type CommerceReceipt = Readonly<{
  orderId: string;
  caseId: string;
  offer: CommerceOrder["offer"];
  state: CommerceOrder["state"];
  providerOrderReference: string | null;
  refundReasonCode: string | null;
  /** Verified is necessary but never sufficient for fulfillment on its own. */
  entitledHint: "fulfillment_eligible" | "not_entitled";
  createdAt: string;
  updatedAt: string;
}>;

/**
 * Customer-facing receipt/status view of a commerce order.
 *
 * Only safe, already-persisted order fields are exposed. Secrets,
 * signatures, and internal versions never leave the server.
 */
export function toCommerceReceipt(order: CommerceOrder): CommerceReceipt {
  return Object.freeze({
    orderId: order.orderId,
    caseId: order.caseId,
    offer: Object.freeze({ ...order.offer }),
    state: order.state,
    providerOrderReference: order.provider?.providerOrderReference ?? null,
    refundReasonCode: order.refundReasonCode,
    entitledHint: order.state === "verified" ? "fulfillment_eligible" : "not_entitled",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  });
}
