import type { CommerceOrderRepository, CommerceOrder } from "../commerce/order-contract.js";
import type { PaidCasePersistenceRepository, PaidFulfillmentEligibilityInput } from "../commerce/paid-fulfillment-eligibility.js";
import { JOURNEY_REVIEW_BINDINGS, caseArtifactDigest, recipientBinding } from "../journey-review-bridge.js";
import type { JourneyCase } from "../journey-state-machine.js";
import type { AsyncReviewReleaseReader } from "../review/async-release-gate.js";
import { AsyncHumanReviewReleaseGate } from "../review/async-release-gate.js";
import type { RecipientIdentityBinding, ReviewVersionRecord } from "../review/types.js";
import type { DeliveryOutboxRepository, LeasedDeliveryJob } from "./delivery-outbox.js";
import type { PaidDeliveryAuthorizationContextResolver } from "./paid-result-delivery-consumer.js";
import { decideConsentAuthorization, type ConsentEventV1, type ConsentSubject } from "../../shared/consent/index.js";
import { intakeConsentPolicyFromEnvironment } from "../consent/intake-consent.js";

export type ApprovedPaidResult = Readonly<{
  caseId: string;
  versionId: string;
  artifactDigest: string;
  recipientEmail: string;
  content: Readonly<{
    vehicleInfo: string;
    description: string;
    outcome: JourneyCase["outcome"];
    confidenceLevel: JourneyCase["confidenceLevel"];
    confidenceScore: number;
    riskLevel: JourneyCase["riskLevel"];
    decisionPath: JourneyCase["decisionPath"];
    matchedSymptomCategories: JourneyCase["matchedSymptomCategories"];
    safetyFlags: JourneyCase["safetyFlags"];
    safetyTriggered: boolean;
    evidence: readonly Readonly<{ kind: string; description?: string; status?: string; addedAt: string }>[];
  }>;
}>;

export type PaidDeliveryAuthorizationContext = Readonly<{
  eligibilityInput: PaidFulfillmentEligibilityInput;
  approvedResult: ApprovedPaidResult;
}>;

export interface StrictPaidJourneyCaseReader {
  getStrict(caseId: string): Promise<JourneyCase | undefined>;
}

export type PaidDeliveryContextRepositories = Readonly<{
  orders: CommerceOrderRepository & { hasVerifiedPayment(orderId: string): Promise<boolean> };
  cases: StrictPaidJourneyCaseReader;
  reviews: AsyncReviewReleaseReader;
  consent: Readonly<{ listForSubject(subject: ConsentSubject): Promise<readonly ConsentEventV1[]> }>;
  outbox: Pick<DeliveryOutboxRepository, "capabilities">;
}>;

/** Canonical durable case adapter used by the last-moment eligibility gate. */
export function createJourneyPaidCasePersistenceRepository(
  cases: StrictPaidJourneyCaseReader,
): PaidCasePersistenceRepository {
  return Object.freeze({
    capabilities: Object.freeze({ backendClass: "durable-repository", durable: true, caseBound: true, versionedPersistence: true }),
    async getPersistence(caseId: string) {
      const current = await cases.getStrict(caseId);
      if (!current) return null;
      const persistenceVersion = caseArtifactDigest(current);
      if (!/^[a-f0-9]{64}$/.test(persistenceVersion) || !strictIso(current.updatedAt)) return null;
      return Object.freeze({ caseId: current.id, persistenceVersion,
        evidenceVersion: JOURNEY_REVIEW_BINDINGS.evidenceVersion, state: "persisted" as const, persistedAt: current.updatedAt });
    },
  });
}

/** Resolves every dispatch from current canonical order, case and review repositories. */
export class DurablePaidDeliveryContextResolver implements PaidDeliveryAuthorizationContextResolver {
  constructor(
    private readonly repositories: PaidDeliveryContextRepositories,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async resolve(job: LeasedDeliveryJob): Promise<PaidDeliveryAuthorizationContext | null> {
    const release = parseReleaseKey(job.deduplicationKey);
    if (!release || job.metadata.resourceId !== job.caseId || job.metadata.resourceVersion.length === 0) return null;

    const [order, caseData, currentVersionId, version] = await Promise.all([
      this.repositories.orders.get(release.orderId),
      this.repositories.cases.getStrict(job.caseId),
      this.repositories.reviews.getCurrentVersionId(job.caseId),
      this.repositories.reviews.getVersion(job.metadata.resourceVersion),
    ]);
    if (!order || !caseData || !version) return null;
    // The authenticated case owner is the actor/account identity used by intake.
    // Missing identity or current consent fails closed; the queue snapshot grants
    // no authority to deliver customer content.
    if (!caseData.customerId) return null;
    const subject: ConsentSubject = Object.freeze({
      actorId: caseData.customerId,
      accountId: caseData.customerId,
      caseId: caseData.id,
    });
    const consentEvents = await this.repositories.consent.listForSubject(subject);
    const consentDecision = decideConsentAuthorization({
      events: consentEvents,
      subject,
      action: { kind: "fulfill_service" },
      config: intakeConsentPolicyFromEnvironment(this.env),
    });
    if (!consentDecision.allowed) return null;
    if (!orderMatches(order, release.orderId, job.caseId)
      || !await this.repositories.orders.hasVerifiedPayment(order.orderId)) return null;
    if (currentVersionId !== version.versionId || version.caseId !== job.caseId || version.stage !== "final") return null;

    const digest = caseArtifactDigest(caseData);
    const recipient: RecipientIdentityBinding = recipientBinding(caseData);
    if (digest !== version.artifactDigest || !caseData.customerEmail
      || recipient.digest !== version.recipient.digest
      || recipient.bindingVersion !== version.recipient.bindingVersion) return null;

    const releaseDecision = await new AsyncHumanReviewReleaseGate(this.repositories.reviews).decide({
      versionId: version.versionId,
      caseId: caseData.id,
      policyVersion: version.policyVersion,
      modelVersion: version.modelVersion,
      evidenceVersion: version.evidenceVersion,
      recipient,
    });
    if (!releaseDecision.allowed || releaseDecision.approvalId !== release.approvalId) return null;

    const eligibilityInput: PaidFulfillmentEligibilityInput = Object.freeze({
      orderId: order.orderId,
      caseId: caseData.id,
      casePersistenceVersion: digest,
      versionId: version.versionId,
      policyVersion: version.policyVersion,
      modelVersion: version.modelVersion,
      evidenceVersion: version.evidenceVersion,
      recipient,
    });
    const approvedResult: ApprovedPaidResult = Object.freeze({
      caseId: caseData.id,
      versionId: version.versionId,
      artifactDigest: digest,
      recipientEmail: caseData.customerEmail,
      content: Object.freeze({
        vehicleInfo: caseData.vehicleInfo,
        description: caseData.description,
        outcome: caseData.outcome,
        confidenceLevel: caseData.confidenceLevel,
        confidenceScore: caseData.confidenceScore,
        riskLevel: caseData.riskLevel,
        decisionPath: caseData.decisionPath,
        matchedSymptomCategories: caseData.matchedSymptomCategories,
        safetyFlags: caseData.safetyFlags,
        safetyTriggered: caseData.safetyTriggered,
        evidence: Object.freeze(caseData.evidence.map(item => Object.freeze({
          kind: item.kind, description: item.description, status: item.status, addedAt: item.addedAt,
        }))),
      }),
    });
    return Object.freeze({ eligibilityInput, approvedResult });
  }

  getReviewVersion(versionId: string): Promise<ReviewVersionRecord | undefined> {
    return this.repositories.reviews.getVersion(versionId);
  }
}

export function assertApprovedResultMatches(
  result: ApprovedPaidResult,
  authorization: Extract<import("../commerce/paid-fulfillment-eligibility.js").PaidFulfillmentEligibilityDecision, { allowed: true }>,
  version: ReviewVersionRecord,
): boolean {
  return result.caseId === authorization.caseId
    && result.versionId === authorization.versionId
    && result.versionId === version.versionId
    && result.artifactDigest === version.artifactDigest
    && result.recipientEmail.length > 0;
}

function parseReleaseKey(value: string): { orderId: string; approvalId: string } | null {
  const match = /^release:([A-Za-z0-9][A-Za-z0-9._-]{0,127}):([A-Za-z0-9][A-Za-z0-9_-]{0,127})$/.exec(value);
  return match ? { orderId: match[1], approvalId: match[2] } : null;
}

function orderMatches(order: CommerceOrder, orderId: string, caseId: string): boolean {
  return order.orderId === orderId && order.caseId === caseId && order.state === "verified"
    && order.provider !== null && (order.refundedAmountMinor ?? 0) === 0;
}

function strictIso(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
