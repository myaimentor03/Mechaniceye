import assert from "node:assert/strict";
import test from "node:test";
import {
  DeliveryReceiptRepositoryError,
  PostgresDeliveryReceiptRepository,
  type DeliveryReceiptSqlExecutor,
} from "./postgres-delivery-receipt.js";

const NOW = "2026-10-15T12:00:00.000Z";
const input = Object.freeze({
  jobId: "job_receipt_1",
  caseId: "case_receipt_1",
  resourceVersion: "review_version_1",
  destinationKey: "journey-approved-result",
  provider: "email_provider",
  providerReference: "message_123",
  confirmedAt: NOW,
});

function stored(overrides: Record<string, unknown> = {}) {
  return {
    receipt_id: "receipt_1", job_id: input.jobId, case_id: input.caseId,
    resource_version: input.resourceVersion, destination_key: input.destinationKey,
    provider: input.provider, provider_reference: input.providerReference,
    confirmed_at: NOW, created_at: NOW, ...overrides,
  };
}

test("inserts and returns a durable provider receipt", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  const executor: DeliveryReceiptSqlExecutor = {
    async query(text, values) { calls.push({ text, values }); return { rows: [stored()] }; },
  };
  const receipt = await new PostgresDeliveryReceiptRepository(executor).record(input);
  assert.equal(receipt.jobId, input.jobId);
  assert.equal(receipt.providerReference, input.providerReference);
  assert.match(calls[0].text, /on conflict \(job_id\) do nothing/i);
  assert.equal(calls[0].values?.includes(input.providerReference), true);
});

test("an exact retry returns the existing receipt without creating another proof", async () => {
  let call = 0;
  const executor: DeliveryReceiptSqlExecutor = {
    async query() { call += 1; return { rows: call === 1 ? [] : [stored()] }; },
  };
  const receipt = await new PostgresDeliveryReceiptRepository(executor).record(input);
  assert.equal(receipt.receiptId, "receipt_1");
  assert.equal(call, 2);
});

test("a reused job id with different provider proof fails closed", async () => {
  let call = 0;
  const executor: DeliveryReceiptSqlExecutor = {
    async query() { call += 1; return { rows: call === 1 ? [] : [stored({ provider_reference: "different_message" })] }; },
  };
  await assert.rejects(new PostgresDeliveryReceiptRepository(executor).record(input),
    (error: unknown) => error instanceof DeliveryReceiptRepositoryError && error.code === "idempotency_conflict");
});

test("invalid identifiers and corrupt stored receipts fail closed", async () => {
  const executor: DeliveryReceiptSqlExecutor = {
    query: async () => ({ rows: [stored({ confirmed_at: "not-a-date" })] }),
  };
  const repository = new PostgresDeliveryReceiptRepository(executor);
  await assert.rejects(repository.record({ ...input, providerReference: "contains spaces" }),
    (error: unknown) => error instanceof DeliveryReceiptRepositoryError && error.code === "invalid_input");
  await assert.rejects(repository.getByJobId(input.jobId),
    (error: unknown) => error instanceof DeliveryReceiptRepositoryError && error.code === "corrupt_record");
});
