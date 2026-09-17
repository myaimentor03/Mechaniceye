import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const marketplace = source("client/src/marketplace/Marketplace.tsx");

test("marketplace seller intake uses AbortController with timeout for mobile resilience", () => {
  assert.match(marketplace, /SellerIntakePage/);
  const sellerPageStart = marketplace.indexOf("function SellerIntakePage");
  assert.ok(sellerPageStart !== -1);
  const sellerPage = marketplace.slice(sellerPageStart, sellerPageStart + 8000);
  assert.match(sellerPage, /const controller = new AbortController\(\)/);
  assert.match(sellerPage, /window\.setTimeout\(\(\) => controller\.abort\(\),/);
  assert.match(sellerPage, /signal: controller\.signal/);
  assert.match(sellerPage, /window\.clearTimeout\(timeoutId\)/);
});

test("marketplace seller intake generates and uses clientRequestId for idempotency", () => {
  const sellerPageStart = marketplace.indexOf("function SellerIntakePage");
  const sellerPage = marketplace.slice(sellerPageStart, sellerPageStart + 8000);
  assert.match(sellerPage, /clientRequestId/);
  assert.match(sellerPage, /drivable-client-request-id/);
  assert.match(sellerPage, /sessionStorage\.getItem\(/);
  assert.match(sellerPage, /sessionStorage\.setItem\(/);
});

test("marketplace seller intake persists case ID to sessionStorage on success", () => {
  const sellerPageStart = marketplace.indexOf("function SellerIntakePage");
  const sellerPage = marketplace.slice(sellerPageStart, sellerPageStart + 8000);
  assert.match(sellerPage, /sessionStorage\.setItem\("drivable-last-case-id"/);
  assert.doesNotMatch(sellerPage, /localStorage\.setItem\("drivable-last-case-id"/);
});

test("marketplace seller intake handles 401 with re-auth prompt", () => {
  const sellerPageStart = marketplace.indexOf("function SellerIntakePage");
  const sellerPage = marketplace.slice(sellerPageStart, sellerPageStart + 8000);
  assert.match(sellerPage, /if \(response\.status === 401\)/);
  assert.match(sellerPage, /Your session expired/);
});

test("marketplace seller intake handles 429 rate-limit with Retry-After", () => {
  const sellerPageStart = marketplace.indexOf("function SellerIntakePage");
  const sellerPage = marketplace.slice(sellerPageStart, sellerPageStart + 8000);
  assert.match(sellerPage, /if \(response\.status === 429\)/);
  assert.match(sellerPage, /response\.headers\.get\("Retry-After"\)/);
  assert.match(sellerPage, /Too many requests/);
});

test("marketplace seller intake surfaces server error message before fallback", () => {
  const sellerPageStart = marketplace.indexOf("function SellerIntakePage");
  const sellerPage = marketplace.slice(sellerPageStart, sellerPageStart + 8000);
  assert.match(sellerPage, /const errorText = await response\.text\(\)/);
  assert.match(sellerPage, /JSON\.parse\(errorText\)/);
  assert.match(sellerPage, /serverMsg/);
});

test("marketplace seller intake preserves form state on error for mobile retry", () => {
  const sellerPageStart = marketplace.indexOf("function SellerIntakePage");
  const sellerPage = marketplace.slice(sellerPageStart, sellerPageStart + 8000);
  // Form state should not be reset on error
  assert.doesNotMatch(sellerPage, /if \(response\.status === 429\)[\s\S]*?form\.reset\(\)/);
  assert.doesNotMatch(sellerPage, /catch.*form\.reset\(\)/);
});

test("marketplace buyer interest uses AbortController with timeout for mobile resilience", () => {
  const buyerPageStart = marketplace.indexOf("function BuyerInterestPage");
  assert.ok(buyerPageStart !== -1);
  const buyerPage = marketplace.slice(buyerPageStart, buyerPageStart + 8000);
  assert.match(buyerPage, /const controller = new AbortController\(\)/);
  assert.match(buyerPage, /window\.setTimeout\(\(\) => controller\.abort\(\),/);
  assert.match(buyerPage, /signal: controller\.signal/);
  assert.match(buyerPage, /window\.clearTimeout\(timeoutId\)/);
});

test("marketplace buyer interest generates and uses clientRequestId for idempotency", () => {
  const buyerPageStart = marketplace.indexOf("function BuyerInterestPage");
  const buyerPage = marketplace.slice(buyerPageStart, buyerPageStart + 5000);
  assert.match(buyerPage, /clientRequestId/);
  assert.match(buyerPage, /drivable-client-request-id/);
  assert.match(buyerPage, /sessionStorage\.getItem\(/);
  assert.match(buyerPage, /sessionStorage\.setItem\(/);
});

test("marketplace buyer interest persists case ID to sessionStorage on success", () => {
  const buyerPageStart = marketplace.indexOf("function BuyerInterestPage");
  const buyerPage = marketplace.slice(buyerPageStart, buyerPageStart + 10000);
  assert.match(buyerPage, /sessionStorage\.setItem\("drivable-last-case-id"/);
  assert.doesNotMatch(buyerPage, /localStorage\.setItem\("drivable-last-case-id"/);
});

test("marketplace buyer interest handles 401 with re-auth prompt", () => {
  const buyerPageStart = marketplace.indexOf("function BuyerInterestPage");
  const buyerPage = marketplace.slice(buyerPageStart, buyerPageStart + 5000);
  assert.match(buyerPage, /if \(response\.status === 401\)/);
  assert.match(buyerPage, /Your session expired/);
});

test("marketplace buyer interest handles 429 rate-limit with Retry-After", () => {
  const buyerPageStart = marketplace.indexOf("function BuyerInterestPage");
  const buyerPage = marketplace.slice(buyerPageStart, buyerPageStart + 5000);
  assert.match(buyerPage, /if \(response\.status === 429\)/);
  assert.match(buyerPage, /response\.headers\.get\("Retry-After"\)/);
  assert.match(buyerPage, /Too many requests/);
});

test("marketplace buyer interest surfaces server error message before fallback", () => {
  const buyerPageStart = marketplace.indexOf("function BuyerInterestPage");
  const buyerPage = marketplace.slice(buyerPageStart, buyerPageStart + 5000);
  assert.match(buyerPage, /const errorText = await response\.text\(\)/);
  assert.match(buyerPage, /JSON\.parse\(errorText\)/);
  assert.match(buyerPage, /serverMsg/);
});

test("marketplace buyer interest preserves form state on error for mobile retry", () => {
  const buyerPageStart = marketplace.indexOf("function BuyerInterestPage");
  const buyerPage = marketplace.slice(buyerPageStart, buyerPageStart + 5000);
  assert.doesNotMatch(buyerPage, /if \(response\.status === 429\)[\s\S]*?form\.reset\(\)/);
  assert.doesNotMatch(buyerPage, /catch.*form\.reset\(\)/);
});

test("both marketplace forms use SUBMISSION_TIMEOUT_MS constant", () => {
  assert.match(marketplace, /SUBMISSION_TIMEOUT_MS = 20000/);
});

test("marketplace buyer interest restores submitted state from sessionStorage on mount", () => {
  const buyerPageStart = marketplace.indexOf("function BuyerInterestPage");
  const buyerPage = marketplace.slice(buyerPageStart, buyerPageStart + 8000);
  assert.match(buyerPage, /useEffect\(/);
  assert.match(buyerPage, /sessionStorage\.getItem\("drivable-last-case-id"\)/);
  assert.match(buyerPage, /setSubmitted\(true\)/);
});

test("marketplace buyer interest displays restored case reference ID", () => {
  const buyerPageStart = marketplace.indexOf("function BuyerInterestPage");
  const buyerPage = marketplace.slice(buyerPageStart, buyerPageStart + 8000);
  assert.match(buyerPage, /restoredCaseId/);
  assert.match(buyerPage, /Interest received/);
  assert.match(buyerPage, /Reference:/);
});

test("marketplace submitted page restores case ID from sessionStorage", () => {
  const submittedPageStart = marketplace.indexOf("function SubmittedPage");
  assert.ok(submittedPageStart !== -1, "SubmittedPage must exist");
  const submittedPage = marketplace.slice(submittedPageStart, submittedPageStart + 3000);
  assert.match(submittedPage, /useEffect\(/);
  assert.match(submittedPage, /sessionStorage\.getItem\("drivable-last-case-id"\)/);
  assert.match(submittedPage, /setRestoredCaseId/);
  assert.match(submittedPage, /Reference:/);
});

test("marketplace pages use sessionStorage (not localStorage) for case ID persistence", () => {
  const submittedPageStart = marketplace.indexOf("function SubmittedPage");
  const submittedPage = marketplace.slice(submittedPageStart, submittedPageStart + 3000);
  assert.doesNotMatch(submittedPage, /localStorage\.setItem\("drivable-last-case-id"/);
  assert.doesNotMatch(submittedPage, /localStorage\.getItem\("drivable-last-case-id"/);
});

function sellerSubmitBlock() {
  const start = marketplace.indexOf("function SellerIntakePage");
  assert.ok(start !== -1, "SellerIntakePage must exist");
  return marketplace.slice(start, start + 10000);
}

function buyerSubmitBlock() {
  const start = marketplace.indexOf("function BuyerInterestPage");
  assert.ok(start !== -1, "BuyerInterestPage must exist");
  return marketplace.slice(start, start + 10000);
}

test("seller intake rotates clientRequestId after successful submission so next case is not collapsed", () => {
  const block = sellerSubmitBlock();
  assert.match(block, /sessionStorage\.setItem\("drivable-last-case-id", data\.id\)/);
  assert.match(block, /drivable-client-request-id/);
  assert.match(block, /sessionStorage\.removeItem\(storageKey\)/);
  assert.match(block, /const nextId = `req-/);
  assert.match(block, /sessionStorage\.setItem\(storageKey, nextId\)/);
  assert.match(block, /setClientRequestId\(nextId\)/);
});

test("seller intake rotation happens after case ID persisted and before navigation", () => {
  const block = sellerSubmitBlock();
  const persistAt = block.indexOf('sessionStorage.setItem("drivable-last-case-id"');
  const rotateAt = block.indexOf('sessionStorage.removeItem(storageKey)');
  assert.ok(persistAt !== -1 && rotateAt !== -1, "anchors must exist");
  assert.ok(persistAt < rotateAt, "rotation must occur after case ID persistence");
  const navigateAt = block.indexOf("navigateFrontend", rotateAt);
  assert.ok(navigateAt !== -1, "navigation after rotation must exist");
  assert.ok(rotateAt < navigateAt, "rotation must occur before navigation");
});

test("seller intake rotation uses try/catch for mobile private mode (QuotaExceeded / blocked storage)", () => {
  const block = sellerSubmitBlock();
  assert.match(block, /try \{\s*const storageKey = "drivable-client-request-id"/);
  assert.match(block, /catch \{\}/);
});

test("buyer interest rotates clientRequestId after successful submission so next case is not collapsed", () => {
  const block = buyerSubmitBlock();
  assert.match(block, /sessionStorage\.setItem\("drivable-last-case-id", data\.id\)/);
  assert.match(block, /drivable-client-request-id/);
  assert.match(block, /sessionStorage\.removeItem\(storageKey\)/);
  assert.match(block, /const nextId = `req-/);
  assert.match(block, /sessionStorage\.setItem\(storageKey, nextId\)/);
  assert.match(block, /setClientRequestId\(nextId\)/);
});

test("buyer interest rotation happens after case ID persisted and before form reset", () => {
  const block = buyerSubmitBlock();
  const persistAt = block.indexOf('sessionStorage.setItem("drivable-last-case-id"');
  const rotateAt = block.indexOf('sessionStorage.removeItem(storageKey)');
  assert.ok(persistAt !== -1 && rotateAt !== -1, "anchors must exist");
  assert.ok(persistAt < rotateAt, "rotation must occur after case ID persistence");
  const resetAt = block.indexOf("form.reset()", rotateAt);
  assert.ok(resetAt !== -1, "form reset after rotation must exist");
  assert.ok(rotateAt < resetAt, "rotation must occur before form reset");
});

test("buyer interest rotation uses try/catch for mobile private mode (QuotaExceeded / blocked storage)", () => {
  const block = buyerSubmitBlock();
  assert.match(block, /try \{\s*const storageKey = "drivable-client-request-id"/);
  assert.match(block, /catch \{\}/);
});