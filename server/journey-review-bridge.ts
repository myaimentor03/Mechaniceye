import { createHash } from "node:crypto";
import type { JourneyCase, JourneyState } from "./journey-state-machine";
import type { ReviewRepository, ReviewVersionRecord, ReviewRiskLevel } from "./review/types";
import { InMemoryReviewRepository } from "./review/in-memory-review-repository";
import { HumanReviewReleaseGate } from "./review/release-gate";
import type { ReviewerIdentity } from "./reviewer-auth";
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

export interface JourneyReviewBridgeOptions {
  readonly repository?: ReviewRepository;
}

export class JourneyReviewBridge {
  private readonly repository: ReviewRepository;
  private readonly releaseGate: HumanReviewReleaseGate;

  constructor(options: JourneyReviewBridgeOptions = {}) {
    this.repository = options.repository ?? new InMemoryReviewRepository();
    this.releaseGate = new HumanReviewReleaseGate(this.repository);
  }

  /**
   * Creates a draft review record when a journey case enters human_review.
   * Returns the version record if created, or undefined if the case already has one.
   */
  createReviewForCase(caseData: JourneyCase): ReviewVersionRecord | undefined {
    if (caseData.state !== "human_review" && caseData.state !== "escalation_required") {
      return undefined;
    }

    const existingVersionId = this.repository.getCurrentVersionId(caseData.id);
    if (existingVersionId) {
      return this.repository.getVersion(existingVersionId);
    }

    const version = this.repository.createDraft({
      caseId: caseData.id,
      artifactDigest: caseArtifactDigest(caseData),
      recipient: recipientBinding(caseData),
      riskLevel: riskLevelForReview(caseData),
      ...JOURNEY_REVIEW_BINDINGS,
    });

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
  finalizeReviewForCase(caseData: JourneyCase): ReviewVersionRecord | undefined {
    const currentVersionId = this.repository.getCurrentVersionId(caseData.id);
    if (!currentVersionId) return undefined;

    const state = this.repository.getVersionState(currentVersionId);
    if (!state || state.status !== "draft") return undefined;

    const version = this.repository.createFinal({
      caseId: caseData.id,
      sourceVersionId: currentVersionId,
      artifactDigest: caseArtifactDigest(caseData),
      recipient: recipientBinding(caseData),
      riskLevel: riskLevelForReview(caseData),
      ...JOURNEY_REVIEW_BINDINGS,
    });

    logEvent("journey.review_finalized", {
      caseId: caseData.id,
      versionId: version.versionId,
    });

    return version;
  }

  /**
   * Approves a journey case review.
   */
  approveReview(caseId: string, reviewerRef: string, highRiskAcknowledged?: boolean) {
    const currentVersionId = this.repository.getCurrentVersionId(caseId);
    if (!currentVersionId) {
      throw new Error("No pending review for this case");
    }

    const approval = this.repository.approve({
      versionId: currentVersionId,
      caseId,
      reviewerRef,
      highRiskAcknowledged,
    });

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
  rejectReview(caseId: string, reviewerRef: string, reasonCode: "insufficient_evidence" | "policy_mismatch" | "unsafe_content" | "other") {
    const currentVersionId = this.repository.getCurrentVersionId(caseId);
    if (!currentVersionId) {
      throw new Error("No pending review for this case");
    }

    const rejection = this.repository.reject({
      versionId: currentVersionId,
      caseId,
      reviewerRef,
      reasonCode,
    });

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
   * Checks if a case can be released (resolved) via the review gate.
   */
  checkReleaseAllowed(caseData: JourneyCase): { allowed: boolean; reason?: string } {
    const currentVersionId = this.repository.getCurrentVersionId(caseData.id);
    if (!currentVersionId) {
      return { allowed: false, reason: "No review record exists for this case" };
    }

    const decision = this.releaseGate.decide({
      caseId: caseData.id,
      versionId: currentVersionId,
      recipient: recipientBinding(caseData),
      ...JOURNEY_REVIEW_BINDINGS,
    });

    return {
      allowed: decision.allowed,
      reason: decision.allowed ? undefined : decision.code,
    };
  }

  /**
   * Gets the current review status for a journey case.
   */
  getReviewStatus(caseId: string): JourneyReviewStatus | undefined {
    const currentVersionId = this.repository.getCurrentVersionId(caseId);
    if (!currentVersionId) return undefined;

    const version = this.repository.getVersion(currentVersionId);
    const state = this.repository.getVersionState(currentVersionId);
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
   * Lists all cases pending human review.
   */
  listPendingReviews(): string[] {
    const pending: string[] = [];
    for (const [caseId] of (this.repository as any).currentVersionByCase || new Map()) {
      const state = this.repository.getVersionState(
        (this.repository as any).currentVersionByCase.get(caseId)
      );
      if (state && (state.status === "review_required" || state.status === "draft")) {
        pending.push(caseId);
      }
    }
    return pending;
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
}
