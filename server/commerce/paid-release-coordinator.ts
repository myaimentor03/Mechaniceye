import type { CommerceOrder } from "./order-contract.js";
import type { ReviewTransaction, ReviewTransactionExecutor } from "../review/postgres-review-writer.js";
import { PostgresReviewReleaseReader } from "../review/postgres-review-release-reader.js";
import { AsyncHumanReviewReleaseGate } from "../review/async-release-gate.js";
import { createPgJourneyStore } from "../journey-store-pg.js";
import { caseArtifactDigest, recipientBinding } from "../journey-review-bridge.js";
import { PostgresCommerceOrderRepository, transactionOutbox, PAYMENT_RETRY_POLICY } from "./postgres-commerce-order-repository.js";

// No environment flag can assert validation that this checkout has not performed.
export const POSTGRES_PAYMENT_VALIDATION = Object.freeze({ verified: false,
  blocker: "Real Postgres restart, replay, rollback and approved-release validation has not been completed" });
export type PaidApprovalProof = Readonly<{ approvalId: string; versionId: string }>;
export type ApprovalVerifier = (tx: ReviewTransaction, order: CommerceOrder) => Promise<PaidApprovalProof | null>;

export async function verifyPaidApproval(tx: ReviewTransaction, order: CommerceOrder): Promise<PaidApprovalProof | null> {
  // Same advisory lock as the review writer, plus durable case and current-head locks.
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [order.caseId]);
  await tx.query("select id from journey_cases where id=$1 for update", [order.caseId]);
  await tx.query("select version_id from drivable_review_case_heads where case_id=$1 for update", [order.caseId]);
  const caseData = await createPgJourneyStore({ query: (text, values) => tx.query(text, values) }).getStrict(order.caseId);
  if (!caseData?.customerId || !Number.isFinite(Date.parse(caseData.updatedAt))) return null;
  const reader = new PostgresReviewReleaseReader(tx);
  const id = await reader.getCurrentVersionId(order.caseId);
  if (!id) return null;
  const version = await reader.getVersion(id);
  if (!version || version.stage !== "final") return null;
  // Conservative freshness: a changed case/evidence needs a new final version.
  if (Date.parse(caseData.updatedAt) > Date.parse(version.createdAt)) return null;
  if (version.artifactDigest !== caseArtifactDigest(caseData)
    || version.recipient.digest !== recipientBinding(caseData).digest) return null;
  const approval = await new AsyncHumanReviewReleaseGate(reader).decide({ versionId: version.versionId,
    caseId: order.caseId, policyVersion: version.policyVersion, modelVersion: version.modelVersion,
    evidenceVersion: version.evidenceVersion, recipient: version.recipient });
  return approval.allowed ? { approvalId: approval.approvalId, versionId: approval.versionId } : null;
}

/** Queue permission is separate from payment entitlement; no external delivery is performed here. */
export class PaidReleaseCoordinator {
  constructor(private readonly executor: ReviewTransaction & ReviewTransactionExecutor,
    private readonly validated: () => boolean = () => POSTGRES_PAYMENT_VALIDATION.verified,
    private readonly verifyApproval: ApprovalVerifier = verifyPaidApproval) {}
  async dispatch(orderId: string) {
    if (!this.validated()) return { queued: false, code: "postgres_validation_required" } as const;
    return this.executor.transaction(async tx => {
      await tx.query("select snapshot from drivable_commerce_orders where order_id=$1 for update", [orderId]);
      const repository = new PostgresCommerceOrderRepository({ query: tx.query.bind(tx), transaction: work => work(tx) });
      const order = await repository.get(orderId);
      if (!order || !await repository.hasVerifiedPayment(orderId)) return { queued: false, code: "payment_not_verified" } as const;
      const approval = await this.verifyApproval(tx, order);
      if (!approval) return { queued: false, code: "human_approval_required" } as const;
      const delivery = await transactionOutbox(tx).enqueue({ caseId: order.caseId,
        deduplicationKey: `release:${orderId}:${approval.approvalId}`,
        metadata: { resourceKind: "case", resourceId: order.caseId, resourceVersion: approval.versionId,
          destinationKey: "journey-approved-result", channel: "internal_queue" }, retryPolicy: PAYMENT_RETRY_POLICY });
      return { queued: true, code: "approved_release_queued", delivery } as const;
    });
  }
}
