import {
  assertDurableDeliveryOutbox,
  type DeliveryOutboxRepository,
  type LeasedDeliveryJob,
} from "./delivery-outbox.js";
import {
  type PaidFulfillmentEligibilityDecision,
  type PaidFulfillmentEligibilityInput,
  type PaidFulfillmentEligibilityService,
} from "../commerce/paid-fulfillment-eligibility.js";
import type { PaidDeliveryAuthorizationContext, ApprovedPaidResult } from "./paid-delivery-context.js";
import { assertApprovedResultMatches } from "./paid-delivery-context.js";
import type { ReviewVersionRecord } from "../review/types.js";

export type PaidDeliveryReceipt = Readonly<{
  receiptId: string;
  jobId: string;
  caseId: string;
  resourceVersion: string;
  destinationKey: string;
  provider: string;
  providerReference: string;
  /** Timestamp at which the provider accepted the request; not proof of mailbox delivery. */
  acceptedAt: string;
  createdAt: string;
}>;

export type PaidDeliveryReceiptRepositoryCapabilities = Readonly<{
  backendClass: "durable-repository" | "process-local-test-fake";
  durable: boolean;
  idempotentByJob: boolean;
}>;

export interface PaidDeliveryReceiptRepository {
  readonly capabilities: PaidDeliveryReceiptRepositoryCapabilities;
  /** Must return the same receipt for an exact retry keyed by jobId. */
  record(input: Omit<PaidDeliveryReceipt, "receiptId" | "createdAt">): Promise<PaidDeliveryReceipt>;
  getByJobId(jobId: string): Promise<PaidDeliveryReceipt | null>;
}

export interface PaidDeliveryAuthorizationContextResolver {
  /** Resolve current durable order, case, and review bindings; never trust the job alone. */
  resolve(job: LeasedDeliveryJob): Promise<PaidDeliveryAuthorizationContext | null>;
  /** Reload the review record for a second last-moment content/version comparison. */
  getReviewVersion?(versionId: string): Promise<ReviewVersionRecord | undefined>;
}

export type ProviderAcceptedPaidDelivery = Readonly<{
  provider: string;
  providerReference: string;
  acceptedAt: string;
}>;

export type PaidResultDeliveryProviderCapabilities = Readonly<{
  backendClass: "idempotent-provider" | "test-provider";
  idempotentByKey: boolean;
}>;

export interface PaidResultDeliveryProvider {
  readonly capabilities: PaidResultDeliveryProviderCapabilities;
  /** Provider must enforce idempotency for this key across retries and process restarts. */
  deliver(input: Readonly<{
    idempotencyKey: string;
    job: LeasedDeliveryJob;
    approvedResult: ApprovedPaidResult;
    authorization: Extract<PaidFulfillmentEligibilityDecision, { allowed: true }>;
  }>): Promise<ProviderAcceptedPaidDelivery>;
}

export class PaidDeliveryProviderError extends Error {
  constructor(readonly retryable: boolean) {
    super("Paid result delivery provider failed");
    this.name = "PaidDeliveryProviderError";
  }
}

export type PaidResultDeliveryConsumerResult =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "denied"; jobId: string; code: string }>
  | Readonly<{ status: "retry_scheduled" | "dead_lettered"; jobId: string; code: string }>
  | Readonly<{ status: "provider_accepted"; jobId: string; receipt: PaidDeliveryReceipt }>;

/**
 * Processes only the internal approved-result destination. It rechecks durable
 * payment and human approval immediately before handoff, persists a provider
 * acceptance receipt, and only then ACKs the fenced outbox lease. A provider
 * acceptance is not proof that the recipient's mailbox received the message.
 * This class intentionally starts no worker, scheduler, or external provider on import.
 */
export class PaidResultDeliveryConsumer {
  constructor(
    private readonly outbox: DeliveryOutboxRepository,
    private readonly eligibility: PaidFulfillmentEligibilityService,
    private readonly contexts: PaidDeliveryAuthorizationContextResolver,
    private readonly provider: PaidResultDeliveryProvider,
    private readonly receipts: PaidDeliveryReceiptRepository,
    options: Readonly<{ allowIsolatedTestProvider?: boolean }> = {},
  ) {
    assertDurableDeliveryOutbox(outbox);
    if (receipts.capabilities.backendClass !== "durable-repository"
      || !receipts.capabilities.durable || !receipts.capabilities.idempotentByJob) {
      throw new TypeError("Paid delivery receipts must use a durable, job-idempotent repository");
    }
    if (provider.capabilities.backendClass === "test-provider" && !options.allowIsolatedTestProvider) {
      throw new TypeError("Test providers require an explicit isolated-test opt-in");
    }
    if (!["idempotent-provider", "test-provider"].includes(provider.capabilities.backendClass)
      || !provider.capabilities.idempotentByKey) {
      throw new TypeError("Paid delivery provider must enforce durable idempotency keys");
    }
  }

  async processNext(caseId: string): Promise<PaidResultDeliveryConsumerResult> {
    const job = await this.outbox.leaseNext({ caseId });
    if (!job) return Object.freeze({ status: "idle" });

    if (!isPaidResultJob(job)) return this.deny(job, "unsupported_delivery_job", false);

    let context: PaidDeliveryAuthorizationContext | null;
    try {
      context = await this.contexts.resolve(job);
    } catch {
      return this.deny(job, "authorization_unavailable", true);
    }
    if (!context) return this.deny(job, "authorization_context_missing", false);

    const decision = await this.eligibility.decide(context.eligibilityInput);
    if (!decision.allowed) {
      const failure = authorizationFailure(decision.code);
      return this.deny(job, failure.code, failure.retryable);
    }
    if (!authorizationMatchesJob(job, decision)) return this.deny(job, "authorization_job_mismatch", false);

    // Reload canonical data after the eligibility check. This narrows the time-of-check
    // window and refuses stale approved output if payment, recipient, approval or case changed.
    let latest: PaidDeliveryAuthorizationContext | null;
    try {
      latest = await this.contexts.resolve(job);
    } catch {
      return this.deny(job, "authorization_unavailable", true);
    }
    if (!latest || !sameApprovedResult(context.approvedResult, latest.approvedResult)) {
      return this.deny(job, "approved_content_changed", false);
    }
    const finalDecision = await this.eligibility.decide(latest.eligibilityInput);
    if (!finalDecision.allowed) {
      const failure = authorizationFailure(finalDecision.code);
      return this.deny(job, failure.code, failure.retryable);
    }
    if (!authorizationMatchesJob(job, finalDecision)) return this.deny(job, "authorization_job_mismatch", false);
    const reviewVersion = await this.contexts.getReviewVersion?.(latest.approvedResult.versionId);
    if (!reviewVersion || !assertApprovedResultMatches(latest.approvedResult, finalDecision, reviewVersion)) {
      return this.deny(job, "approved_content_binding_mismatch", false);
    }

    let acceptance: ProviderAcceptedPaidDelivery;
    try {
      acceptance = await this.provider.deliver({ idempotencyKey: job.jobId, job,
        approvedResult: latest.approvedResult, authorization: finalDecision });
      validateAcceptance(acceptance);
    } catch (error) {
      const retryable = !(error instanceof PaidDeliveryProviderError) || error.retryable;
      return this.deny(job, retryable ? "delivery_provider_unavailable" : "delivery_provider_rejected", retryable);
    }

    let receipt: PaidDeliveryReceipt;
    try {
      receipt = await this.receipts.record({
        jobId: job.jobId,
        caseId: job.caseId,
        resourceVersion: job.metadata.resourceVersion,
        destinationKey: job.metadata.destinationKey,
        provider: acceptance.provider,
        providerReference: acceptance.providerReference,
        acceptedAt: acceptance.acceptedAt,
      });
    } catch {
      return this.deny(job, "receipt_persistence_failed", true);
    }

    // The legacy outbox terminal state is named "delivered"; here it means the provider
    // acceptance receipt is durable, not that a mailbox delivery event was observed.
    await this.outbox.ack({ caseId: job.caseId, jobId: job.jobId, leaseToken: job.lease.token });
    return Object.freeze({ status: "provider_accepted", jobId: job.jobId, receipt });
  }

  private async deny(job: LeasedDeliveryJob, code: string, retryable: boolean): Promise<PaidResultDeliveryConsumerResult> {
    const result = await this.outbox.nack({
      caseId: job.caseId,
      jobId: job.jobId,
      leaseToken: job.lease.token,
      failure: { code, retryable },
    });
    return Object.freeze({
      status: result.state === "dead_letter" ? "dead_lettered" : "retry_scheduled",
      jobId: job.jobId,
      code,
    });
  }
}

function sameApprovedResult(left: ApprovedPaidResult, right: ApprovedPaidResult): boolean {
  return left.caseId === right.caseId && left.versionId === right.versionId
    && left.artifactDigest === right.artifactDigest && left.recipientEmail === right.recipientEmail
    && JSON.stringify(left.content) === JSON.stringify(right.content);
}

function isPaidResultJob(job: LeasedDeliveryJob): boolean {
  return job.metadata.channel === "internal_queue"
    && job.metadata.resourceKind === "case"
    && job.metadata.destinationKey === "journey-approved-result"
    && job.metadata.resourceId === job.caseId;
}

function authorizationMatchesJob(
  job: LeasedDeliveryJob,
  decision: Extract<PaidFulfillmentEligibilityDecision, { allowed: true }>,
): boolean {
  return decision.caseId === job.caseId
    && decision.caseId === job.metadata.resourceId
    && decision.versionId === job.metadata.resourceVersion
    && job.deduplicationKey === `release:${decision.orderId}:${decision.approvalId}`;
}

function authorizationFailure(code: string): { code: string; retryable: boolean } {
  switch (code) {
    case "dependency_unavailable": return { code: "authorization_unavailable", retryable: true };
    case "payment_not_verified": return { code: "payment_not_verified", retryable: false };
    case "review_denied": return { code: "review_not_authorized", retryable: false };
    case "case_persistence_mismatch": return { code: "case_version_mismatch", retryable: false };
    case "order_not_found": return { code: "order_missing", retryable: false };
    case "case_not_found": return { code: "case_missing", retryable: false };
    case "wrong_case": return { code: "authorization_job_mismatch", retryable: false };
    default: return { code: "authorization_configuration_invalid", retryable: false };
  }
}

function validateAcceptance(value: ProviderAcceptedPaidDelivery): void {
  if (!token(value.provider) || !token(value.providerReference) || !isStrictIsoDateTime(value.acceptedAt)) {
    // A malformed response may follow an accepted provider operation. Preserve
    // the same job idempotency key and retry instead of treating it as rejection.
    throw new PaidDeliveryProviderError(true);
  }
}

function token(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
}

function isStrictIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
