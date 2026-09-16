import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

test("Guided First Check has two distinct steps with progress indicator", () => {
  assert.match(backend, /step === 1/);
  assert.match(backend, /step === 2/);
  assert.match(backend, /Guided First Check - Step \{step\} of 2/);
  assert.match(backend, /progress-dot.*active/);
});

test("Step 1 collects vehicle identification and contact email", () => {
  assert.match(backend, /<label>Year<\/label>/);
  assert.match(backend, /<label>Make<\/label>/);
  assert.match(backend, /<label>Model<\/label>/);
  assert.match(backend, /<label>Engine<\/label>/);
  assert.match(backend, /<label>Mileage<\/label>/);
  assert.match(backend, /<label>VIN<\/label>/);
  assert.match(backend, /<label>OBD-II Codes<\/label>/);
  assert.match(backend, /<label>Transmission<\/label>/);
  assert.match(backend, /<label>Drivetrain/);
  assert.match(backend, /<label>Email for Follow-Up<\/label>/);
  assert.match(backend, /inputMode="numeric"/);
  assert.match(backend, /autoCapitalize="characters"/);
  assert.match(backend, /maxLength=\{17\}/);
  assert.match(backend, /readOnly required/);
});

test("Step 2 collects symptoms, timing, urgency, evidence, and consent", () => {
  assert.match(backend, /Problem Category.*Required/);
  assert.match(backend, /When Does It Happen/);
  assert.match(backend, /Recent Repairs or Replaced Parts/);
  assert.match(backend, /Urgency \/ Driveability/);
  assert.match(backend, /Diagnostic Evidence/);
  assert.match(backend, /Written Symptoms/);
  assert.match(backend, /Photos/);
  assert.match(backend, /Video upload is not available in this photo-first release/);
  assert.match(backend, /Audio upload is not available in this photo-first release/);
  assert.match(backend, /Vibration/);
  assert.match(backend, /Consent and review permissions/);
  assert.match(backend, /serviceConsent.*Required/);
  assert.match(backend, /humanReviewConsent.*Required/);
  assert.match(backend, /mediaConsent.*Required for photos/);
  assert.match(backend, /learningConsent.*Optional/);
});

test("Step navigation uses Back and Continue buttons, not browser history", () => {
  assert.match(backend, /onClick=\{\(\) => setStep\(2\)\}>Continue to Symptoms/);
  assert.match(backend, /onClick=\{\(\) => setStep\(1\)\}>Back to Vehicle/);
  assert.match(backend, /type="submit".*Submit Drivable Check/);
});

test("Photo picker uses capture=environment for rear camera on mobile", () => {
  assert.match(backend, /capture="environment"/);
  assert.match(backend, /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/);
});

test("Input modes are mobile-optimized", () => {
  assert.match(backend, /inputMode="numeric"/);
  assert.match(backend, /autoCapitalize="characters"/);
  assert.match(backend, /type="email"/);
});

test("Photo-first release blocks unsupported media in guided flow", () => {
  assert.match(backend, /Audio and video upload are not enabled in this photo-first release/);
  assert.match(backend, /Video upload will be available in a future release/);
  assert.match(backend, /Audio upload will be available in a future release/);
  assert.doesNotMatch(backend, /requestBody\.append\("audio"/);
  assert.doesNotMatch(backend, /requestBody\.append\("video"/);
  assert.doesNotMatch(backend, /requestBody\.append\("vibration"/);
});

test("Consent checkboxes are required before submit", () => {
  assert.match(backend, /serviceConsent.*Required/);
  assert.match(backend, /humanReviewConsent.*Required/);
  assert.match(backend, /mediaConsent.*Required for photos/);
  assert.match(backend, /learningConsent.*Optional/);
});

test("Submit button disabled while loading", () => {
  assert.match(backend, /disabled=\{loading\}/);
  assert.match(backend, /loading \? "Submitting\.\.\." : "Submit Drivable Check"/);
});

test("Case ID persisted to sessionStorage on successful submission", () => {
  assert.match(backend, /sessionStorage\.setItem\("drivable-last-case-id", data\.id\)/);
});

test("Safety warning displayed in guided flow", () => {
  assert.match(backend, /Safety first: do not drive, record, crawl under, open hot parts/);
  assert.match(backend, /If there is smoke, fire risk, fuel leak, low oil pressure/);
});

test("Evidence reassurance notes AI does not visually analyze photos", () => {
  assert.match(backend, /Photos are stored as case evidence when persistence succeeds; the current AI path does not visually analyze them/);
});

test("Missing key details warning appears in guided flow", () => {
  assert.match(backend, /Missing key details may delay your review/);
});