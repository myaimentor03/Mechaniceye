import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");
const decision = source("client/src/components/CustomerDecisionPathPreview.tsx");
const clearsale = source("client/src/components/ClearSalePreview.tsx");
const buyer = source("client/src/components/BuyerCheckPreview.tsx");
const buyerRisk = source("client/src/components/BuyerRiskReviewPreview.tsx");
const repairVsSell = source("client/src/components/RepairVsSellPreview.tsx");

test("decision preview route stays wired for FIX / SELL / MONITOR / STOP DRIVING", () => {
  assert.match(backend, /routePath === "\/decision-path-preview"/);
  assert.match(backend, /CustomerDecisionPathPreview/);
});

test("STOP DRIVING safety boundary is never a clearance to drive", () => {
  assert.match(decision, /Stop now \/ do not drive/);
  assert.match(decision, /Do not use Drivable as a safety clearance/);
  assert.match(decision, /Drivable cannot certify that a vehicle is safe/);
});

test("FIX path routes to professional repair, never DIY for safety issues", () => {
  assert.match(decision, /Repair professionally/);
  assert.match(decision, /A shop should inspect and confirm the issue before parts are replaced/);
  assert.match(decision, /Drivable should not push unsafe repairs/);
  assert.match(backend, /routePath === "\/mechanic-match"/);
});

test("SELL path routes to ClearSale seller intake with no-guarantee boundary", () => {
  assert.match(backend, /routePath === "\/clearsale"/);
  assert.match(clearsale, /Start seller intake/);
  assert.match(clearsale, /\/marketplace\/sell\/intake/);
  assert.match(clearsale, /ClearSale does not guarantee sale price, buyer interest, title status, legal compliance, or vehicle condition/);
});

test("MONITOR path exists alongside repair/sell/stop-spending in repair-vs-sell", () => {
  assert.match(repairVsSell, /Repair path/);
  assert.match(repairVsSell, /Sell\/list as-is path/);
  assert.match(repairVsSell, /Wait\/monitor path/);
  assert.match(repairVsSell, /Stop-spending \/ walk-away path/);
  assert.match(repairVsSell, /Drivable does not guarantee sale price, repair result, buyer interest, legal\/title/);
});

test("Buyer Check route exposes walk-away signals and inspection boundary", () => {
  assert.match(backend, /routePath === "\/buyer-check"/);
  assert.match(buyer, /Signals that it may be time to walk away/);
  assert.match(buyer, /Buyer Check is not a certified inspection, title verification, guarantee of vehicle condition, or legal advice/);
});

test("Buyer Check BUY / NEGOTIATE / WALK AWAY framing stays evidence-first", () => {
  assert.match(buyerRisk, /inspecting, negotiating, or walking away/);
  assert.match(buyerRisk, /Walk-away signals/);
  assert.match(buyerRisk, /request proof/);
  assert.match(buyerRisk, /before spending time or money chasing the vehicle/);
  assert.match(buyerRisk, /This is not a substitute for an in-person inspection/);
  assert.match(buyerRisk, /Drivable does not verify ownership/);
});

test("Buyer evidence draft stays local until submitted — no silent persistence", () => {
  assert.match(buyer, /This structured draft exists only in this browser session/);
  assert.match(buyer, /It has not been submitted/);
  assert.match(buyer, /persisted, visually analyzed, or verified/);
});

test("Seller claims are recorded as unverified, buyer observations as observed-only", () => {
  assert.match(buyer, /Recorded as unverified seller statements, never as observed facts/);
  assert.match(buyer, /Include only what you personally saw, heard, or verified/);
});

test("Decision, ClearSale, and Buyer previews keep a forward next action", () => {
  assert.match(decision, /primaryLabel="Choose my situation"/);
  assert.match(decision, /primaryHref="\/start"/);
  assert.match(clearsale, /primaryLabel="Start seller intake"/);
  assert.match(clearsale, /primaryHref="\/marketplace\/sell\/intake"/);
  assert.match(buyer, /primaryLabel="Open buyer risk review"/);
  assert.match(buyer, /primaryHref="\/buyer-risk-preview"/);
  assert.match(buyerRisk, /primaryLabel="Choose a buyer path"/);
});

test("Decision-adjacent previews never include payment or checkout fields", () => {
  for (const [name, text] of [["decision", decision], ["clearsale", clearsale], ["buyer", buyer], ["buyerRisk", buyerRisk], ["repairVsSell", repairVsSell]]) {
    assert.doesNotMatch(text, /stripe/i, `${name} must not reference stripe`);
    assert.doesNotMatch(text, /checkout/i, `${name} must not reference checkout`);
    assert.doesNotMatch(text, /card number/i, `${name} must not collect card details`);
  }
});
