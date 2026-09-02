/**
 * Repository-neutral contract for persist-first delivery jobs.
 *
 * A producer must persist the case/report before enqueueing a job. The outbox
 * stores only opaque identifiers needed to load that durable data; raw request
 * bodies, contact details, URLs, VINs, and free text do not belong here.
 */

export type DeliveryChannel = "webhook" | "email_workflow" | "internal_queue";

export type DeliveryResourceKind = "case" | "report" | "evidence_manifest";

/** Allowlisted, log-safe references. This is metadata, never delivery content. */
export interface DeliveryPayloadMetadata {
  readonly resourceKind: DeliveryResourceKind;
  readonly resourceId: string;
  readonly resourceVersion: string;
  /** Opaque configuration reference; never a URL, email address, or phone number. */
  readonly destinationKey: string;
  readonly channel: DeliveryChannel;
}

export interface DeliveryRetryPolicy {
  /** Total delivery attempts, including the first attempt. */
  readonly maxAttempts: number;
  readonly initialRetryDelayMs: number;
  readonly backoffMultiplier: number;
  readonly maxRetryDelayMs: number;
  readonly leaseDurationMs: number;
}

export interface EnqueueDeliveryInput {
  readonly caseId: string;
  /** Stable within a case for one logical delivery. */
  readonly deduplicationKey: string;
  readonly metadata: DeliveryPayloadMetadata;
  readonly retryPolicy: DeliveryRetryPolicy;
}

export interface DeliveryFailureMetadata {
  /** Machine-readable allowlisted code only. Never put an exception message here. */
  readonly code: string;
  readonly retryable: boolean;
}

interface DeliveryJobBase {
  readonly jobId: string;
  readonly caseId: string;
  readonly deduplicationKey: string;
  readonly metadata: DeliveryPayloadMetadata;
  readonly retryPolicy: DeliveryRetryPolicy;
  readonly attemptCount: number;
  readonly replayCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastReplayedAt: string | null;
}

export interface PendingDeliveryJob extends DeliveryJobBase {
  readonly state: "pending";
  readonly availableAt: string;
}

export interface LeasedDeliveryJob extends DeliveryJobBase {
  readonly state: "leased";
  readonly lease: {
    readonly token: string;
    readonly leasedAt: string;
    readonly expiresAt: string;
  };
}

export interface FailedDeliveryJob extends DeliveryJobBase {
  readonly state: "failed";
  readonly failedAt: string;
  readonly nextAttemptAt: string;
  readonly lastFailure: DeliveryFailureMetadata;
}

export interface DeliveredDeliveryJob extends DeliveryJobBase {
  readonly state: "delivered";
  readonly deliveredAt: string;
}

export interface DeadLetterDeliveryJob extends DeliveryJobBase {
  readonly state: "dead_letter";
  readonly deadLetteredAt: string;
  readonly lastFailure: DeliveryFailureMetadata;
}

export type DeliveryJob =
  | PendingDeliveryJob
  | LeasedDeliveryJob
  | FailedDeliveryJob
  | DeliveredDeliveryJob
  | DeadLetterDeliveryJob;

export interface EnqueueDeliveryResult {
  readonly disposition: "created" | "duplicate";
  readonly job: DeliveryJob;
}

export interface LeaseNextDeliveryInput {
  /** Leasing is deliberately case-scoped to prevent cross-case consumption. */
  readonly caseId: string;
}

export interface DeliveryLeaseCommand {
  readonly caseId: string;
  readonly jobId: string;
  readonly leaseToken: string;
}

export interface NackDeliveryInput extends DeliveryLeaseCommand {
  readonly failure: DeliveryFailureMetadata;
}

export interface AckDeliveryResult {
  readonly disposition: "delivered" | "already_delivered";
  readonly job: DeliveredDeliveryJob;
}

export interface ReplayDeliveryInput {
  readonly caseId: string;
  readonly jobId: string;
}

export interface DeliveryOutboxCapabilities {
  readonly backendClass: "durable-repository" | "ephemeral-test-double";
  readonly durable: boolean;
  readonly horizontallyScalable: boolean;
  readonly atomicLeasing: boolean;
  readonly fencedAcknowledgement: boolean;
  readonly idempotentEnqueue: boolean;
}

export type DeliveryOutboxErrorCode =
  | "invalid_input"
  | "idempotency_conflict"
  | "not_found"
  | "lease_conflict"
  | "invalid_state"
  | "storage_unavailable"
  | "unsupported_capability";

export class DeliveryOutboxError extends Error {
  constructor(
    readonly code: DeliveryOutboxErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "DeliveryOutboxError";
  }
}

export interface DeliveryOutboxRepository {
  readonly capabilities: DeliveryOutboxCapabilities;

  /** Atomically inserts or returns the existing case-scoped logical job. */
  enqueue(input: EnqueueDeliveryInput): Promise<EnqueueDeliveryResult>;

  /** Scope mismatches and missing jobs both resolve to null. */
  get(caseId: string, jobId: string): Promise<DeliveryJob | null>;

  /**
   * Atomically claims one due job. Expired leases count as failed attempts and
   * become retryable or dead-lettered according to the stored retry policy.
   */
  leaseNext(input: LeaseNextDeliveryInput): Promise<LeasedDeliveryJob | null>;

  /**
   * Only the active lease token may acknowledge. Repeating a successful ack
   * with that same token is idempotent.
   */
  ack(input: DeliveryLeaseCommand): Promise<AckDeliveryResult>;

  /** Records failure and returns either a scheduled failed job or dead letter. */
  nack(input: NackDeliveryInput): Promise<FailedDeliveryJob | DeadLetterDeliveryJob>;

  /** Explicit operator action: reset a dead letter to a fresh pending attempt cycle. */
  replay(input: ReplayDeliveryInput): Promise<PendingDeliveryJob>;
}

export const PRODUCTION_DELIVERY_OUTBOX_REQUIREMENTS = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  horizontallyScalable: true,
  atomicLeasing: true,
  fencedAcknowledgement: true,
  idempotentEnqueue: true,
} as const);

/** Prevents a process-local fake from being selected in production. */
export function assertDurableDeliveryOutbox(
  outbox: Pick<DeliveryOutboxRepository, "capabilities">,
): void {
  const capabilities = outbox.capabilities;
  if (
    capabilities.backendClass !== "durable-repository"
    || !capabilities.durable
    || !capabilities.horizontallyScalable
    || !capabilities.atomicLeasing
    || !capabilities.fencedAcknowledgement
    || !capabilities.idempotentEnqueue
  ) {
    throw new DeliveryOutboxError(
      "unsupported_capability",
      "Production delivery outbox must be durable, scalable, atomic, fenced, and idempotent",
    );
  }
}

/** Fixed-field observability projection with no payload or failure free text. */
export interface DeliveryJobLogMetadata {
  readonly jobId: string;
  readonly caseId: string;
  readonly state: DeliveryJob["state"];
  readonly channel: DeliveryChannel;
  readonly resourceKind: DeliveryResourceKind;
  readonly destinationKey: string;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly replayCount: number;
  readonly failureCode?: string;
}

export function toDeliveryJobLogMetadata(job: DeliveryJob): DeliveryJobLogMetadata {
  const failureCode = job.state === "failed" || job.state === "dead_letter"
    ? job.lastFailure.code
    : undefined;
  return {
    jobId: job.jobId,
    caseId: job.caseId,
    state: job.state,
    channel: job.metadata.channel,
    resourceKind: job.metadata.resourceKind,
    destinationKey: job.metadata.destinationKey,
    attemptCount: job.attemptCount,
    maxAttempts: job.retryPolicy.maxAttempts,
    replayCount: job.replayCount,
    ...(failureCode === undefined ? {} : { failureCode }),
  };
}
