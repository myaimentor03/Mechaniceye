import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const routes = source("server/routes.ts");
const backend = source("client/src/TestBackend.tsx");

// ---------------------------------------------------------------------------
// QA lane (Nov 2 paid beta): server-side consent validation must always run,
// regardless of DRIVABLE_LAUNCH_CONTROLS_ENABLED. These contract tests pin
// the code structure so a future refactor cannot silently remove or gate the
// consent check behind a feature flag.
// ---------------------------------------------------------------------------

const CONSENT_CHECK_PATTERN =
  /Server-side consent validation.*always enforced/i;

test("server: consent validation block exists in routes.ts", () => {
  assert.ok(
    CONSENT_CHECK_PATTERN.test(routes),
    "routes.ts must contain a server-side consent validation block that runs regardless of launch controls",
  );
});

test("server: consent check runs BEFORE the idempotency guard", () => {
  const consentCheckAt = routes.indexOf("// Server-side consent validation");
  assert.ok(consentCheckAt !== -1, "consent validation comment must exist");
  const idempotencyAt = routes.indexOf("// Idempotency: check for existing case");
  assert.ok(idempotencyAt !== -1, "idempotency guard must exist");
  assert.ok(
    consentCheckAt < idempotencyAt,
    "consent validation must run before the idempotency check so unauthorized requests are rejected before any DB lookup",
  );
});

test("server: consent check runs BEFORE the three-way launch-controls branch", () => {
  const consentCheckAt = routes.indexOf("// Server-side consent validation");
  const launchBranchAt = routes.indexOf("const launchControlsEnabled = process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED");
  assert.ok(launchBranchAt !== -1, "launch controls branch must exist");
  assert.ok(
    consentCheckAt < launchBranchAt,
    "consent validation must run before the launch-controls branch so consent is always enforced",
  );
});

test("server: consent check runs BEFORE photo persistence", () => {
  const consentCheckAt = routes.indexOf("// Server-side consent validation");
  const photoPersistAt = routes.indexOf("evidenceStore.savePhotos(");
  assert.ok(photoPersistAt !== -1, "photo persistence must exist");
  assert.ok(
    consentCheckAt < photoPersistAt,
    "consent validation must run before photo persistence so photos are never stored without authorization",
  );
});

test("server: consent validation checks service_fulfillment", () => {
  const consentStart = routes.indexOf("// Server-side consent validation");
  assert.ok(consentStart !== -1);
  const block = routes.slice(consentStart, consentStart + 1200);
  assert.match(block, /service_fulfillment === true/);
});

test("server: consent validation checks human_review_sharing", () => {
  const consentStart = routes.indexOf("// Server-side consent validation");
  const block = routes.slice(consentStart, consentStart + 1200);
  assert.match(block, /human_review_sharing === true/);
});

test("server: consent validation checks media_processing when photos are present", () => {
  const consentStart = routes.indexOf("// Server-side consent validation");
  const block = routes.slice(consentStart, consentStart + 1200);
  assert.match(block, /photoFiles\.length > 0/);
  assert.match(block, /media_processing === true/);
});

test("server: consent rejection returns 400 with clear message", () => {
  const consentStart = routes.indexOf("// Server-side consent validation");
  const block = routes.slice(consentStart, consentStart + 1200);
  assert.match(block, /res\.status\(400\)/);
  assert.match(block, /Consent is required/i);
});

test("server: consent rejection cleans up temp files", () => {
  const consentStart = routes.indexOf("// Server-side consent validation");
  const block = routes.slice(consentStart, consentStart + 1200);
  assert.match(block, /removeIntakeTempFiles\(uploadedFiles\)/);
});

test("server: consent validation is NOT gated by DRIVABLE_LAUNCH_CONTROLS_ENABLED", () => {
  // The consent check must appear BEFORE the launch controls branch, not inside it.
  const consentStart = routes.indexOf("// Server-side consent validation");
  const launchBranchAt = routes.indexOf("const launchControlsEnabled = process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED");
  // Verify the consent check is NOT inside the if (launchControlsEnabled) block
  const launchBlockStart = routes.indexOf("if (launchControlsEnabled)");
  assert.ok(launchBlockStart !== -1);
  assert.ok(
    consentStart < launchBlockStart,
    "consent validation must be outside the launch controls if-block",
  );
});

test("client: TestBackend enforces consent checkboxes before submission", () => {
  assert.match(backend, /!serviceConsent \|\| !humanReviewConsent/);
  assert.match(backend, /photoFiles\.length > 0 && !mediaConsent/);
  assert.match(backend, /Please accept service fulfillment and human review/);
});

test("client: TestBackend sends consent values to the server in FormData", () => {
  assert.match(backend, /requestBody\.append\("consent", JSON\.stringify\(\{/);
  assert.match(backend, /service_fulfillment: serviceConsent/);
  assert.match(backend, /media_processing: mediaConsent/);
  assert.match(backend, /human_review_sharing: humanReviewConsent/);
});
