import type {
  ReleaseDecision,
  ReleaseDenialCode,
  ReleaseRequest,
  ReviewRepository,
  ReviewVersionRecord,
} from "./types.js";
import {
  isValidRecipientBinding,
  sameRecipient,
  sameVersionBindings,
} from "./validation.js";

export const PRODUCTION_REVIEW_REPOSITORY_REQUIREMENTS = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  appendOnlyAudit: true,
  caseBoundTransitions: true,
  generatedIdentifiers: true,
} as const);

/** Prevents the process-local review fake from being selected in production. */
export function assertDurableReviewRepository(
  repository: Pick<ReviewRepository, "capabilities">,
): void {
  const capabilities = repository.capabilities;
  if (
    capabilities.backendClass !== "durable-repository"
    || !capabilities.durable
    || !capabilities.appendOnlyAudit
    || !capabilities.caseBoundTransitions
    || !capabilities.generatedIdentifiers
  ) {
    throw new Error(
      "Production review repository must be durable, append-only, case-bound, and use generated identifiers",
    );
  }
}

export interface HumanReviewReleaseGateOptions {
  readonly now?: () => Date;
}

/** Produces an explicit, immutable decision and denies whenever safety state is incomplete. */
export class HumanReviewReleaseGate {
  private readonly now: () => Date;

  constructor(
    private readonly repository: ReviewRepository,
    options: HumanReviewReleaseGateOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  decide(request: ReleaseRequest): ReleaseDecision {
    const version = this.repository.getVersion(request.versionId);
    if (!version) return this.deny(request, "version_not_found");
    if (version.caseId !== request.caseId) return this.deny(request, "wrong_case");
    if (!isValidRecipientBinding(request.recipient)) {
      return this.deny(request, "recipient_binding_invalid");
    }
    if (!sameRecipient(version.recipient, request.recipient)) {
      return this.deny(request, "wrong_recipient");
    }

    const state = this.repository.getVersionState(version.versionId);
    if (!state) return this.deny(request, "version_not_found");
    if (state.status === "superseded") return this.deny(request, "superseded");
    if (this.repository.getCurrentVersionId(version.caseId) !== version.versionId) {
      return this.deny(request, "stale_version");
    }
    if (version.mock) return this.deny(request, "mock_content");
    if (version.riskLevel === "critical") return this.deny(request, "critical_risk");
    if (version.riskLevel === "unknown") return this.deny(request, "risk_unclassified");
    if (state.status === "rejected") return this.deny(request, "rejected");
    if (state.status !== "approved" || !state.approval) {
      return this.deny(request, "review_required");
    }

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
