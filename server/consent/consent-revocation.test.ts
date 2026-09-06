import assert from "node:assert/strict";
import test from "node:test";
import { ConsentPurpose } from "../../shared/consent/index.js";
import { IntakeConsentError, persistAndAuthorizeIntakeConsent, recordConsentRevocation } from "./intake-consent.js";

const env = { DRIVABLE_CONSENT_VERSION: "c1", DRIVABLE_PRIVACY_VERSION: "p1", DRIVABLE_TERMS_VERSION: "t1" };
const subject = { actorId: "user_1", accountId: "user_1", caseId: "CASE-1" };

async function makeRepository() {
  const events: any[] = [];
  const repository = {
    async append(event: any) { events.push(event); return event; },
    async listForSubject() { return [...events]; },
  };
  await persistAndAuthorizeIntakeConsent(
    repository,
    { ...subject, hasMedia: true, choices: { service_fulfillment: true, media_processing: true, human_review_sharing: true, optional_product_learning: true } },
    env,
    { now: () => new Date("2026-09-02T00:00:00Z"), generateId: () => "id_accept" },
  );
  return repository;
}

test("revocation links to the latest acceptance and revokes granted purposes", async () => {
  const repository = await makeRepository();
  const event: any = await recordConsentRevocation(repository, subject, env,
    { now: () => new Date("2026-09-03T00:00:00Z"), generateId: () => "id_revoke" });
  assert.equal(event.kind, "consent.revoked");
  assert.equal(event.acceptanceEventId, "consent_id_accept");
  assert.equal(event.purposes.includes(ConsentPurpose.MediaProcessing), true);
  assert.equal(event.purposes.includes(ConsentPurpose.OptionalProductLearning), true);
});

test("revocation rejects purposes that were never granted", async () => {
  const repository = await makeRepository();
  await assert.rejects(
    recordConsentRevocation(repository, { ...subject, purposes: ["optional_product_learning", "made_up_purpose"] }, env),
    (error) => error instanceof IntakeConsentError && error.code === "INVALID_PURPOSES",
  );
});

test("revocation without an existing acceptance fails closed", async () => {
  const repository = { async append() { throw new Error("should not persist"); }, async listForSubject() { return []; } };
  await assert.rejects(
    recordConsentRevocation(repository, subject, env),
    (error) => error instanceof IntakeConsentError && error.code === "NO_ACCEPTANCE",
  );
});

test("storage failure during revocation never surfaces internals", async () => {
  const seeded: any[] = [];
  await persistAndAuthorizeIntakeConsent(
    { async append(event: any) { seeded.push(event); return event; } },
    { ...subject, hasMedia: true, choices: { service_fulfillment: true, media_processing: true, human_review_sharing: true, optional_product_learning: true } },
    env,
    { now: () => new Date("2026-09-02T00:00:00Z"), generateId: () => "id_accept" },
  );
  const repository = {
    async append() { throw new Error("database password plaintext"); },
    async listForSubject() { return [...seeded]; },
  };
  await assert.rejects(recordConsentRevocation(repository, subject, env),
    (error) => error instanceof IntakeConsentError && error.code === "CONSENT_PERSISTENCE_FAILED" && !error.message.includes("password"));
});