import assert from "node:assert/strict";
import test from "node:test";
import { ConsentPurpose, createConsentAcceptedEvent, createConsentRevokedEvent } from "../../shared/consent/index.js";
import { ConsentRepositoryError, PostgresConsentRepository, type ConsentSqlExecutor } from "./postgres-consent-repository.js";

const subject = { actorId: "user_1", accountId: "account_1", caseId: "case_1" };
const accepted = createConsentAcceptedEvent({
  ...subject,
  eventId: "consent_1",
  acceptedAt: "2026-08-24T00:00:00.000Z",
  consentVersion: "consent-v1",
  privacyNoticeVersion: "privacy-v1",
  termsVersion: "terms-v1",
  affirmativeChoices: {
    [ConsentPurpose.ServiceFulfillment]: true,
    [ConsentPurpose.MediaProcessing]: true,
    [ConsentPurpose.HumanReviewSharing]: true,
  },
});
const revoked = createConsentRevokedEvent({
  ...subject,
  eventId: "revocation_1",
  acceptanceEventId: accepted.eventId,
  revokedAt: "2026-08-25T00:00:00.000Z",
  purposes: [ConsentPurpose.MediaProcessing],
});

class FakeExecutor implements ConsentSqlExecutor {
  rows: Array<{ event_payload: unknown }> = [];
  calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  failure: unknown;

  async query<Row>(text: string, values?: readonly unknown[]) {
    this.calls.push({ text, values });
    if (this.failure) throw this.failure;
    if (text.includes("insert into")) this.rows.push({ event_payload: JSON.parse(String(values?.[8])) });
    return { rows: (text.includes("select event_payload") ? this.rows : []) as Row[] };
  }
}

test("persists canonical events and loads a case-bound append-only history", async () => {
  const executor = new FakeExecutor();
  const repository = new PostgresConsentRepository(executor);
  assert.equal(repository.capabilities.durable, true);
  await repository.append(accepted);
  await repository.append(revoked);
  const events = await repository.listForSubject(subject);
  assert.deepEqual(events, [accepted, revoked]);
  assert.deepEqual(executor.calls.at(-1)?.values, [subject.actorId, subject.accountId, subject.caseId]);
});

test("maps database conflicts and outages without exposing database messages", async () => {
  const executor = new FakeExecutor();
  const repository = new PostgresConsentRepository(executor);
  executor.failure = Object.assign(new Error("secret database details"), { code: "23505" });
  await assert.rejects(repository.append(accepted), (error) =>
    error instanceof ConsentRepositoryError && error.code === "conflict" && !error.message.includes("secret"));
  executor.failure = new Error("postgres://user:password@private-host/db");
  await assert.rejects(repository.listForSubject(subject), (error) =>
    error instanceof ConsentRepositoryError && error.code === "storage_unavailable" && error.retryable);
});

test("fails closed on corrupt stored history", async () => {
  const executor = new FakeExecutor();
  executor.rows = [{ event_payload: { kind: "consent.accepted", actorId: "wrong" } }];
  const repository = new PostgresConsentRepository(executor);
  await assert.rejects(repository.listForSubject(subject), (error) =>
    error instanceof ConsentRepositoryError && error.code === "corrupt_record");
});
