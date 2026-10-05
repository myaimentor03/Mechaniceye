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

type QueryExecutor = {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
};

export type DeliveryOutboxSqlExecutor = QueryExecutor & {
  transaction<T>(work: (executor: QueryExecutor) => Promise<T>): Promise<T>;
};

type StoredJob = {
  job_id: string;
  case_id: string;
  deduplication_key: string;
  state: string;
  channel: string;
  resource_kind: string;
  resource_id: string;
  resource_version: string;
  destination_key: string;
  attempt_count: number;
  replay_count: number;
  max_attempts: number;
  initial_retry_delay_ms: number;
  backoff_multiplier: number | string;
  max_retry_delay_ms: number;
  lease_duration_ms: number;
  lease_token: string | null;
  leased_at: Date | string | null;
  lease_expires_at: Date | string | null;
  available_at: Date | string | null;
  delivered_at: Date | string | null;
  failed_at: Date | string | null;
  next_attempt_at: Date | string | null;
  dead_lettered_at: Date | string | null;
  last_failure_code: string | null;
  last_failure_retryable: boolean | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_replayed_at?: Date | string | null;
};

export const POSTGRES_DELIVERY_OUTBOX_CAPABILITIES: DeliveryOutboxCapabilities = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  horizontallyScalable: true,
  atomicLeasing: true,
  fencedAcknowledgement: true,
  idempotentEnqueue: true,
});

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const RESOURCE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MACHINE_CODE = /^[a-z][a-z0-9_]{0,63}$/;

function invalid(message: string): never {
  throw new DeliveryOutboxError("invalid_input", message);
}

function validateEnqueue(input: EnqueueDeliveryInput): void {
  if (!OPAQUE_ID.test(input.caseId)) invalid("Invalid caseId");
  if (!STABLE_KEY.test(input.deduplicationKey)) invalid("Invalid deduplicationKey");
  const metadata = input.metadata;
  if (!metadata || !OPAQUE_ID.test(metadata.resourceId) || !OPAQUE_ID.test(metadata.destinationKey)) {
    invalid("Invalid delivery metadata");
  }
  if (!RESOURCE_VERSION.test(metadata.resourceVersion)) invalid("Invalid resourceVersion");
  if (!( ["case", "report", "evidence_manifest"] as const).includes(metadata.resourceKind)) invalid("Invalid resourceKind");
  if (!( ["webhook", "email_workflow", "internal_queue"] as const).includes(metadata.channel)) invalid("Invalid delivery channel");
  const policy = input.retryPolicy;
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > 100) invalid("Invalid maxAttempts");
  for (const [name, value, allowZero] of [
    ["initialRetryDelayMs", policy.initialRetryDelayMs, true],
    ["maxRetryDelayMs", policy.maxRetryDelayMs, true],
    ["leaseDurationMs", policy.leaseDurationMs, false],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 7 * 24 * 60 * 60 * 1000) invalid(`Invalid ${name}`);
  }
  if (policy.maxRetryDelayMs < policy.initialRetryDelayMs || !Number.isFinite(policy.backoffMultiplier)
    || policy.backoffMultiplier < 1 || policy.backoffMultiplier > 100) invalid("Invalid retry policy");
}

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new DeliveryOutboxError("storage_unavailable", "Stored delivery timestamp is invalid");
  return date.toISOString();
}

function maybeTimestamp(value: unknown): string | null {
  return value == null ? null : timestamp(value);
}

function fingerprint(job: Pick<DeliveryJob, "metadata" | "retryPolicy">): string {
  const { metadata, retryPolicy } = job;
  return JSON.stringify([
    metadata.resourceKind, metadata.resourceId, metadata.resourceVersion, metadata.destinationKey, metadata.channel,
    retryPolicy.maxAttempts, retryPolicy.initialRetryDelayMs, retryPolicy.backoffMultiplier,
    retryPolicy.maxRetryDelayMs, retryPolicy.leaseDurationMs,
  ]);
}

function mapStoredJob(row: StoredJob): DeliveryJob {
  const common = {
    jobId: row.job_id,
    caseId: row.case_id,
    deduplicationKey: row.deduplication_key,
    metadata: Object.freeze({
      resourceKind: row.resource_kind as DeliveryPayloadMetadata["resourceKind"],
      resourceId: row.resource_id,
      resourceVersion: row.resource_version,
      destinationKey: row.destination_key,
      channel: row.channel as DeliveryPayloadMetadata["channel"],
    }),
    retryPolicy: Object.freeze({
      maxAttempts: Number(row.max_attempts),
      initialRetryDelayMs: Number(row.initial_retry_delay_ms),
      backoffMultiplier: Number(row.backoff_multiplier),
      maxRetryDelayMs: Number(row.max_retry_delay_ms),
      leaseDurationMs: Number(row.lease_duration_ms),
    }),
    attemptCount: Number(row.attempt_count),
    replayCount: Number(row.replay_count),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    lastReplayedAt: maybeTimestamp(row.last_replayed_at),
  };

  switch (row.state) {
    case "pending":
      if (!row.available_at) throw new DeliveryOutboxError("storage_unavailable", "Pending delivery job has no availability time");
      return Object.freeze({ ...common, state: "pending", availableAt: timestamp(row.available_at) }) as PendingDeliveryJob;
    case "leased":
      if (!row.lease_token || !row.leased_at || !row.lease_expires_at) {
        throw new DeliveryOutboxError("storage_unavailable", "Leased delivery job has an invalid lease");
      }
      return Object.freeze({ ...common, state: "leased", lease: Object.freeze({
        token: row.lease_token,
        leasedAt: timestamp(row.leased_at),
        expiresAt: timestamp(row.lease_expires_at),
      }) }) as LeasedDeliveryJob;
    case "failed":
      if (!row.failed_at || !row.next_attempt_at || !row.last_failure_code || row.last_failure_retryable === null) {
        throw new DeliveryOutboxError("storage_unavailable", "Failed delivery job has incomplete failure metadata");
      }
      return Object.freeze({ ...common, state: "failed", failedAt: timestamp(row.failed_at), nextAttemptAt: timestamp(row.next_attempt_at),
        lastFailure: Object.freeze({ code: row.last_failure_code, retryable: row.last_failure_retryable }) }) as FailedDeliveryJob;
    case "delivered":
      if (!row.delivered_at) throw new DeliveryOutboxError("storage_unavailable", "Delivered job has no delivery time");
      return Object.freeze({ ...common, state: "delivered", deliveredAt: timestamp(row.delivered_at) }) as DeliveredDeliveryJob;
    case "dead_letter":
      if (!row.dead_lettered_at || !row.last_failure_code || row.last_failure_retryable === null) {
        throw new DeliveryOutboxError("storage_unavailable", "Dead-letter job has incomplete failure metadata");
      }
      return Object.freeze({ ...common, state: "dead_letter", deadLetteredAt: timestamp(row.dead_lettered_at),
        lastFailure: Object.freeze({ code: row.last_failure_code, retryable: row.last_failure_retryable }) }) as DeadLetterDeliveryJob;
    default:
      throw new DeliveryOutboxError("storage_unavailable", "Stored delivery state is invalid");
  }
}

function unavailable(cause?: unknown): DeliveryOutboxError {
  return new DeliveryOutboxError("storage_unavailable", "Delivery outbox storage is unavailable", true);
}

export class PostgresDeliveryOutboxRepository implements DeliveryOutboxRepository {
  readonly capabilities = POSTGRES_DELIVERY_OUTBOX_CAPABILITIES;

  constructor(private readonly executor: DeliveryOutboxSqlExecutor) {}

  async enqueue(input: EnqueueDeliveryInput): Promise<EnqueueDeliveryResult> {
    validateEnqueue(input);
    const jobId = `job_${randomUUID()}`;
    try {
      const inserted = await this.executor.query<StoredJob>(
        `insert into drivable_delivery_outbox
          (job_id, case_id, deduplication_key, channel, resource_kind, resource_id, resource_version, destination_key,
           max_attempts, initial_retry_delay_ms, backoff_multiplier, max_retry_delay_ms, lease_duration_ms,
           available_at, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now(),now())
         on conflict (case_id, deduplication_key) do nothing returning *`,
        [jobId, input.caseId, input.deduplicationKey, input.metadata.channel, input.metadata.resourceKind,
          input.metadata.resourceId, input.metadata.resourceVersion, input.metadata.destinationKey,
          input.retryPolicy.maxAttempts, input.retryPolicy.initialRetryDelayMs, input.retryPolicy.backoffMultiplier,
          input.retryPolicy.maxRetryDelayMs, input.retryPolicy.leaseDurationMs],
      );
      if (inserted.rows[0]) return Object.freeze({ disposition: "created", job: mapStoredJob(inserted.rows[0]) });
      const existing = await this.executor.query<StoredJob>(
        "select * from drivable_delivery_outbox where case_id = $1 and deduplication_key = $2 limit 1",
        [input.caseId, input.deduplicationKey],
      );
      if (!existing.rows[0]) throw unavailable();
      const job = mapStoredJob(existing.rows[0]);
      if (fingerprint(job) !== fingerprint(input)) {
        throw new DeliveryOutboxError("idempotency_conflict", "The case-scoped deduplication key is already bound to different metadata");
      }
      return Object.freeze({ disposition: "duplicate", job });
    } catch (error) {
      if (error instanceof DeliveryOutboxError) throw error;
      throw unavailable(error);
    }
  }

  async get(caseId: string, jobId: string): Promise<DeliveryJob | null> {
    if (!OPAQUE_ID.test(caseId) || !OPAQUE_ID.test(jobId)) invalid("Invalid caseId or jobId");
    try {
      const result = await this.executor.query<StoredJob>(
        "select * from drivable_delivery_outbox where case_id = $1 and job_id = $2 limit 1", [caseId, jobId],
      );
      return result.rows[0] ? mapStoredJob(result.rows[0]) : null;
    } catch (error) {
      if (error instanceof DeliveryOutboxError) throw error;
      throw unavailable(error);
    }
  }

  async leaseNext(input: LeaseNextDeliveryInput): Promise<LeasedDeliveryJob | null> {
    if (!OPAQUE_ID.test(input.caseId)) invalid("Invalid caseId");
    try {
      return await this.executor.transaction(async (tx) => {
        await tx.query(
          `update drivable_delivery_outbox
              set state = case when attempt_count >= max_attempts then 'dead_letter' else 'failed' end,
                  failed_at = lease_expires_at,
                  next_attempt_at = case when attempt_count >= max_attempts then null else
                    lease_expires_at + least(max_retry_delay_ms, round(initial_retry_delay_ms * power(backoff_multiplier, greatest(attempt_count - 1, 0)))) * interval '1 millisecond' end,
                  dead_lettered_at = case when attempt_count >= max_attempts then lease_expires_at else null end,
                  last_failure_code = 'lease_expired', last_failure_retryable = true,
                  lease_token = null, lease_owner = null, leased_at = null, lease_expires_at = null, updated_at = now()
            where case_id = $1 and state = 'leased' and lease_expires_at <= now()`,
          [input.caseId],
        );
        const candidates = await tx.query<StoredJob>(
          `select * from drivable_delivery_outbox
            where case_id = $1 and ((state = 'pending' and available_at <= now()) or (state = 'failed' and next_attempt_at <= now()))
            order by coalesce(available_at, next_attempt_at), created_at, job_id
            limit 1 for update skip locked`,
          [input.caseId],
        );
        const candidate = candidates.rows[0];
        if (!candidate) return null;
        const leaseToken = `lease_${randomUUID()}`;
        const owner = `worker_${randomUUID()}`;
        const updated = await tx.query<StoredJob>(
          `update drivable_delivery_outbox
              set state = 'leased', attempt_count = attempt_count + 1, lease_token = $2, lease_owner = $3,
                  leased_at = now(), lease_expires_at = now() + lease_duration_ms * interval '1 millisecond',
                  available_at = null, updated_at = now()
            where job_id = $1 returning *`,
          [candidate.job_id, leaseToken, owner],
        );
        if (!updated.rows[0]) throw unavailable();
        return mapStoredJob(updated.rows[0]) as LeasedDeliveryJob;
      });
    } catch (error) {
      if (error instanceof DeliveryOutboxError) throw error;
      throw unavailable(error);
    }
  }

  async ack(input: DeliveryLeaseCommand): Promise<AckDeliveryResult> {
    this.validateLeaseCommand(input);
    try {
      return await this.executor.transaction(async (tx) => {
        const current = await tx.query<StoredJob>(
          "select * from drivable_delivery_outbox where case_id = $1 and job_id = $2 for update", [input.caseId, input.jobId],
        );
        const row = current.rows[0];
        if (!row) throw new DeliveryOutboxError("not_found", "Delivery job was not found");
        if (row.state === "delivered" && row.lease_token === input.leaseToken) {
          return Object.freeze({ disposition: "already_delivered", job: mapStoredJob(row) as DeliveredDeliveryJob });
        }
        const updated = await tx.query<StoredJob>(
          `update drivable_delivery_outbox set state = 'delivered', delivered_at = now(), updated_at = now(), lease_owner = null
            where case_id = $1 and job_id = $2 and state = 'leased' and lease_token = $3 and lease_expires_at > now()
            returning *`, [input.caseId, input.jobId, input.leaseToken],
        );
        if (!updated.rows[0]) throw new DeliveryOutboxError("lease_conflict", "Delivery lease is missing, expired, or superseded", true);
        return Object.freeze({ disposition: "delivered", job: mapStoredJob(updated.rows[0]) as DeliveredDeliveryJob });
      });
    } catch (error) {
      if (error instanceof DeliveryOutboxError) throw error;
      throw unavailable(error);
    }
  }

  async nack(input: NackDeliveryInput): Promise<FailedDeliveryJob | DeadLetterDeliveryJob> {
    this.validateLeaseCommand(input);
    if (!MACHINE_CODE.test(input.failure.code) || typeof input.failure.retryable !== "boolean") invalid("Invalid failure metadata");
    try {
      return await this.executor.transaction(async (tx) => {
        const current = await tx.query<StoredJob>(
          "select * from drivable_delivery_outbox where case_id = $1 and job_id = $2 for update", [input.caseId, input.jobId],
        );
        const row = current.rows[0];
        if (!row) throw new DeliveryOutboxError("not_found", "Delivery job was not found");
        if (row.state !== "leased" || row.lease_token !== input.leaseToken || !row.lease_expires_at
          || new Date(String(row.lease_expires_at)).getTime() <= Date.now()) {
          throw new DeliveryOutboxError("lease_conflict", "Delivery lease is missing, expired, or superseded", true);
        }
        const dead = !input.failure.retryable || Number(row.attempt_count) >= Number(row.max_attempts);
        const updated = await tx.query<StoredJob>(
          `update drivable_delivery_outbox
              set state = $4, failed_at = now(), next_attempt_at = case when $4 = 'failed' then
                    now() + least(max_retry_delay_ms, round(initial_retry_delay_ms * power(backoff_multiplier, greatest(attempt_count - 1, 0)))) * interval '1 millisecond' else null end,
                  dead_lettered_at = case when $4 = 'dead_letter' then now() else null end,
                  last_failure_code = $5, last_failure_retryable = $6,
                  lease_token = null, lease_owner = null, leased_at = null, lease_expires_at = null, updated_at = now()
            where case_id = $1 and job_id = $2 and state = 'leased' and lease_token = $3 returning *`,
          [input.caseId, input.jobId, input.leaseToken, dead ? "dead_letter" : "failed", input.failure.code, input.failure.retryable],
        );
        if (!updated.rows[0]) throw new DeliveryOutboxError("lease_conflict", "Delivery lease is missing, expired, or superseded", true);
        return mapStoredJob(updated.rows[0]) as FailedDeliveryJob | DeadLetterDeliveryJob;
      });
    } catch (error) {
      if (error instanceof DeliveryOutboxError) throw error;
      throw unavailable(error);
    }
  }

  async replay(input: ReplayDeliveryInput): Promise<PendingDeliveryJob> {
    this.validateCaseJob(input.caseId, input.jobId);
    try {
      const result = await this.executor.query<StoredJob>(
        `update drivable_delivery_outbox
            set state = 'pending', attempt_count = 0, replay_count = replay_count + 1, available_at = now(), updated_at = now(),
                last_replayed_at = now(), failed_at = null, next_attempt_at = null, dead_lettered_at = null,
                last_failure_code = null, last_failure_retryable = null, lease_token = null, lease_owner = null,
                leased_at = null, lease_expires_at = null
          where case_id = $1 and job_id = $2 and state = 'dead_letter' returning *`, [input.caseId, input.jobId],
      );
      if (!result.rows[0]) {
        const existing = await this.get(input.caseId, input.jobId);
        if (!existing) throw new DeliveryOutboxError("not_found", "Delivery job was not found");
        throw new DeliveryOutboxError("invalid_state", "Only dead-letter jobs can be replayed");
      }
      return mapStoredJob(result.rows[0]) as PendingDeliveryJob;
    } catch (error) {
      if (error instanceof DeliveryOutboxError) throw error;
      throw unavailable(error);
    }
  }

  private validateLeaseCommand(input: DeliveryLeaseCommand): void {
    this.validateCaseJob(input.caseId, input.jobId);
    if (!OPAQUE_ID.test(input.leaseToken)) invalid("Invalid leaseToken");
  }

  private validateCaseJob(caseId: string, jobId: string): void {
    if (!OPAQUE_ID.test(caseId) || !OPAQUE_ID.test(jobId)) invalid("Invalid caseId or jobId");
  }
}
