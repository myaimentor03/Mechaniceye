import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");
const marketplace = source("client/src/marketplace/Marketplace.tsx");
const navigation = source("client/src/components/PublicHeaderNavigation.tsx");
const reviewPage = source("client/src/components/MechanicsEyeReviewPage.tsx");
const caseHistoryPage = source("client/src/components/CustomerCaseHistoryPage.tsx");
const appHeader = source("client/src/components/app-header.tsx");
const css = source("client/src/app.css");

test("both public headers use one review route that is distinct from legal pages", () => {
  assert.match(navigation, /PUBLIC_REVIEW_PATH\s*=\s*"\/mechanics-eye-review"/);
  assert.match(backend, /routePath === "\/mechanics-eye-review"/);
  assert.match(marketplace, /Mechanic's Eye Review", href: PUBLIC_REVIEW_PATH/);
  assert.doesNotMatch(backend, /setPage\("disclaimer"\)[^\n]*Mechanic/);
  assert.doesNotMatch(marketplace, /marketplace\/terms[^\n]*Mechanic's Eye Review/);
});

test("review page states the current evidence and safety boundaries", () => {
  assert.match(reviewPage, /not visually analyzed by the current AI path/i);
  assert.match(reviewPage, /private hosted storage passes launch verification/i);
  assert.match(reviewPage, /persisted as case\s*evidence when storage succeeds/i);
  assert.match(reviewPage, /not a confirmed\s*\n?\s*diagnosis, safety clearance, vehicle-condition certification, or certified inspection/i);
});

test("shared mobile menu exposes state and restores focus on Escape", () => {
  assert.match(navigation, /aria-expanded=\{open\}/);
  assert.match(navigation, /aria-controls=\{menuId\}/);
  assert.match(navigation, /event\.key !== "Escape"/);
  assert.match(navigation, /triggerRef\.current\?\.focus\(\)/);
  assert.match(navigation, /onClick=\{closeMenu\}/);
  assert.match(css, /\.public-nav\s*\{\s*display:\s*none;/s);
  assert.match(css, /\.public-nav\.is-open\s*\{\s*display:\s*grid;/s);
  assert.match(css, /min-height:\s*44px/);
});

test("consent legal links open separately without replacing the active intake", () => {
  assert.match(backend, /href="\/terms" target="_blank" rel="noopener noreferrer"/);
  assert.match(backend, /href="\/privacy" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(backend, /Review the <button type="button" onClick=\{\(\) => setPage\("terms"\)\}/);
  assert.doesNotMatch(backend, /<button type="button" onClick=\{\(\) => setPage\("privacy"\)\}>Privacy Notice/);
});

test("case results route customers to Help with the case ID and do not promise follow-up uploads", () => {
  assert.match(backend, /relatedCaseId=\$\{encodeURIComponent\(result\.id\)\}/);
  assert.match(backend, /initialCaseId = searchParams\.get\("relatedCaseId"\)/);
  assert.match(backend, /name="relatedCaseId" defaultValue=\{initialCaseId\}/);
  assert.match(backend, /new files are not added to this case through the Help form/i);
  assert.doesNotMatch(backend, /add evidence later via follow-up/i);
});

test("saved-case history has a reachable owner-authenticated detail route", () => {
  assert.match(backend, /routePath\.startsWith\("\/my-cases\/"\)/);
  assert.match(backend, /<CustomerCaseDetailPage caseId=\{decodeURIComponent\(encodedCaseId\)\}/);
  assert.match(caseHistoryPage, /href=\{`\/my-cases\/\$\{encodeURIComponent\(item\.id\)\}`\}/);
  assert.match(caseHistoryPage, /fetch\(`\/api\/diagnoses\/\$\{encodeURIComponent\(caseId\)\}`/);
  assert.match(caseHistoryPage, /not a diagnosis, safety clearance, or confirmation that a human review is complete/i);
  assert.match(appHeader, /href="\/my-cases"/);
  assert.doesNotMatch(appHeader, /<div className="hidden md:flex[^>]*>[\s\S]*href="\/my-cases"/);
});

test("active customer copy does not imply unavailable or unperformed media analysis", () => {
  for (const unsupported of [
    "Photos, audio, video, and vibration inputs",
    "sounds, photos, video, and more",
    "all help paint a better diagnostic picture",
    "Uploaded media may be reviewed to support diagnosis",
    "Upload the same kind of evidence a mechanic would ask for: photos, video, sound",
  ]) {
    assert.equal(backend.includes(unsupported), false, unsupported);
  }

  assert.match(backend, /Photos, audio, video, and vibration data are stored as case evidence when persistence succeeds/);
  assert.match(backend, /the current AI path does not analyze uploaded media/);
  assert.match(backend, /not analyzed automatically/);
});
