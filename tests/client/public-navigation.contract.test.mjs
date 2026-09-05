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
  assert.match(reviewPage, /Audio and video upload are not enabled/i);
  assert.match(reviewPage, /written, manual symptom context/i);
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

  assert.match(backend, /Photos are stored as case evidence when persistence succeeds/);
  assert.match(backend, /Audio and video upload are not enabled in this photo-first release/);
  assert.match(backend, /No readings are simulated or inferred/);
});
