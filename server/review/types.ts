export const REVIEW_STATUSES = [
  "draft",
  "review_required",
  "approved",
  "rejected",
  "superseded",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type ReviewStage = "draft" | "final";
export type ReviewRiskLevel = "low" | "moderate" | "high" | "critical" | "unknown";

/** A one-way recipient binding. Plaintext recipient data does not belong in review records. */
export interface RecipientIdentityBinding {
  readonly algorithm: "sha256";
  readonly digest: string;
  readonly bindingVersion: string;
}

export interface ReviewVersionBindings {
  readonly policyVersion: string;
  readonly modelVersion: string;
  readonly evidenceVersion: string;
}

export interface ReviewVersionRecord extends ReviewVersionBindings {
  readonly versionId: string;
  readonly caseId: string;
  readonly stage: ReviewStage;
  readonly status: "draft" | "review_required";
  readonly artifactDigest: string;
  readonly recipient: RecipientIdentityBinding;
  readonly riskLevel: ReviewRiskLevel;
  readonly mock: boolean;
  readonly createdAt: string;
  readonly sourceVersionId?: string;
}

export interface ReviewApprovalRecord extends ReviewVersionBindings {
  readonly approvalId: string;
  readonly versionId: string;
  readonly caseId: string;
  readonly reviewerRef: string;
  readonly approvedAt: string;
  readonly recipientIdentityDigest: string;
  readonly recipientBindingVersion: string;
  readonly riskLevel: ReviewRiskLevel;
  readonly highRiskAcknowledged: boolean;
}

export interface ReviewRejectionRecord {
  readonly rejectionId: string;
  readonly versionId: string;
  readonly caseId: string;
  readonly reviewerRef: string;
  readonly rejectedAt: string;
  readonly reasonCode: ReviewRejectionReason;
}

export type ReviewRejectionReason =
  | "insufficient_evidence"
  | "policy_mismatch"
  | "unsafe_content"
  | "other";

export interface ReviewSupersessionRecord {
  readonly supersessionId: string;
  readonly versionId: string;
  readonly caseId: string;
  readonly supersededAt: string;
  readonly supersededByVersionId?: string;
}

export interface ReviewVersionState {
  readonly version: ReviewVersionRecord;
  readonly status: ReviewStatus;
  readonly approval?: ReviewApprovalRecord;
  readonly rejection?: ReviewRejectionRecord;
  readonly supersession?: ReviewSupersessionRecord;
}

export interface CreateReviewVersionInput extends ReviewVersionBindings {
  readonly caseId: string;
  readonly artifactDigest: string;
  readonly recipient: RecipientIdentityBinding;
  readonly riskLevel: ReviewRiskLevel;
  readonly mock?: boolean;
}

export interface CreateFinalReviewVersionInput extends CreateReviewVersionInput {
  readonly sourceVersionId: string;
}

export interface ApproveReviewVersionInput {
  readonly versionId: string;
  readonly caseId: string;
  readonly reviewerRef: string;
  readonly highRiskAcknowledged?: boolean;
}

export interface RejectReviewVersionInput {
  readonly versionId: string;
  readonly caseId: string;
  readonly reviewerRef: string;
  readonly reasonCode: ReviewRejectionReason;
}

export interface SupersedeReviewVersionInput {
  readonly versionId: string;
  readonly caseId: string;
}

export interface ReviewRepositoryCapabilities {
  readonly backendClass: "durable-repository" | "ephemeral-test-double";
  readonly durable: boolean;
  readonly appendOnlyAudit: boolean;
  readonly caseBoundTransitions: boolean;
  readonly generatedIdentifiers: boolean;
}

export interface ReviewRepository {
  readonly capabilities: ReviewRepositoryCapabilities;
  createDraft(input: CreateReviewVersionInput): ReviewVersionRecord;
  createFinal(input: CreateFinalReviewVersionInput): ReviewVersionRecord;
  approve(input: ApproveReviewVersionInput): ReviewApprovalRecord;
  reject(input: RejectReviewVersionInput): ReviewRejectionRecord;
  supersede(input: SupersedeReviewVersionInput): ReviewSupersessionRecord;
  getVersion(versionId: string): ReviewVersionRecord | undefined;
  getVersionState(versionId: string): ReviewVersionState | undefined;
  getCurrentVersionId(caseId: string): string | undefined;
}

export interface ReleaseRequest extends ReviewVersionBindings {
  readonly versionId: string;
  readonly caseId: string;
  readonly recipient: RecipientIdentityBinding;
}

export type ReleaseDenialCode =
  | "version_not_found"
  | "wrong_case"
  | "wrong_recipient"
  | "recipient_binding_invalid"
  | "stale_version"
  | "superseded"
  | "mock_content"
  | "critical_risk"
  | "risk_unclassified"
  | "review_required"
  | "rejected"
  | "approval_binding_mismatch"
  | "high_risk_acknowledgement_required";

export type ReleaseDecision =
  | {
    readonly allowed: true;
    readonly code: "release_allowed";
    readonly versionId: string;
    readonly caseId: string;
    readonly approvalId: string;
    readonly evaluatedAt: string;
  }
  | {
    readonly allowed: false;
    readonly code: ReleaseDenialCode;
    readonly versionId: string;
    readonly caseId: string;
    readonly evaluatedAt: string;
  };
