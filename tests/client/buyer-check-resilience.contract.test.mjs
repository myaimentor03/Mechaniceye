import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const buyer = source("client/src/components/BuyerCheckPreview.tsx");

function buyerLookupBlock() {
  const start = buyer.indexOf("async function handleVehicleKnowledgeLookup");
  assert.ok(start !== -1, "handleVehicleKnowledgeLookup must exist");
  return buyer.slice(start, start + 3000);
}

test("Buyer Check vehicle knowledge lookup uses AbortController with timeout for mobile resilience", () => {
  const block = buyerLookupBlock();
  assert.match(block, /const controller = new AbortController\(\)/);
  assert.match(block, /window\.setTimeout\(\(\) => controller\.abort\(\),/);
  assert.match(block, /signal: controller\.signal/);
  assert.match(block, /window\.clearTimeout\(timeoutId\)/);
});

test("Buyer Check lookup timeout produces a user-friendly AbortError message", () => {
  const block = buyerLookupBlock();
  assert.match(block, /error\.name === "AbortError"/);
  assert.match(block, /Request timed out after \$/);
  assert.match(block, /seconds\. Please try again/);
});

test("Buyer Check vehicle knowledge lookup is a public endpoint (no auth required)", () => {
  const block = buyerLookupBlock();
  assert.doesNotMatch(block, /response\.status === 401/);
  // Correct: buyer-risk/vehicle-knowledge is a public GET endpoint, no session needed
});

test("Buyer Check vehicle knowledge lookup handles non-OK responses with error message", () => {
  const block = buyerLookupBlock();
  assert.match(block, /if \(!response\.ok\)/);
  assert.match(block, /let message = "Vehicle knowledge lookup failed\."/);
  assert.match(block, /throw new Error\(message\)/);
});

test("Buyer Check vehicle knowledge lookup surfaces server-provided error message before fallback", () => {
  const block = buyerLookupBlock();
  assert.match(block, /await response\.json\(\) as BuyerVehicleKnowledgeResult/);
  assert.match(block, /if \(errData\.message\) message = errData\.message/);
});

test("Buyer Check vehicle knowledge lookup handles empty or unreadable response bodies", () => {
  const block = buyerLookupBlock();
  assert.match(block, /catch \{[\s\S]*\/\/ ignore non-JSON error bodies/);
});

test("Buyer Check vehicle knowledge lookup handles JSON parse failure gracefully", () => {
  const block = buyerLookupBlock();
  assert.match(block, /try \{[\s\S]*await response\.json\(\)/);
  assert.match(block, /catch \{[\s\S]*\/\/ ignore non-JSON error bodies/);
});

test("Buyer Check vehicle knowledge lookup catches errors and sets error state", () => {
  const block = buyerLookupBlock();
  assert.match(block, /catch \(error\) \{/);
  assert.match(block, /setLookupStatus\("error"\)/);
  assert.match(block, /setLookupError/);
});

test("Buyer Check evidence draft stays local until submitted — no silent persistence", () => {
  assert.match(buyer, /This structured draft exists only in this browser session/);
  assert.match(buyer, /It has not been submitted/);
  assert.match(buyer, /persisted, visually analyzed, or verified/);
});

test("Buyer Check evidence draft is built client-side before server lookup", () => {
  const block = buyerLookupBlock();
  assert.match(block, /buildBuyerEvidenceDraft/);
  assert.match(block, /setEvidenceDraft\(parsedEvidence\.data\)/);
});

test("Buyer Check seller claims are recorded as unverified, buyer observations as observed-only", () => {
  assert.match(buyer, /Recorded as unverified seller statements, never as observed facts/);
  assert.match(buyer, /Include only what you personally saw, heard, or verified/);
});

test("Buyer Check form uses inputMode for mobile-optimized keyboards", () => {
  assert.match(buyer, /inputMode="numeric"/);
  assert.match(buyer, /inputMode="decimal"/);
  assert.match(buyer, /type="url"/);
  assert.match(buyer, /autoCapitalize="characters"/);
  assert.match(buyer, /maxLength=\{17\}/);
});

test("Buyer Check VIN input enforces 17-character limit and uppercase", () => {
  assert.match(buyer, /maxLength=\{17\}/);
  assert.match(buyer, /toUpperCase\(\)/);
});

test("Buyer Check mileage and asking price inputs enforce non-negative values", () => {
  assert.match(buyer, /min="0"/);
});

test("Buyer Check OBD-II codes input auto-capitalizes", () => {
  assert.match(buyer, /autoCapitalize="characters"/);
  assert.match(buyer, /toUpperCase\(\)/);
});

test("Buyer Check lookup button disabled while loading", () => {
  assert.match(buyer, /disabled=\{lookupStatus === "loading"\}/);
  assert.match(buyer, /Checking vehicle context\.\.\./);
});

test("Buyer Check evidence draft displays structured summary with counts", () => {
  assert.match(buyer, /buyer-check-evidence-summary/);
  assert.match(buyer, /buyerObservations\.length/);
  assert.match(buyer, /sellerClaims\.length/);
  assert.match(buyer, /obd\.codes\.length/);
});

test("Buyer Check buyer risk review action link is present", () => {
  assert.match(buyer, /Open buyer risk review/);
  assert.match(buyer, /\/buyer-risk-preview/);
});

test("Buyer Check evidence checklist action link is present", () => {
  assert.match(buyer, /Evidence checklist/);
  assert.match(buyer, /\/evidence-checklist/);
});

test("Buyer Check help action link is present", () => {
  assert.match(buyer, /Ask for help/);
  assert.match(buyer, /\/help\?scenario=buying_vehicle/);
});

test("Buyer Check disclaimer states boundaries clearly", () => {
  assert.match(buyer, /Buyer Check is not a certified inspection, title verification, guarantee of vehicle condition, or legal advice/);
});

test("Buyer Check never includes payment or checkout fields (payment safety)", () => {
  assert.doesNotMatch(buyer, /stripe/i);
  assert.doesNotMatch(buyer, /checkout/i);
  assert.doesNotMatch(buyer, /card number/i);
  assert.doesNotMatch(buyer, /FormData[^}]*append\("price"/i);
  assert.doesNotMatch(buyer, /FormData[^}]*append\("payment"/i);
});

test("Buyer Check evidence boundary text is present and accurate", () => {
  assert.match(buyer, /exists only in this browser session/);
  assert.match(buyer, /has not been submitted/);
  assert.match(buyer, /persisted, visually analyzed, or verified/);
});

test("Buyer Check fallback prompts displayed when no pack found", () => {
  assert.match(buyer, /fallbackPrompts/);
  assert.match(buyer, /Use these fallback checks/);
});

test("Buyer Check vehicle knowledge result displays recall and complaint counts", () => {
  assert.match(buyer, /recallCount/);
  assert.match(buyer, /complaintCount/);
  assert.match(buyer, /Recall records/);
  assert.match(buyer, /Complaint records/);
});

test("Buyer Check risk tags are formatted and displayed", () => {
  assert.match(buyer, /formatRiskTag/);
  assert.match(buyer, /riskTags/);
  assert.match(buyer, /buyer-check-pill-list/);
});

test("Buyer Check result sections for questions, evidence requests, and inspection prompts", () => {
  assert.match(buyer, /Questions to ask the seller/);
  assert.match(buyer, /Seller evidence to request/);
  assert.match(buyer, /Inspection prompts/);
});

test("Buyer Check VIN required for applicability indicator", () => {
  assert.match(buyer, /VIN required/);
  assert.match(buyer, /vinRequiredForApplicability/);
});

test("Buyer Check disclaimer in results includes VIN-level confirmation requirement", () => {
  assert.match(buyer, /VIN-level confirmation is required/);
});