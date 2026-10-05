import { createHash } from "node:crypto";
import type { JourneyCase, JourneyState } from "./journey-state-machine";
import type { ReviewRepository, ReviewVersionRecord, ReviewRiskLevel } from "./review/types";
import { InMemoryReviewRepository } from "./review/in-memory-review-repository";
import { assertDurableReviewRepository } from "./review/release-gate";
import { AsyncHumanReviewReleaseGate, type AsyncReviewReleaseReader } from "./review/async-release-gate";
import type { AsyncReviewMutationRepository } from "./review/postgres-review-writer";
import { requireVerifiedLaunchControlRuntime } from "./review/launch-control-runtime";
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
    evidence: caseData.evidence,
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

export type JourneyReviewRuntime = {
  reader: AsyncReviewReleaseReader;
  writer: AsyncReviewMutationRepository;
};

export interface JourneyReviewBridgeOptions {
  readonly repository?: ReviewRepository;
  readonly runtimeProvider?: () => Promise<JourneyReviewRuntime>;
  readonly requireDurable?: boolean;
}

export class JourneyReviewBridge {
  private readonly runtimeProvider: () => Promise<JourneyReviewRuntime>;
  private readonly requireDurable: boolean;

  constructor(options: JourneyReviewBridgeOptions = {}) {
    this.requireDurable = process.env.NODE_ENV === "production" || options.requireDurable === true || process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED === "true";
    if (options.runtimeProvider) {
      this.runtimeProvider = options.runtimeProvider;
    } else if (options.repository || !this.requireDurable) {
      const repository = options.repository ?? new InMemoryReviewRepository();
      this.runtimeProvider = async () => ({
        reader: {
          capabilities: repository.capabilities,
          getVersion: async (id) => repository.getVersion(id),
          getVersionState: async (id) => repository.getVersionState(id),
          getCurrentVersionId: async (id) => repository.getCurrentVersionId(id),
        },
        writer: {
          capabilities: repository.capabilities,
          createDraft: async (input) => repository.createDraft(input),
          createFinal: async (input) => repository.createFinal(input),
          approve: async (input) => repository.approve(input),
          reject: async (input) => repository.reject(input),
          supersede: async (input) => repository.supersede(input),
        },
      });
    } else {
      this.runtimeProvider = requireVerifiedLaunchControlRuntime;
    }
  }

  private async runtime(): Promise<JourneyReviewRuntime> {
    const runtime = await this.runtimeProvider();
    if (this.requireDurable) {
      assertDurableReviewRepository(runtime.reader);
      assertDurableReviewRepository(runtime.writer);
    }
    return runtime;
  }

  /**
   * Creates a draft review record when a journey case enters human_review.
   * Returns the version record if created, or undefined if the case already has one.
   */
  async createReviewForCase(caseData: JourneyCase): Promise<ReviewVersionRecord | undefined> {
    if (caseData.state !== "human_review" && caseData.state !== "escalation_required") {
      return undefined;
    }

    const { reader, writer } = await this.runtime();
    const existingVersionId = await reader.getCurrentVersionId(caseData.id);
    if (existingVersionId) {
      return await reader.getVersion(existingVersionId);
    }

    const version = await writer.createDraft({
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
  async finalizeReviewForCase(caseData: JourneyCase): Promise<ReviewVersionRecord | undefined> {
    const { reader, writer } = await this.runtime();
    const currentVersionId = await reader.getCurrentVersionId(caseData.id);
    if (!currentVersionId) return undefined;

    const state = await reader.getVersionState(currentVersionId);
    if (!state || state.status !== "draft") return undefined;

    const version = await writer.createFinal({
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
  async approveReview(caseId: string, reviewerRef: string, highRiskAcknowledged?: boolean) {
    const { reader, writer } = await this.runtime();
    const currentVersionId = await reader.getCurrentVersionId(caseId);
    if (!currentVersionId) {
      throw new Error("No pending review for this case");
    }

    const approval = await writer.approve({
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
  async rejectReview(caseId: string, reviewerRef: string, reasonCode: "insufficient_evidence" | "policy_mismatch" | "unsafe_content" | "other") {
    const { reader, writer } = await this.runtime();
    const currentVersionId = await reader.getCurrentVersionId(caseId);
    if (!currentVersionId) {
      throw new Error("No pending review for this case");
    }

    const rejection = await writer.reject({
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
  async checkReleaseAllowed(caseData: JourneyCase): Promise<{ allowed: boolean; reason?: string }> {
    const { reader } = await this.runtime();
    const currentVersionId = await reader.getCurrentVersionId(caseData.id);
    if (!currentVersionId) {
      return { allowed: false, reason: "No review record exists for this case" };
    }

    const version = await reader.getVersion(currentVersionId);
    if (!version || version.artifactDigest !== caseArtifactDigest(caseData)) {
      return { allowed: false, reason: "approval_binding_mismatch" };
    }
    const decision = await new AsyncHumanReviewReleaseGate(reader).decide({
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
  async getReviewStatus(caseId: string): Promise<JourneyReviewStatus | undefined> {
    const { reader } = await this.runtime();
    const currentVersionId = await reader.getCurrentVersionId(caseId);
    if (!currentVersionId) return undefined;

    const version = await reader.getVersion(currentVersionId);
    const state = await reader.getVersionState(currentVersionId);
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
}
