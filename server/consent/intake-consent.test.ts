import assert from "node:assert/strict";
import test from "node:test";
import { ConsentPurpose } from "../../shared/consent/index.js";
import { IntakeConsentError, persistAndAuthorizeIntakeConsent } from "./intake-consent.js";

const env = { DRIVABLE_CONSENT_VERSION: "c1", DRIVABLE_PRIVACY_VERSION: "p1", DRIVABLE_TERMS_VERSION: "t1" };
const base = { actorId: "user_1", accountId: "user_1", caseId: "CASE-1", hasMedia: true,
  choices: { service_fulfillment: true, media_processing: true, human_review_sharing: true, optional_product_learning: false } };

test("persists consent before authorizing service, review, and media", async () => {
  const events: any[] = [];
  const result = await persistAndAuthorizeIntakeConsent({ async append(event) { events.push(event); return event; } }, base, env,
    { now: () => new Date("2026-09-02T00:00:00Z"), generateId: () => "id_1" });
  assert.equal(events.length, 1); assert.equal(result.fulfillment.allowed, true);
  assert.equal(result.review.allowed, true); assert.equal(result.media?.allowed, true);
  assert.equal(result.event.affirmativeChoices[ConsentPurpose.OptionalProductLearning], false);
});

test("string booleans and missing required choices fail closed before persistence", async () => {
  let persisted = false; const repository = { async append(event: any) { persisted = true; return event; } };
  await assert.rejects(persistAndAuthorizeIntakeConsent(repository, { ...base, choices: { ...base.choices, media_processing: "false" } }, env),
    (error) => error instanceof IntakeConsentError && error.code === "CONSENT_REQUIRED");
  assert.equal(persisted, false);
});

test("storage failure never authorizes intake", async () => {
  await assert.rejects(persistAndAuthorizeIntakeConsent({ async append() { throw new Error("database secret"); } }, base, env),
    (error) => error instanceof IntakeConsentError && error.code === "CONSENT_PERSISTENCE_FAILED" && !error.message.includes("secret"));
});
