import assert from "node:assert/strict";
import test from "node:test";
import { buildBuyerEvidenceDraft, type BuyerEvidenceDraftFields } from "./buyerEvidenceDraft";

const baseFields: BuyerEvidenceDraftFields = {
  year: "2014",
  make: "Ford",
  model: "Focus",
  vin: "1HGCM82633A004352",
  mileage: "142500",
  askingPrice: "4800",
  listingUrl: "https://example.com/listing/123",
  sellerClaims: "No accidents\nNew transmission",
  buyerObservations: "ABS light is on\nSteering wheel shakes",
  obdCodes: "p0300, P0420",
};

test("keeps unverified seller claims separate from buyer observations", () => {
  const result = buildBuyerEvidenceDraft(baseFields);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.mode, "buy");
  assert.deepEqual(result.data.situation.sellerClaims, ["No accidents", "New transmission"]);
  assert.deepEqual(result.data.situation.buyerObservations, ["ABS light is on", "Steering wheel shakes"]);
  assert.deepEqual(result.data.obd.codes, ["P0300", "P0420"]);
});

test("rejects an incomplete VIN instead of treating it as verified identity", () => {
  const result = buildBuyerEvidenceDraft({ ...baseFields, vin: "ABC123" });
  assert.equal(result.success, false);
});

test("rejects malformed manual OBD codes", () => {
  const result = buildBuyerEvidenceDraft({ ...baseFields, obdCodes: "P0300 not-a-code" });
  assert.equal(result.success, false);
});

test("allows optional buyer fields to remain blank", () => {
  const result = buildBuyerEvidenceDraft({
    ...baseFields,
    vin: "",
    mileage: "",
    askingPrice: "",
    listingUrl: "",
    sellerClaims: "",
    buyerObservations: "",
    obdCodes: "",
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.vehicle.vin, undefined);
  assert.deepEqual(result.data.situation.sellerClaims, []);
  assert.deepEqual(result.data.situation.buyerObservations, []);
});
