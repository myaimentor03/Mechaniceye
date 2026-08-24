import assert from "node:assert/strict";
import test from "node:test";
import {
  DeliveryOutboxError,
  assertDurableDeliveryOutbox,
  toDeliveryJobLogMetadata,
  type DeliveryOutboxRepository,
  type EnqueueDeliveryInput,
} from "./delivery-outbox.js";
import { InMemoryDeliveryOutbox } from "./in-memory-delivery-outbox.js";

class TestClock {
  private milliseconds = Date.parse("2026-01-01T00:00:00.000Z");

  now = (): Date => new Date(this.milliseconds);

  advance(milliseconds: number): void {
    this.milliseconds += milliseconds;
  }
}

function makeInput(overrides: Partial<EnqueueDeliveryInput> = {}): EnqueueDeliveryInput {
  return {
    caseId: "CASE-123",
    deduplicationKey: "report-ready-v1",
    metadata: {
      resourceKind: "report",
      resourceId: "REPORT-456",
      resourceVersion: "v1",
      destinationKey: "CUSTOMER-WEBHOOK-1",
      channel: "webhook",
    },
    retryPolicy: {
      maxAttempts: 3,
      initialRetryDelayMs: 1_000,
      backoffMultiplier: 2,
      maxRetryDelayMs: 5_000,
      leaseDurationMs: 500,
    },
    ...overrides,
  };
}

function isOutboxError(code: DeliveryOutboxError["code"]): (error: unknown) => boolean {
  return (error) => error instanceof DeliveryOutboxError && error.code === code;
}

async function leaseRequired(
  outbox: DeliveryOutboxRepository,
  caseId = "CASE-123",
) {
  const leased = await outbox.leaseNext({ caseId });
  assert.notEqual(leased, null);
  return leased!;
}

test("enqueue generates IDs and concurrent duplicate enqueue creates one stable job", async () => {
  const clock = new TestClock();
  let id = 0;
  const outbox = new InMemoryDeliveryOutbox({
    now: clock.now,
    idGenerator: () => `generated-${++id}`,
  });

  const [first, duplicate] = await Promise.all([
    outbox.enqueue(makeInput()),
    outbox.enqueue(makeInput()),
  ]);

  assert.equal(first.disposition, "created");
  assert.equal(duplicate.disposition, "duplicate");
  assert.match(first.job.jobId, /^job_generated-/);
  assert.equal(duplicate.job.jobId, first.job.jobId);
  assert.equal(duplicate.job.caseId, "CASE-123");
  assert.equal(duplicate.job.deduplicationKey, "report-ready-v1");
  assert.equal(outbox.storedJobCount, 1);

  await assert.rejects(
    outbox.enqueue(makeInput({
      metadata: { ...makeInput().metadata, resourceVersion: "v2" },
    })),
    isOutboxError("idempotency_conflict"),
  );
});

test("expired leases are fenced, recorded as failures, and retried only when due", async () => {
  const clock = new TestClock();
  let id = 0;
  const outbox = new InMemoryDeliveryOutbox({ now: clock.now, idGenerator: () => `${++id}` });
  const created = await outbox.enqueue(makeInput());
  const firstLease = await leaseRequired(outbox);
  assert.equal(firstLease.attemptCount, 1);

  clock.advance(500);
  assert.equal(await outbox.leaseNext({ caseId: "CASE-123" }), null);
  const failed = await outbox.get("CASE-123", created.job.jobId);
  assert.equal(failed?.state, "failed");
  if (failed?.state === "failed") {
    assert.equal(failed.lastFailure.code, "lease_expired");
    assert.equal(failed.nextAttemptAt, "2026-01-01T00:00:01.500Z");
  }

  clock.advance(999);
  assert.equal(await outbox.leaseNext({ caseId: "CASE-123" }), null);
  clock.advance(1);
  const secondLease = await leaseRequired(outbox);
  assert.equal(secondLease.attemptCount, 2);
  assert.notEqual(secondLease.lease.token, firstLease.lease.token);
  await assert.rejects(
    outbox.ack({
      caseId: firstLease.caseId,
      jobId: firstLease.jobId,
      leaseToken: firstLease.lease.token,
    }),
    isOutboxError("lease_conflict"),
  );
});

test("retry policy has bounded exponential delays and ends in dead letter", async () => {
  const clock = new TestClock();
  let id = 0;
  const outbox = new InMemoryDeliveryOutbox({ now: clock.now, idGenerator: () => `${++id}` });
  await outbox.enqueue(makeInput());

  const first = await leaseRequired(outbox);
  const failedOnce = await outbox.nack({
    caseId: first.caseId,
    jobId: first.jobId,
    leaseToken: first.lease.token,
    failure: { code: "network_timeout", retryable: true },
  });
  assert.equal(failedOnce.state, "failed");
  assert.equal(failedOnce.nextAttemptAt, "2026-01-01T00:00:01.000Z");

  clock.advance(1_000);
  const second = await leaseRequired(outbox);
  const failedTwice = await outbox.nack({
    caseId: second.caseId,
    jobId: second.jobId,
    leaseToken: second.lease.token,
    failure: { code: "upstream_unavailable", retryable: true },
  });
  assert.equal(failedTwice.state, "failed");
  assert.equal(failedTwice.nextAttemptAt, "2026-01-01T00:00:03.000Z");

  clock.advance(2_000);
  const third = await leaseRequired(outbox);
  const dead = await outbox.nack({
    caseId: third.caseId,
    jobId: third.jobId,
    leaseToken: third.lease.token,
    failure: { code: "network_timeout", retryable: true },
  });
  assert.equal(dead.state, "dead_letter");
  assert.equal(dead.attemptCount, 3);
  assert.equal(await outbox.leaseNext({ caseId: "CASE-123" }), null);
});

test("non-retryable failure dead-letters immediately and replay starts a fresh bounded cycle", async () => {
  const clock = new TestClock();
  let id = 0;
  const outbox = new InMemoryDeliveryOutbox({ now: clock.now, idGenerator: () => `${++id}` });
  const created = await outbox.enqueue(makeInput());
  const lease = await leaseRequired(outbox);
  const dead = await outbox.nack({
    caseId: lease.caseId,
    jobId: lease.jobId,
    leaseToken: lease.lease.token,
    failure: { code: "destination_rejected", retryable: false },
  });
  assert.equal(dead.state, "dead_letter");
  assert.equal(dead.attemptCount, 1);

  clock.advance(10);
  const replayed = await outbox.replay({ caseId: dead.caseId, jobId: dead.jobId });
  assert.equal(replayed.state, "pending");
  assert.equal(replayed.attemptCount, 0);
  assert.equal(replayed.replayCount, 1);
  assert.equal("lastFailure" in replayed, false);
  assert.equal("lease" in replayed, false);
  assert.equal(replayed.jobId, created.job.jobId);

  const duplicate = await outbox.enqueue(makeInput());
  assert.equal(duplicate.disposition, "duplicate");
  assert.equal(duplicate.job.state, "pending");

  const replayLease = await leaseRequired(outbox);
  const delivered = await outbox.ack({
    caseId: replayLease.caseId,
    jobId: replayLease.jobId,
    leaseToken: replayLease.lease.token,
  });
  assert.equal(delivered.disposition, "delivered");
  assert.equal(delivered.job.state, "delivered");
  assert.equal("lease" in delivered.job, false);

  const duplicateAck = await outbox.ack({
    caseId: replayLease.caseId,
    jobId: replayLease.jobId,
    leaseToken: replayLease.lease.token,
  });
  assert.equal(duplicateAck.disposition, "already_delivered");
});

test("case scope isolates deduplication, reads, leases, acknowledgements, and replay", async () => {
  const clock = new TestClock();
  let id = 0;
  const outbox = new InMemoryDeliveryOutbox({ now: clock.now, idGenerator: () => `${++id}` });
  const caseA = await outbox.enqueue(makeInput({ caseId: "CASE-A" }));
  const caseB = await outbox.enqueue(makeInput({ caseId: "CASE-B" }));
  assert.notEqual(caseA.job.jobId, caseB.job.jobId);
  assert.equal(outbox.storedJobCount, 2);
  assert.equal(await outbox.get("CASE-B", caseA.job.jobId), null);

  const leasedB = await leaseRequired(outbox, "CASE-B");
  assert.equal(leasedB.jobId, caseB.job.jobId);
  await assert.rejects(
    outbox.ack({
      caseId: "CASE-A",
      jobId: leasedB.jobId,
      leaseToken: leasedB.lease.token,
    }),
    isOutboxError("not_found"),
  );
  const deadB = await outbox.nack({
    caseId: "CASE-B",
    jobId: leasedB.jobId,
    leaseToken: leasedB.lease.token,
    failure: { code: "destination_rejected", retryable: false },
  });
  await assert.rejects(
    outbox.replay({ caseId: "CASE-A", jobId: deadB.jobId }),
    isOutboxError("not_found"),
  );
  assert.equal((await outbox.get("CASE-B", deadB.jobId))?.state, "dead_letter");
  const leasedA = await leaseRequired(outbox, "CASE-A");
  assert.equal(leasedA.jobId, caseA.job.jobId);
});

test("repository failure never reports or records delivery", async () => {
  const clock = new TestClock();
  let id = 0;
  const outbox = new InMemoryDeliveryOutbox({ now: clock.now, idGenerator: () => `${++id}` });
  await outbox.enqueue(makeInput());
  const lease = await leaseRequired(outbox);

  outbox.failNext("ack");
  await assert.rejects(
    outbox.ack({ caseId: lease.caseId, jobId: lease.jobId, leaseToken: lease.lease.token }),
    isOutboxError("storage_unavailable"),
  );
  assert.equal((await outbox.get(lease.caseId, lease.jobId))?.state, "leased");

  outbox.failNext("nack");
  await assert.rejects(
    outbox.nack({
      caseId: lease.caseId,
      jobId: lease.jobId,
      leaseToken: lease.lease.token,
      failure: { code: "network_timeout", retryable: true },
    }),
    isOutboxError("storage_unavailable"),
  );
  assert.equal((await outbox.get(lease.caseId, lease.jobId))?.state, "leased");
});

test("log projection is fixed metadata only and inputs reject raw destinations or free text", async () => {
  const outbox = new InMemoryDeliveryOutbox();
  const created = await outbox.enqueue(makeInput());
  const logMetadata = toDeliveryJobLogMetadata(created.job);
  assert.deepEqual(Object.keys(logMetadata).sort(), [
    "attemptCount",
    "caseId",
    "channel",
    "destinationKey",
    "jobId",
    "maxAttempts",
    "replayCount",
    "resourceKind",
    "state",
  ]);
  assert.equal(JSON.stringify(logMetadata).includes("payload"), false);

  for (const destinationKey of [
    "https://example.test/hook",
    "buyer@example.test",
    "+1 555 123 4567",
    "send this report to the buyer",
  ]) {
    await assert.rejects(
      outbox.enqueue(makeInput({
        deduplicationKey: `unsafe-${destinationKey.length}`,
        metadata: { ...makeInput().metadata, destinationKey },
      })),
      isOutboxError("invalid_input"),
    );
  }
  await assert.rejects(
    outbox.nack({
      caseId: created.job.caseId,
      jobId: created.job.jobId,
      leaseToken: "lease_invalid",
      failure: { code: "Contains free text", retryable: true },
    }),
    isOutboxError("invalid_input"),
  );
});

test("retry bounds and production durability are explicit gates", async () => {
  const outbox = new InMemoryDeliveryOutbox();
  await assert.rejects(
    outbox.enqueue(makeInput({
      retryPolicy: { ...makeInput().retryPolicy, maxAttempts: 101 },
    })),
    isOutboxError("invalid_input"),
  );
  assert.throws(
    () => assertDurableDeliveryOutbox(outbox),
    isOutboxError("unsupported_capability"),
  );
});
