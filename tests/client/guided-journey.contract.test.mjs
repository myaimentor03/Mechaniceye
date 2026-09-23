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

function intakePageBlock() {
  const start = backend.indexOf("function IntakePage");
  assert.ok(start !== -1, "IntakePage must exist");
  return backend.slice(start, start + 14000);
}

test("Guided intake restores case ID from sessionStorage on mount", () => {
  const intake = intakePageBlock();
  assert.match(intake, /useEffect\(/);
  assert.match(intake, /sessionStorage\.getItem\("drivable-last-case-id"\)/);
  assert.match(intake, /setRestoredCaseId/);
});

test("Guided intake displays restored case reference when no active result", () => {
  const intake = intakePageBlock();
  assert.match(intake, /restoredCaseId/);
  assert.match(intake, /Previous Case Reference/);
  assert.match(intake, /Reference:/);
});

test("Guided intake uses sessionStorage (not localStorage) for case ID persistence", () => {
  const intake = intakePageBlock();
  assert.doesNotMatch(intake, /localStorage\.setItem\("drivable-last-case-id"/);
  assert.doesNotMatch(intake, /localStorage\.getItem\("drivable-last-case-id"/);
});

test("Guided intake Previous Case Reference is server-verified, never restored from the raw pointer", () => {
  // Launch blocker (Nov 2 paid beta, P0 #5 resume/status): the shared
  // drivable-last-case-id pointer is not proof of receipt — it can be stale,
  // foreign, or from a signed-out session. IntakePage must verify via
  // GET /api/my-cases/:id before claiming "was received".
  const intake = intakePageBlock();
  assert.match(intake, /fetch\(`\/api\/my-cases\/\$\{encodeURIComponent\(savedCaseId\)\}`/);
  assert.doesNotMatch(intake, /setRestoredCaseId\(savedCaseId\)/);
});

test("Guided intake restore requires a signed-in customer (authChecked && customer gate)", () => {
  // Showing a reference while signed out leaks another session's pointer
  // and fabricates receipt for a customer who never submitted.
  const intake = intakePageBlock();
  assert.match(intake, /if \(!authChecked \|\| !customer\)/);
  assert.match(intake, /\[authChecked, customer\]/);
});

test("Guided intake restore uses AbortController timeout for mobile resilience", () => {
  const intake = intakePageBlock();
  assert.match(intake, /const controller = new AbortController\(\)/);
  assert.match(intake, /window\.setTimeout\(\(\) => controller\.abort\(\), CASE_RECOVERY_TIMEOUT_MS\)/);
  assert.match(intake, /window\.clearTimeout\(timeoutId\)/);
  assert.match(intake, /credentials: "same-origin"/);
});

test("Guided intake restore drops the stale pointer on 404 instead of rendering it forever", () => {
  const intake = intakePageBlock();
  assert.match(intake, /if \(res\.status === 404\)/);
  assert.match(intake, /sessionStorage\.removeItem\("drivable-last-case-id"\)/);
  assert.match(intake, /sessionStorage\.removeItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/);
  assert.match(intake, /setRestoredCaseId\(null\)/);
});

test("Guided intake restore never fabricates receipt on offline/timeout — pointer preserved for retry", () => {
  const intake = intakePageBlock();
  assert.match(intake, /\.catch\(\(\) => \{/);
  const catchAt = intake.indexOf(".catch(() => {");
  assert.ok(catchAt !== -1, "offline catch block must exist");
  const catchBlock = intake.slice(catchAt, catchAt + 400);
  assert.match(catchBlock, /setRestoredCaseId\(null\)/);
  // Fail closed: the offline path must not clear storage (retry needs the
  // pointer) and must not render an unverified reference.
  assert.doesNotMatch(catchBlock, /removeItem/);
  assert.doesNotMatch(catchBlock, /was received/);
});