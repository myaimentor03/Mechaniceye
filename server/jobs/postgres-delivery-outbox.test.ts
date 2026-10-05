import assert from "node:assert/strict";
import test from "node:test";
import { DeliveryOutboxError, type EnqueueDeliveryInput } from "./delivery-outbox.js";
import { PostgresDeliveryOutboxRepository, type DeliveryOutboxSqlExecutor } from "./postgres-delivery-outbox.js";

const input: EnqueueDeliveryInput = {
  caseId: "CASE-123",
  deduplicationKey: "report-ready-v1",
  metadata: { resourceKind: "report", resourceId: "REPORT-456", resourceVersion: "v1", destinationKey: "CUSTOMER-WEBHOOK-1", channel: "webhook" },
  retryPolicy: { maxAttempts: 3, initialRetryDelayMs: 1000, backoffMultiplier: 2, maxRetryDelayMs: 5000, leaseDurationMs: 30000 },
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    job_id: "job_12345678", case_id: input.caseId, deduplication_key: input.deduplicationKey, state: "pending",
    channel: "webhook", resource_kind: "report", resource_id: "REPORT-456", resource_version: "v1",
    destination_key: "CUSTOMER-WEBHOOK-1", attempt_count: 0, replay_count: 0, max_attempts: 3,
    initial_retry_delay_ms: 1000, backoff_multiplier: "2.00", max_retry_delay_ms: 5000, lease_duration_ms: 30000,
    lease_token: null, leased_at: null, lease_expires_at: null, available_at: new Date("2026-01-01T00:00:00.000Z"),
    delivered_at: null, failed_at: null, next_attempt_at: null, dead_lettered_at: null,
    last_failure_code: null, last_failure_retryable: null, last_replayed_at: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"), updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("Postgres outbox enqueue returns the inserted durable job", async () => {
  const statements: string[] = [];
  const executor: DeliveryOutboxSqlExecutor = {
    async query(text) {
      statements.push(text);
      return { rows: text.startsWith("insert") ? [row()] : [] };
    },
    async transaction(work) { return work(this); },
  };
  const outbox = new PostgresDeliveryOutboxRepository(executor);
  const result = await outbox.enqueue(input);
  assert.equal(result.disposition, "created");
  assert.equal(result.job.state, "pending");
  assert.equal(result.job.caseId, input.caseId);
  assert.match(statements[0], /on conflict \(case_id, deduplication_key\) do nothing returning \*/);
});

test("Postgres leasing uses a transaction and SKIP LOCKED to claim one due job", async () => {
  const statements: string[] = [];
  const executor: DeliveryOutboxSqlExecutor = {
    async query(text) { statements.push(text); return { rows: [] }; },
    async transaction(work) {
      return work({
        async query(text) {
          statements.push(text);
          if (text.startsWith("select * from drivable_delivery_outbox")) return { rows: [row({
            state: "pending",
          })] };
          if (text.includes("set state = 'leased'")) return { rows: [row({
            state: "leased", attempt_count: 1, lease_token: "lease_12345678",
            leased_at: new Date("2026-01-01T00:00:00.000Z"), lease_expires_at: new Date("2026-01-01T00:00:30.000Z"),
            available_at: null,
          })] };
          return { rows: [] };
        },
      });
    },
  };
  const leased = await new PostgresDeliveryOutboxRepository(executor).leaseNext({ caseId: input.caseId });
  assert.equal(leased?.state, "leased");
  assert.match(statements[1], /limit 1 for update skip locked/i);
  assert.match(statements[1], /order by coalesce\(available_at, next_attempt_at\)/i);
});

test("Postgres outbox rejects unsafe ids before issuing SQL", async () => {
  let queried = false;
  const executor: DeliveryOutboxSqlExecutor = {
    async query() { queried = true; return { rows: [] }; },
    async transaction(work) { return work(this); },
  };
  const outbox = new PostgresDeliveryOutboxRepository(executor);
  await assert.rejects(outbox.get("bad id", "job_12345678"), (error: unknown) => error instanceof DeliveryOutboxError && error.code === "invalid_input");
  assert.equal(queried, false);
});
