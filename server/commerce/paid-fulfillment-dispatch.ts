import type { DeliveryOutboxRepository, EnqueueDeliveryResult } from "../jobs/delivery-outbox.js";
import type { PaidFulfillmentEligibilityInput, PaidFulfillmentEligibilityService } from "./paid-fulfillment-eligibility.js";

export type PaidFulfillmentDispatchResult = Readonly<{
  eligibility: Awaited<ReturnType<PaidFulfillmentEligibilityService["decide"]>>;
  delivery?: EnqueueDeliveryResult;
}>;

/**
 * Joins verified commerce, durable Journey persistence, human approval, and
 * idempotent delivery. A queued result is returned only after the eligibility
 * gate allows the exact persisted case and approved review version.
 */
export class PaidFulfillmentDispatcher {
  constructor(
    private readonly eligibility: PaidFulfillmentEligibilityService,
    private readonly outbox: DeliveryOutboxRepository,
  ) {}

  async dispatch(input: PaidFulfillmentEligibilityInput): Promise<PaidFulfillmentDispatchResult> {
    const eligibility = await this.eligibility.decide(input);
    if (!eligibility.allowed) return Object.freeze({ eligibility });

    const delivery = await this.outbox.enqueue({
      caseId: eligibility.caseId,
      deduplicationKey: `paid:${eligibility.orderId}:${eligibility.approvalId}`,
      metadata: {
        resourceKind: "case",
        resourceId: eligibility.caseId,
        resourceVersion: eligibility.versionId,
        destinationKey: "journey-approved-result",
        channel: "internal_queue",
      },
      retryPolicy: {
        maxAttempts: 5,
        initialRetryDelayMs: 1_000,
        backoffMultiplier: 2,
        maxRetryDelayMs: 30_000,
        leaseDurationMs: 60_000,
      },
    });
    return Object.freeze({ eligibility, delivery });
  }
}
