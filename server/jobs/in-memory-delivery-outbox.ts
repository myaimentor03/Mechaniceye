import { randomUUID } from "node:crypto";
import {
  DeliveryOutboxError,
  type AckDeliveryResult,
  type DeadLetterDeliveryJob,
  type DeliveredDeliveryJob,
  type DeliveryFailureMetadata,
  type DeliveryJob,
  type DeliveryLeaseCommand,
  type DeliveryOutboxCapabilities,
  type DeliveryOutboxRepository,
  type DeliveryPayloadMetadata,
  type DeliveryRetryPolicy,
  type EnqueueDeliveryInput,
  type EnqueueDeliveryResult,
  type FailedDeliveryJob,
  type LeasedDeliveryJob,
  type LeaseNextDeliveryInput,
  type NackDeliveryInput,
  type PendingDeliveryJob,
  type ReplayDeliveryInput,
} from "./delivery-outbox.js";

type FakeOperation = "enqueue" | "get" | "lease" | "ack" | "nack" | "replay";

interface StoredRecord {
  job: DeliveryJob;
  readonly fingerprint: string;
  deliveredByLeaseToken?: string;
}

type CommonJobFields = Omit<PendingDeliveryJob, "state" | "availableAt">;

export interface InMemoryDeliveryOutboxOptions {
  readonly now?: () => Date;
  readonly idGenerator?: () => string;
}

export const IN_MEMORY_DELIVERY_OUTBOX_CAPABILITIES: DeliveryOutboxCapabilities = Object.freeze({
  backendClass: "ephemeral-test-double",
  durable: false,
  horizontallyScalable: false,
  atomicLeasing: true,
  fencedAcknowledgement: true,
  idempotentEnqueue: true,
});

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const MACHINE_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const RESOURCE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MIN_DURATION_MS = 1;
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_ATTEMPTS = 100;
const MAX_BACKOFF_MULTIPLIER = 100;

function invalid(message: string): never {
  throw new DeliveryOutboxError("invalid_input", message);
}

function validatePattern(label: string, value: string, pattern: RegExp): void {
  if (!pattern.test(value)) invalid(`Invalid ${label}`);
}

function validateDuration(label: string, value: number, allowZero = false): void {
  const minimum = allowZero ? 0 : MIN_DURATION_MS;
  if (!Number.isSafeInteger(value) || value < minimum || value > MAX_DURATION_MS) {
    invalid(`Invalid ${label}`);
  }
}

function validateRetryPolicy(policy: DeliveryRetryPolicy): void {
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > MAX_ATTEMPTS) {
    invalid("Invalid maxAttempts");
  }
  validateDuration("initialRetryDelayMs", policy.initialRetryDelayMs, true);
  validateDuration("maxRetryDelayMs", policy.maxRetryDelayMs, true);
  validateDuration("leaseDurationMs", policy.leaseDurationMs);
  if (policy.maxRetryDelayMs < policy.initialRetryDelayMs) {
    invalid("maxRetryDelayMs must be at least initialRetryDelayMs");
  }
  if (
    !Number.isFinite(policy.backoffMultiplier)
    || policy.backoffMultiplier < 1
    || policy.backoffMultiplier > MAX_BACKOFF_MULTIPLIER
  ) {
    invalid("Invalid backoffMultiplier");
  }
}

function validateMetadata(metadata: DeliveryPayloadMetadata): void {
  validatePattern("resourceId", metadata.resourceId, OPAQUE_ID);
  validatePattern("resourceVersion", metadata.resourceVersion, RESOURCE_VERSION);
  validatePattern("destinationKey", metadata.destinationKey, OPAQUE_ID);
  if (!(["case", "report", "evidence_manifest"] as const).includes(metadata.resourceKind)) {
    invalid("Invalid resourceKind");
  }
  if (!(["webhook", "email_workflow", "internal_queue"] as const).includes(metadata.channel)) {
    invalid("Invalid channel");
  }
}

function validateEnqueue(input: EnqueueDeliveryInput): void {
  validatePattern("caseId", input.caseId, OPAQUE_ID);
  validatePattern("deduplicationKey", input.deduplicationKey, STABLE_KEY);
  validateMetadata(input.metadata);
  validateRetryPolicy(input.retryPolicy);
}

function validateCaseAndJob(caseId: string, jobId: string): void {
  validatePattern("caseId", caseId, OPAQUE_ID);
  validatePattern("jobId", jobId, OPAQUE_ID);
}

function validateLeaseToken(token: string): void {
  validatePattern("leaseToken", token, OPAQUE_ID);
}

function validateFailure(failure: DeliveryFailureMetadata): void {
  validatePattern("failure code", failure.code, MACHINE_CODE);
  if (typeof failure.retryable !== "boolean") invalid("Invalid retryable flag");
}

function cloneMetadata(metadata: DeliveryPayloadMetadata): DeliveryPayloadMetadata {
  return { ...metadata };
}

function clonePolicy(policy: DeliveryRetryPolicy): DeliveryRetryPolicy {
  return { ...policy };
}

function commonFields(job: DeliveryJob): CommonJobFields {
  return {
    jobId: job.jobId,
    caseId: job.caseId,
    deduplicationKey: job.deduplicationKey,
    metadata: cloneMetadata(job.metadata),
    retryPolicy: clonePolicy(job.retryPolicy),
    attemptCount: job.attemptCount,
    replayCount: job.replayCount,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    lastReplayedAt: job.lastReplayedAt,
  };
}

function cloneJob<T extends DeliveryJob>(job: T): T {
  return {
    ...job,
    metadata: cloneMetadata(job.metadata),
    retryPolicy: clonePolicy(job.retryPolicy),
    ...(job.state === "leased" ? { lease: { ...job.lease } } : {}),
    ...(job.state === "failed" || job.state === "dead_letter"
      ? { lastFailure: { ...job.lastFailure } }
      : {}),
  } as T;
}

function timestamp(date: Date): string {
  const time = date.getTime();
  if (!Number.isFinite(time)) invalid("Clock returned an invalid date");
  return new Date(time).toISOString();
}

function addMilliseconds(iso: string, milliseconds: number): string {
  return new Date(new Date(iso).getTime() + milliseconds).toISOString();
}

function retryDelay(policy: DeliveryRetryPolicy, attemptCount: number): number {
  const exponential = policy.initialRetryDelayMs
    * Math.pow(policy.backoffMultiplier, Math.max(0, attemptCount - 1));
  return Math.min(policy.maxRetryDelayMs, Math.round(exponential));
}

function deduplicationMapKey(caseId: string, deduplicationKey: string): string {
  return `${caseId}\u0000${deduplicationKey}`;
}

function fingerprint(input: EnqueueDeliveryInput): string {
  const { metadata, retryPolicy } = input;
  return JSON.stringify([
    metadata.resourceKind,
    metadata.resourceId,
    metadata.resourceVersion,
    metadata.destinationKey,
    metadata.channel,
    retryPolicy.maxAttempts,
    retryPolicy.initialRetryDelayMs,
    retryPolicy.backoffMultiplier,
    retryPolicy.maxRetryDelayMs,
    retryPolicy.leaseDurationMs,
  ]);
}

/**
 * Process-local deterministic contract fake. It intentionally fails the
 * production capability gate and must not be wired as a production outbox.
 */
export class InMemoryDeliveryOutbox implements DeliveryOutboxRepository {
  readonly capabilities = IN_MEMORY_DELIVERY_OUTBOX_CAPABILITIES;

  private readonly records = new Map<string, StoredRecord>();
  private readonly deduplication = new Map<string, string>();
  private readonly issuedLeaseTokens = new Set<string>();
  private readonly scheduledFailures = new Map<FakeOperation, Error>();
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(options: InMemoryDeliveryOutboxOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;
  }

  get storedJobCount(): number {
    return this.records.size;
  }

  /** Inject one pre-mutation repository failure for adversarial tests. */
  failNext(
    operation: FakeOperation,
    error: Error = new DeliveryOutboxError(
      "storage_unavailable",
      `Injected ${operation} repository failure`,
      true,
    ),
  ): void {
    this.scheduledFailures.set(operation, error);
  }

  async enqueue(input: EnqueueDeliveryInput): Promise<EnqueueDeliveryResult> {
    this.throwScheduledFailure("enqueue");
    validateEnqueue(input);
    const dedupeKey = deduplicationMapKey(input.caseId, input.deduplicationKey);
    const existingId = this.deduplication.get(dedupeKey);
    const inputFingerprint = fingerprint(input);

    if (existingId) {
      const record = this.records.get(existingId);
      if (!record) {
        throw new DeliveryOutboxError("storage_unavailable", "Outbox index is inconsistent", true);
      }
      if (record.fingerprint !== inputFingerprint) {
        throw new DeliveryOutboxError(
          "idempotency_conflict",
          "The case-scoped deduplication key is already bound to different metadata",
        );
      }
      return { disposition: "duplicate", job: cloneJob(record.job) };
    }

    const jobId = this.generateUniqueId("job");
    const createdAt = timestamp(this.now());
    const job: PendingDeliveryJob = {
      jobId,
      caseId: input.caseId,
      deduplicationKey: input.deduplicationKey,
      metadata: cloneMetadata(input.metadata),
      retryPolicy: clonePolicy(input.retryPolicy),
      attemptCount: 0,
      replayCount: 0,
      createdAt,
      updatedAt: createdAt,
      lastReplayedAt: null,
      state: "pending",
      availableAt: createdAt,
    };
    this.records.set(jobId, { job, fingerprint: inputFingerprint });
    this.deduplication.set(dedupeKey, jobId);
    return { disposition: "created", job: cloneJob(job) };
  }

  async get(caseId: string, jobId: string): Promise<DeliveryJob | null> {
    this.throwScheduledFailure("get");
    validateCaseAndJob(caseId, jobId);
    const record = this.records.get(jobId);
    return record?.job.caseId === caseId ? cloneJob(record.job) : null;
  }

  async leaseNext(input: LeaseNextDeliveryInput): Promise<LeasedDeliveryJob | null> {
    this.throwScheduledFailure("lease");
    validatePattern("caseId", input.caseId, OPAQUE_ID);
    const now = timestamp(this.now());

    for (const record of this.records.values()) {
      if (record.job.caseId === input.caseId) this.expireLease(record, now);
    }

    const candidate = [...this.records.values()]
      .filter((record) => record.job.caseId === input.caseId && this.isDue(record.job, now))
      .sort((left, right) => this.compareForLease(left.job, right.job))[0];
    if (!candidate) return null;

    const previous = candidate.job;
    const leasedAt = now;
    const lease: LeasedDeliveryJob = {
      ...commonFields(previous),
      state: "leased",
      attemptCount: previous.attemptCount + 1,
      updatedAt: leasedAt,
      lease: {
        token: this.generateUniqueId("lease"),
        leasedAt,
        expiresAt: addMilliseconds(leasedAt, previous.retryPolicy.leaseDurationMs),
      },
    };
    candidate.job = lease;
    candidate.deliveredByLeaseToken = undefined;
    return cloneJob(lease);
  }

  async ack(input: DeliveryLeaseCommand): Promise<AckDeliveryResult> {
    this.throwScheduledFailure("ack");
    validateCaseAndJob(input.caseId, input.jobId);
    validateLeaseToken(input.leaseToken);
    const record = this.requireScopedRecord(input.caseId, input.jobId);

    if (record.job.state === "delivered") {
      if (record.deliveredByLeaseToken !== input.leaseToken) this.leaseConflict();
      return { disposition: "already_delivered", job: cloneJob(record.job) };
    }

    const now = timestamp(this.now());
    this.requireActiveLease(record.job, input.leaseToken, now);
    const delivered: DeliveredDeliveryJob = {
      ...commonFields(record.job),
      state: "delivered",
      updatedAt: now,
      deliveredAt: now,
    };
    record.job = delivered;
    record.deliveredByLeaseToken = input.leaseToken;
    return { disposition: "delivered", job: cloneJob(delivered) };
  }

  async nack(input: NackDeliveryInput): Promise<FailedDeliveryJob | DeadLetterDeliveryJob> {
    this.throwScheduledFailure("nack");
    validateCaseAndJob(input.caseId, input.jobId);
    validateLeaseToken(input.leaseToken);
    validateFailure(input.failure);
    const record = this.requireScopedRecord(input.caseId, input.jobId);
    const now = timestamp(this.now());
    this.requireActiveLease(record.job, input.leaseToken, now);

    const next = this.failureTransition(record.job, input.failure, now);
    record.job = next;
    return cloneJob(next);
  }

  async replay(input: ReplayDeliveryInput): Promise<PendingDeliveryJob> {
    this.throwScheduledFailure("replay");
    validateCaseAndJob(input.caseId, input.jobId);
    const record = this.requireScopedRecord(input.caseId, input.jobId);
    if (record.job.state !== "dead_letter") {
      throw new DeliveryOutboxError("invalid_state", "Only dead-letter jobs can be replayed");
    }

    const now = timestamp(this.now());
    const pending: PendingDeliveryJob = {
      ...commonFields(record.job),
      state: "pending",
      attemptCount: 0,
      replayCount: record.job.replayCount + 1,
      updatedAt: now,
      lastReplayedAt: now,
      availableAt: now,
    };
    record.job = pending;
    record.deliveredByLeaseToken = undefined;
    return cloneJob(pending);
  }

  private requireScopedRecord(caseId: string, jobId: string): StoredRecord {
    const record = this.records.get(jobId);
    if (!record || record.job.caseId !== caseId) {
      throw new DeliveryOutboxError("not_found", "Delivery job was not found");
    }
    return record;
  }

  private requireActiveLease(
    job: DeliveryJob,
    leaseToken: string,
    now: string,
  ): asserts job is LeasedDeliveryJob {
    if (
      job.state !== "leased"
      || job.lease.token !== leaseToken
      || job.lease.expiresAt <= now
    ) {
      this.leaseConflict();
    }
  }

  private leaseConflict(): never {
    throw new DeliveryOutboxError(
      "lease_conflict",
      "Delivery lease is missing, expired, or superseded",
      true,
    );
  }

  private expireLease(record: StoredRecord, now: string): void {
    if (record.job.state !== "leased" || record.job.lease.expiresAt > now) return;
    record.job = this.failureTransition(
      record.job,
      { code: "lease_expired", retryable: true },
      record.job.lease.expiresAt,
    );
  }

  private failureTransition(
    job: LeasedDeliveryJob,
    failure: DeliveryFailureMetadata,
    failedAt: string,
  ): FailedDeliveryJob | DeadLetterDeliveryJob {
    if (!failure.retryable || job.attemptCount >= job.retryPolicy.maxAttempts) {
      return {
        ...commonFields(job),
        state: "dead_letter",
        updatedAt: failedAt,
        deadLetteredAt: failedAt,
        lastFailure: { ...failure },
      };
    }
    return {
      ...commonFields(job),
      state: "failed",
      updatedAt: failedAt,
      failedAt,
      nextAttemptAt: addMilliseconds(
        failedAt,
        retryDelay(job.retryPolicy, job.attemptCount),
      ),
      lastFailure: { ...failure },
    };
  }

  private isDue(job: DeliveryJob, now: string): job is PendingDeliveryJob | FailedDeliveryJob {
    return (job.state === "pending" && job.availableAt <= now)
      || (job.state === "failed" && job.nextAttemptAt <= now);
  }

  private compareForLease(left: DeliveryJob, right: DeliveryJob): number {
    const leftDue = left.state === "pending"
      ? left.availableAt
      : left.state === "failed" ? left.nextAttemptAt : left.updatedAt;
    const rightDue = right.state === "pending"
      ? right.availableAt
      : right.state === "failed" ? right.nextAttemptAt : right.updatedAt;
    return leftDue.localeCompare(rightDue)
      || left.createdAt.localeCompare(right.createdAt)
      || left.jobId.localeCompare(right.jobId);
  }

  private generateUniqueId(kind: "job" | "lease"): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const generated = `${kind}_${this.idGenerator()}`;
      const unique = kind === "job"
        ? !this.records.has(generated)
        : !this.issuedLeaseTokens.has(generated);
      if (OPAQUE_ID.test(generated) && unique) {
        if (kind === "lease") this.issuedLeaseTokens.add(generated);
        return generated;
      }
    }
    throw new DeliveryOutboxError("storage_unavailable", `Could not generate a unique ${kind} ID`, true);
  }

  private throwScheduledFailure(operation: FakeOperation): void {
    const failure = this.scheduledFailures.get(operation);
    if (!failure) return;
    this.scheduledFailures.delete(operation);
    throw failure;
  }
}
