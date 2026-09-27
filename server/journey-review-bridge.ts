import { createHash } from "node:crypto";
import type { JourneyCase, JourneyState } from "./journey-state-machine";
import type {
  ReviewVersionRecord,
  ReviewRiskLevel,
  ReviewRejectionReason,
  ReleaseDecision,
  ReviewApprovalRecord,
  ReviewRejectionRecord,
} from "./review/types";
import type { DurableReviewRepository } from "./review/durable-review-repository";
import { AsyncHumanReviewReleaseGate } from "./review/async-release-gate";
import { buildFollowUpEvidenceBoundary, type FollowUpEvidenceBoundary } from "./follow-up-evidence-boundary";
import { logEvent } from "./observability/safe-log";

export type JourneyReviewStatus = {
  caseId: string;
  state: JourneyState;
  reviewVersionId?: string;
  reviewStatus?: "draft" | "review_required" | "approved" | "rejected" | "superseded";
  reviewerRef?: string;
  reviewedAt?: string;
  evidenceBoundary?: FollowUpEvidenceBoundary;
};

const JOURNEY_REVIEW_BINDINGS = Object.freeze({
  policyVersion: "journey-review-v1",
  modelVersion: "journey-guided-v1",
  evidenceVersion: "evidence-v1",
});

function caseArtifactDigest(caseData: JourneyCase): string {
  const payload = JSON.stringify({
    id: caseData.id,
    vehicleInfo: caseData.vehicleInfo,
    description: caseData.description,
    outcome: caseData.outcome,
    confidenceLevel: caseData.confidenceLevel,
    riskLevel: caseData.riskLevel,
    evidenceCount: caseData.evidence.length,
    safetyTriggered: caseData.safetyTriggered,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function riskLevelForReview(caseData: JourneyCase): ReviewRiskLevel {
  if (caseData.safetyTriggered) return "critical";
  if (caseData.riskLevel === "high") return "high";
  if (caseData.riskLevel === "medium") return "moderate";
  if (caseData.riskLevel === "low") return "low";
  return "unknown";
}

function recipientBinding(caseData: JourneyCase) {
  const email = caseData.customerEmail || caseData.customerId || caseData.id;
  const digest = createHash("sha256").update(email, "utf8").digest("hex");
  return {
    algorithm: "sha256" as const,
    digest,
    bindingVersion: "v1",
  };
}

/**
 * Raised when a journey review operation cannot be completed durably. The
 * bridge never falls back to process-local state, so callers must fail closed.
 */
export class JourneyReviewPersistenceError extends Error {
  readonly code = "JOURNEY_REVIEW_PERSISTENCE_UNAVAILABLE";
  readonly retryable = true;
  constructor() {
    super("Journey human-review state is not durably available");
    this.name = "JourneyReviewPersistenceError";
  }
}

export interface JourneyReviewBridgeOptions {
  /**
   * Durable review repository. There is deliberately no default: an omitted
   * repository must fail loudly rather than silently hold review state in
   * process memory, which would claim a persistence that never happened.
   */
  readonly repository: DurableReviewRepository;
}

export class JourneyReviewBridge {
  private readonly repository: DurableReviewRepository;
  private readonly releaseGate: AsyncHumanReviewReleaseGate;

  constructor(options: JourneyReviewBridgeOptions) {
    if (!options?.repository) {
      throw new JourneyReviewPersistenceError();
    }
    this.repository = options.repository;
    this.releaseGate = new AsyncHumanReviewReleaseGate(this.repository);
  }

  /**
   * Creates a draft review record when a journey case enters human_review.
   * Returns the version record if created, or undefined if the case already has one.
   */
  async createReviewForCase(caseData: JourneyCase): Promise<ReviewVersionRecord | undefined> {
    if (caseData.state !== "human_review" && caseData.state !== "escalation_required") {
      return undefined;
    }

    const existingVersionId = await this.read(() => this.repository.getCurrentVersionId(caseData.id));
    if (existingVersionId) {
      return this.read(() => this.repository.getVersion(existingVersionId));
    }

    const version = await this.write(() =>
      this.repository.createDraft({
        caseId: caseData.id,
        artifactDigest: caseArtifactDigest(caseData),
        recipient: recipientBinding(caseData),
        riskLevel: riskLevelForReview(caseData),
        ...JOURNEY_REVIEW_BINDINGS,
      }),
    );

    logEvent("journey.review_draft_created", {
      caseId: caseData.id,
      versionId: version.versionId,
      riskLevel: version.riskLevel,
    });

    return version;
  }

  /**
   * Promotes a draft to final review_required status.
   */
  async finalizeReviewForCase(caseData: JourneyCase): Promise<ReviewVersionRecord | undefined> {
    const currentVersionId = await this.read(() => this.repository.getCurrentVersionId(caseData.id));
    if (!currentVersionId) return undefined;

    const state = await this.read(() => this.repository.getVersionState(currentVersionId));
    if (!state || state.status !== "draft") return undefined;

    const version = await this.write(() =>
      this.repository.createFinal({
        caseId: caseData.id,
        sourceVersionId: currentVersionId,
        artifactDigest: caseArtifactDigest(caseData),
        recipient: recipientBinding(caseData),
        riskLevel: riskLevelForReview(caseData),
        ...JOURNEY_REVIEW_BINDINGS,
      }),
    );

    logEvent("journey.review_finalized", {
      caseId: caseData.id,
      versionId: version.versionId,
    });

    return version;
  }

  /**
   * Approves a journey case review.
   */
  async approveReview(
    caseId: string,
    reviewerRef: string,
    highRiskAcknowledged?: boolean,
  ): Promise<ReviewApprovalRecord> {
    const currentVersionId = await this.read(() => this.repository.getCurrentVersionId(caseId));
    if (!currentVersionId) {
      throw new Error("No pending review for this case");
    }

    const approval = await this.write(() =>
      this.repository.approve({ versionId: currentVersionId, caseId, reviewerRef, highRiskAcknowledged }),
    );

    logEvent("journey.review_approved", {
      caseId,
      versionId: currentVersionId,
      approvalId: approval.approvalId,
      reviewerRef,
    });

    return approval;
  }

  /**
   * Rejects a journey case review.
   */
  async rejectReview(
    caseId: string,
    reviewerRef: string,
    reasonCode: ReviewRejectionReason,
  ): Promise<ReviewRejectionRecord> {
    const currentVersionId = await this.read(() => this.repository.getCurrentVersionId(caseId));
    if (!currentVersionId) {
      throw new Error("No pending review for this case");
    }

    const rejection = await this.write(() =>
      this.repository.reject({ versionId: currentVersionId, caseId, reviewerRef, reasonCode }),
    );

    logEvent("journey.review_rejected", {
      caseId,
      versionId: currentVersionId,
      rejectionId: rejection.rejectionId,
      reviewerRef,
      reasonCode,
    });

    return rejection;
  }

  /**
   * Checks if a case can be released (resolved) via the review gate. Storage
   * failures throw rather than resolving into a denial or an approval.
   */
  async checkReleaseAllowed(caseData: JourneyCase): Promise<{ allowed: boolean; reason?: string }> {
    const currentVersionId = await this.read(() => this.repository.getCurrentVersionId(caseData.id));
    if (!currentVersionId) {
      return { allowed: false, reason: "No review record exists for this case" };
    }

    const decision: ReleaseDecision = await this.read(() =>
      this.releaseGate.decide({
        caseId: caseData.id,
        versionId: currentVersionId,
        recipient: recipientBinding(caseData),
        ...JOURNEY_REVIEW_BINDINGS,
      }),
    );

    return {
      allowed: decision.allowed,
      reason: decision.allowed ? undefined : decision.code,
    };
  }

  /**
   * Gets the current review status for a journey case.
   */
  async getReviewStatus(caseId: string): Promise<JourneyReviewStatus | undefined> {
    const currentVersionId = await this.read(() => this.repository.getCurrentVersionId(caseId));
    if (!currentVersionId) return undefined;

    const version = await this.read(() => this.repository.getVersion(currentVersionId));
    const state = await this.read(() => this.repository.getVersionState(currentVersionId));
    if (!version || !state) return undefined;

    return {
      caseId,
      state: "human_review",
      reviewVersionId: version.versionId,
      reviewStatus: state.status,
      reviewerRef: state.approval?.reviewerRef || state.rejection?.reviewerRef,
      reviewedAt: state.approval?.approvedAt || state.rejection?.rejectedAt,
    };
  }

  /**
   * Builds the evidence boundary for a case being resolved.
   */
  buildEvidenceBoundary(caseData: JourneyCase): FollowUpEvidenceBoundary {
    const photoStored = caseData.evidence.some((e) => e.kind === "photo" && e.status === "persisted");
    const audioStored = caseData.evidence.some((e) => e.kind === "audio" && e.status === "persisted");
    const videoStored = caseData.evidence.some((e) => e.kind === "video" && e.status === "persisted");
    const vibrationStored = caseData.evidence.some((e) => e.kind === "vibration");
    return buildFollowUpEvidenceBoundary({ photoStored, audioStored, videoStored, vibrationStored });
  }

  private async read<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new JourneyReviewPersistenceError();
    }
  }

  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof JourneyReviewPersistenceError) throw error;
      throw new JourneyReviewPersistenceError();
    }
  }
}
