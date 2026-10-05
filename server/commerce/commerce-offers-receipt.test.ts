import assert from "node:assert/strict";
import test from "node:test";

import { getLaunchOffer, listLaunchOffers } from "./commerce-offers.js";
import { toCommerceReceipt } from "./commerce-receipt.js";
import { CommerceContractError, type CommerceOrder } from "./order-contract.js";

function baseOrder(overrides: Partial<CommerceOrder> = {}): CommerceOrder {
  return Object.freeze({
    schemaVersion: 1,
    orderId: "ord_server_1",
    caseId: "case_123",
    offer: Object.freeze({
      offerId: "buyer_precheck",
      offerVersion: "v1",
      label: "Buyer Pre-Check",
      amountMinor: 1900,
      currency: "USD",
    }),
    state: "pending",
    provider: null,
    version: 1,
    eventCount: 0,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    refundReasonCode: null,
    ...overrides,
  }) as CommerceOrder;
}

test("launch offers are server-priced and immutable snapshots", () => {
  const offers = listLaunchOffers();
  assert.equal(offers.length, 5);

  const precheck = getLaunchOffer("buyer_precheck");
  assert.equal(precheck.amountMinor, 1900);
  assert.equal(precheck.currency, "USD");

  const full = getLaunchOffer("buyer_check_full");
  assert.equal(full.amountMinor, 3900);

  const featured = getLaunchOffer("featured_clearsale_listing");
  assert.equal(featured.amountMinor, 1500);

  const review = getLaunchOffer("human_pro_review");
  assert.equal(review.amountMinor, 9900);

  for (const offer of offers) {
    assert.ok(offer.amountMinor > 0);
    assert.match(offer.currency, /^[A-Z]{3}$/);
    assert.equal(Object.isFrozen(offer), true);
  }
});

test("unknown or client-priced offers are rejected", () => {
  assert.throws(
    () => getLaunchOffer("free_tier"),
    (error: unknown) => error instanceof CommerceContractError && error.code === "invalid_order_input",
  );
  assert.throws(
    () => getLaunchOffer(undefined),
    (error: unknown) => error instanceof CommerceContractError && error.code === "invalid_order_input",
  );
  assert.throws(
    () => getLaunchOffer({ offerId: "buyer_precheck", amountMinor: 1 }),
    (error: unknown) => error instanceof CommerceContractError && error.code === "invalid_order_input",
  );
});

test("receipt exposes only safe order fields", () => {
  const receipt = toCommerceReceipt(baseOrder());

  assert.equal(receipt.orderId, "ord_server_1");
  assert.equal(receipt.caseId, "case_123");
  assert.equal(receipt.state, "pending");
  assert.equal(receipt.providerOrderReference, null);
  assert.equal(receipt.entitledHint, "not_entitled");

  const keys = Object.keys(receipt).sort();
  assert.deepEqual(keys, [
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
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.offer), true);
});

test("receipt entitlement hint follows verified state only", () => {
  const verified = toCommerceReceipt(
    baseOrder({
      state: "verified",
      provider: Object.freeze({
        adapterId: "stripe_adapter",
        provider: "stripe",
        providerOrderReference: "pi_123",
      }),
    }),
  );
  assert.equal(verified.entitledHint, "fulfillment_eligible");
  assert.equal(verified.providerOrderReference, "pi_123");

  for (const state of ["pending", "failed", "refund_required", "refunded"] as const) {
    assert.equal(toCommerceReceipt(baseOrder({ state })).entitledHint, "not_entitled");
  }
});
