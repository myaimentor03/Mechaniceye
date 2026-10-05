import { CommerceContractError, type CommerceOfferSnapshot } from "./order-contract.js";

/**
 * Launch allowlist for paid-beta commerce offers.
 *
 * Prices are fixed server-side: clients pick an offerId, never an amount.
 * Free concepts (e.g. early ClearSale Evidence Pack) are intentionally
 * absent — a zero-amount offer can never become a commerce order.
 */
const LAUNCH_OFFERS: Readonly<Record<string, CommerceOfferSnapshot>> = Object.freeze({
  buyer_precheck: Object.freeze({
    offerId: "buyer_precheck",
    offerVersion: "v1",
    label: "Buyer Pre-Check",
    amountMinor: 1900,
    currency: "USD",
  }),
  buyer_check_full: Object.freeze({
    offerId: "buyer_check_full",
    offerVersion: "v1",
    label: "Buyer Check Full",
    amountMinor: 3900,
    currency: "USD",
  }),
  clearsale_evidence_pack: Object.freeze({
    offerId: "clearsale_evidence_pack",
    offerVersion: "v1",
    label: "ClearSale Evidence Pack",
    amountMinor: 1900,
    currency: "USD",
  }),
  featured_clearsale_listing: Object.freeze({
    offerId: "featured_clearsale_listing",
    offerVersion: "v1",
    label: "Featured ClearSale Listing",
    amountMinor: 1500,
    currency: "USD",
  }),
  human_pro_review: Object.freeze({
    offerId: "human_pro_review",
    offerVersion: "v1",
    label: "Human Pro Review",
    amountMinor: 9900,
    currency: "USD",
  }),
});

export function getLaunchOffer(offerId: unknown): CommerceOfferSnapshot {
  if (typeof offerId !== "string" || !(offerId in LAUNCH_OFFERS)) {
    throw new CommerceContractError("invalid_order_input", "Unknown offerId");
  }
  const offer = LAUNCH_OFFERS[offerId];
  return Object.freeze({ ...offer });
}

export function listLaunchOffers(): CommerceOfferSnapshot[] {
  return Object.values(LAUNCH_OFFERS).map((offer) => Object.freeze({ ...offer }));
}
