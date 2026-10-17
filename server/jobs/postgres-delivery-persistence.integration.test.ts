import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { mutationTargetGuard, verifyConnectedDatabaseTarget } from "../../scripts/lib/db-target-safe.mjs";
import { PgLaunchControlExecutor } from "../review/postgres-adapter.js";
import { PostgresDeliveryOutboxRepository } from "./postgres-delivery-outbox.js";
import { PostgresDeliveryReceiptRepository } from "./postgres-delivery-receipt.js";

const candidateUrl = process.env.DRIVABLE_ALLOW_COMMERCE_TEST_SCHEMA_SETUP === "true"
  ? process.env.DRIVABLE_COMMERCE_TEST_DATABASE_URL : undefined;
const testUrl = candidateUrl && mutationTargetGuard(candidateUrl).ok ? candidateUrl : undefined;

test("Postgres: delivery outbox leases, retries, ACK rollback, receipt replay, and restart persist", {
  skip: !testUrl ? "Explicit disposable Postgres URL and schema-setup opt-in are unavailable" : false,
}, async () => {
  const schema = `delivery_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: testUrl });
  let pool: pg.Pool | undefined;
  let targetVerified = false;
  try {
    await verifyConnectedDatabaseTarget(admin);
    targetVerified = true;
    await admin.query(`create schema ${schema}`);
    const open = () => new pg.Pool({ connectionString: testUrl, options: `-c search_path=${schema}` });
    pool = open();
    await verifyConnectedDatabaseTarget(pool);
    for (const migration of [
      "../../migrations/0004_drivable_delivery_outbox.sql",
      "../../migrations/0008_drivable_delivery_outbox_runtime.sql",
      "../../migrations/0009_drivable_delivery_receipts.sql",
      "../../migrations/0010_delivery_receipt_provider_acceptance.sql",
    ]) {
      await pool.query(await readFile(new URL(migration, import.meta.url), "utf8"));
    }

    const executor = new PgLaunchControlExecutor(pool);
    let outbox = new PostgresDeliveryOutboxRepository(executor);
    let receipts = new PostgresDeliveryReceiptRepository(executor);
    const caseId = `CASE-${randomUUID()}`;
    const input = {
      caseId,
      deduplicationKey: "paid-result-v1",
      metadata: { resourceKind: "report" as const, resourceId: `REPORT-${randomUUID()}`,
        resourceVersion: "v1", destinationKey: "customer-email-v1", channel: "email_workflow" as const },
      retryPolicy: { maxAttempts: 3, initialRetryDelayMs: 0, backoffMultiplier: 1,
        maxRetryDelayMs: 0, leaseDurationMs: 30_000 },
    };
    const [first, duplicate] = await Promise.all([outbox.enqueue(input), outbox.enqueue(input)]);
    assert.equal(first.disposition, "created");
    assert.equal(duplicate.disposition, "duplicate");
    assert.equal(duplicate.job.jobId, first.job.jobId);
    await assert.rejects(outbox.enqueue({ ...input,
      metadata: { ...input.metadata, resourceVersion: "v2" } }), (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "idempotency_conflict");

    const [leaseA, leaseB] = await Promise.all([
      outbox.leaseNext({ caseId }), outbox.leaseNext({ caseId }),
    ]);
    assert.equal(Number(leaseA !== null) + Number(leaseB !== null), 1, "only one concurrent worker may claim the job");
    const lease = leaseA ?? leaseB!;
    const failed = await outbox.nack({ caseId, jobId: lease.jobId, leaseToken: lease.lease.token,
      failure: { code: "provider_timeout", retryable: true } });
    assert.equal(failed.state, "failed");

    await pool.end();
    pool = open();
    await verifyConnectedDatabaseTarget(pool);
    const restartedExecutor = new PgLaunchControlExecutor(pool);
    outbox = new PostgresDeliveryOutboxRepository(restartedExecutor);
    receipts = new PostgresDeliveryReceiptRepository(restartedExecutor);
    assert.equal((await outbox.get(caseId, first.job.jobId))?.state, "failed");
    const retry = await outbox.leaseNext({ caseId });
    assert.ok(retry);
    assert.equal(retry.attemptCount, 2);

    await pool.query(`create function reject_delivery_ack() returns trigger language plpgsql as $$
      begin if new.state = 'delivered' then raise exception 'rollback probe'; end if; return new; end $$`);
    await pool.query(`create trigger reject_delivery_ack before update on drivable_delivery_outbox
      for each row execute function reject_delivery_ack()`);
    await assert.rejects(outbox.ack({ caseId, jobId: retry.jobId, leaseToken: retry.lease.token }));
    assert.equal((await outbox.get(caseId, retry.jobId))?.state, "leased", "failed ACK transaction must roll back");
    await pool.query("drop trigger reject_delivery_ack on drivable_delivery_outbox");
    const ack = await outbox.ack({ caseId, jobId: retry.jobId, leaseToken: retry.lease.token });
    assert.equal(ack.disposition, "delivered");
    const receiptInput = { jobId: retry.jobId, caseId, resourceVersion: "v1", destinationKey: "customer-email-v1",
      provider: "resend", providerReference: "email_test_reference", acceptedAt: new Date().toISOString() };
    const recorded = await receipts.record(receiptInput);
    assert.equal((await receipts.record(receiptInput)).receiptId, recorded.receiptId);

    await pool.end();
    pool = open();
    await verifyConnectedDatabaseTarget(pool);
    const afterRestart = new PgLaunchControlExecutor(pool);
    assert.equal((await new PostgresDeliveryOutboxRepository(afterRestart).get(caseId, retry.jobId))?.state, "delivered");
    assert.equal((await new PostgresDeliveryReceiptRepository(afterRestart).getByJobId(retry.jobId))?.receiptId,
      recorded.receiptId);
  } finally {
    await pool?.end();
    if (targetVerified) await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
