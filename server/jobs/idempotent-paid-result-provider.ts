import type { ApprovedPaidResult } from "./paid-delivery-context.js";
import type { ConfirmedPaidDelivery, PaidResultDeliveryProvider } from "./paid-result-delivery-consumer.js";
import type { PaidFulfillmentEligibilityDecision } from "../commerce/paid-fulfillment-eligibility.js";
import type { LeasedDeliveryJob } from "./delivery-outbox.js";

export interface PaidResultDeliveryTransport {
  readonly provider: string;
  /** Must represent provider-enforced, durable idempotency across independent processes. */
  readonly capabilities: Readonly<{ idempotencyEnforcedByProvider: boolean }>;
  send(input: Readonly<{
    idempotencyKey: string;
    recipient: string;
    approvedResult: ApprovedPaidResult;
    caseId: string;
    versionId: string;
    approvalId: string;
  }>): Promise<Readonly<{ providerReference: string; confirmedAt: string }>>;
}

/** Adapter only. The transport and its provider idempotency contract must be separately verified. */
export class IdempotentPaidResultDeliveryProvider implements PaidResultDeliveryProvider {
  readonly capabilities = Object.freeze({ backendClass: "idempotent-provider" as const, idempotentByKey: true });

  constructor(private readonly transport: PaidResultDeliveryTransport) {
    if (!transport.capabilities.idempotencyEnforcedByProvider) {
      throw new TypeError("Provider must enforce durable idempotency keys");
    }
  }

  async deliver(input: Readonly<{
    idempotencyKey: string;
    job: LeasedDeliveryJob;
    approvedResult: ApprovedPaidResult;
    authorization: Extract<PaidFulfillmentEligibilityDecision, { allowed: true }>;
  }>): Promise<ConfirmedPaidDelivery> {
    const { approvedResult, authorization } = input;
    if (approvedResult.caseId !== authorization.caseId || approvedResult.versionId !== authorization.versionId
      || !approvedResult.recipientEmail || approvedResult.artifactDigest.length !== 64) {
      throw new TypeError("Approved result binding is invalid");
    }
    const response = await this.transport.send({
      idempotencyKey: input.idempotencyKey,
      recipient: approvedResult.recipientEmail,
      approvedResult,
      caseId: authorization.caseId,
      versionId: authorization.versionId,
      approvalId: authorization.approvalId,
    });
    return Object.freeze({ provider: this.transport.provider,
      providerReference: response.providerReference, confirmedAt: response.confirmedAt });
  }
}
