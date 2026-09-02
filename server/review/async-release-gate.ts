import type {
  ReleaseDecision,
  ReleaseDenialCode,
  ReleaseRequest,
  ReviewRepositoryCapabilities,
  ReviewVersionRecord,
  ReviewVersionState,
} from "./types.js";
import { isValidRecipientBinding, sameRecipient, sameVersionBindings } from "./validation.js";

export interface AsyncReviewReleaseReader {
  readonly capabilities: ReviewRepositoryCapabilities;
  getVersion(versionId: string): Promise<ReviewVersionRecord | undefined>;
  getVersionState(versionId: string): Promise<ReviewVersionState | undefined>;
  getCurrentVersionId(caseId: string): Promise<string | undefined>;
}

export class ReviewReleaseReadError extends Error {
  readonly code = "review_release_read_failed";
  readonly retryable = true;

  constructor() {
    super("Human-review release state could not be verified");
    this.name = "ReviewReleaseReadError";
  }
}

export interface AsyncHumanReviewReleaseGateOptions {
  readonly now?: () => Date;
}

/** Production-shaped release gate. Storage errors throw and must never be converted to release approval. */
export class AsyncHumanReviewReleaseGate {
  private readonly now: () => Date;

  constructor(
    private readonly repository: AsyncReviewReleaseReader,
    options: AsyncHumanReviewReleaseGateOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async decide(request: ReleaseRequest): Promise<ReleaseDecision> {
    let version: ReviewVersionRecord | undefined;
    let state: ReviewVersionState | undefined;
    let currentVersionId: string | undefined;
    try {
      version = await this.repository.getVersion(request.versionId);
      if (!version) return this.deny(request, "version_not_found");
      if (version.caseId !== request.caseId) return this.deny(request, "wrong_case");
      if (!isValidRecipientBinding(request.recipient)) return this.deny(request, "recipient_binding_invalid");
      if (!sameRecipient(version.recipient, request.recipient)) return this.deny(request, "wrong_recipient");
      [state, currentVersionId] = await Promise.all([
        this.repository.getVersionState(version.versionId),
        this.repository.getCurrentVersionId(version.caseId),
      ]);
    } catch {
      throw new ReviewReleaseReadError();
    }

    if (!state) return this.deny(request, "version_not_found");
    if (state.status === "superseded") return this.deny(request, "superseded");
    if (currentVersionId !== version.versionId) return this.deny(request, "stale_version");
    if (version.mock) return this.deny(request, "mock_content");
    if (version.riskLevel === "critical") return this.deny(request, "critical_risk");
    if (version.riskLevel === "unknown") return this.deny(request, "risk_unclassified");
    if (state.status === "rejected") return this.deny(request, "rejected");
    if (state.status !== "approved" || !state.approval) return this.deny(request, "review_required");

    const approval = state.approval;
    if (
      !sameVersionBindings(version, request)
      || !sameVersionBindings(approval, request)
      || approval.recipientIdentityDigest !== request.recipient.digest
      || approval.recipientBindingVersion !== request.recipient.bindingVersion
      || approval.riskLevel !== version.riskLevel
    ) {
      return this.deny(request, "approval_binding_mismatch");
    }
    if (version.riskLevel === "high" && !approval.highRiskAcknowledged) {
      return this.deny(request, "high_risk_acknowledgement_required");
    }

    return Object.freeze({
      allowed: true,
      code: "release_allowed",
      versionId: version.versionId,
      caseId: version.caseId,
      approvalId: approval.approvalId,
      evaluatedAt: this.timestamp(),
    });
  }

  private deny(request: ReleaseRequest, code: ReleaseDenialCode): ReleaseDecision {
    return Object.freeze({
      allowed: false,
      code,
      versionId: request.versionId,
      caseId: request.caseId,
      evaluatedAt: this.timestamp(),
    });
  }

  private timestamp(): string {
    const value = this.now();
    return Number.isNaN(value.getTime()) ? new Date(0).toISOString() : value.toISOString();
  }
}
