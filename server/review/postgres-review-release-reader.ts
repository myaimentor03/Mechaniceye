import type { AsyncReviewReleaseReader } from "./async-release-gate.js";
import type {
  ReviewApprovalRecord,
  ReviewRejectionRecord,
  ReviewRepositoryCapabilities,
  ReviewRiskLevel,
  ReviewSupersessionRecord,
  ReviewVersionRecord,
  ReviewVersionState,
} from "./types.js";
import {
  assertArtifactDigest,
  assertRecipientBinding,
  assertReviewerRef,
  assertSafeId,
  assertVersionBindings,
} from "./validation.js";

export interface ReviewSqlExecutor {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export class ReviewReadRepositoryError extends Error {
  readonly code = "review_storage_unavailable";
  readonly retryable = true;
  constructor() {
    super("Human-review state could not be loaded");
    this.name = "ReviewReadRepositoryError";
  }
}

export const POSTGRES_REVIEW_READER_CAPABILITIES: ReviewRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  appendOnlyAudit: true,
  caseBoundTransitions: true,
  generatedIdentifiers: true,
});

type ReviewRow = Record<string, unknown>;

export class PostgresReviewReleaseReader implements AsyncReviewReleaseReader {
  readonly capabilities = POSTGRES_REVIEW_READER_CAPABILITIES;
  constructor(private readonly executor: ReviewSqlExecutor) {}

  async getVersion(versionId: string): Promise<ReviewVersionRecord | undefined> {
    assertSafeId(versionId, "versionId");
    const rows = await this.safeQuery<ReviewRow>(
      `select version_id, case_id, stage, initial_status, artifact_digest,
              recipient_digest, recipient_binding_version, policy_version,
              model_version, evidence_version, risk_level, mock,
              source_version_id, created_at
         from drivable_review_versions where version_id = $1`,
      [versionId],
    );
    return rows[0] ? parseVersion(rows[0]) : undefined;
  }

  async getVersionState(versionId: string): Promise<ReviewVersionState | undefined> {
    assertSafeId(versionId, "versionId");
    const version = await this.getVersion(versionId);
    if (!version) return undefined;
    const rows = await this.safeQuery<ReviewRow>(
      `select a.approval_id, a.reviewer_ref as approval_reviewer_ref,
              a.approved_at, a.policy_version as approval_policy_version,
              a.model_version as approval_model_version,
              a.evidence_version as approval_evidence_version,
              a.recipient_digest as approval_recipient_digest,
              a.recipient_binding_version as approval_recipient_binding_version,
              a.risk_level as approval_risk_level, a.high_risk_acknowledged,
              r.rejection_id, r.reviewer_ref as rejection_reviewer_ref,
              r.rejected_at, r.reason_code,
              s.supersession_id, s.superseded_at, s.superseded_by_version_id
         from drivable_review_versions v
         left join drivable_review_approvals a on a.version_id = v.version_id
         left join drivable_review_rejections r on r.version_id = v.version_id
         left join drivable_review_supersessions s on s.version_id = v.version_id
        where v.version_id = $1`,
      [versionId],
    );
    const row = rows[0] ?? {};
    const approval = row.approval_id ? parseApproval(row, version) : undefined;
    const rejection = row.rejection_id ? parseRejection(row, version) : undefined;
    const supersession = row.supersession_id ? parseSupersession(row, version) : undefined;
    if ([approval, rejection, supersession].filter(Boolean).length > 1) throw new ReviewReadRepositoryError();
    const status = supersession ? "superseded" : rejection ? "rejected" : approval ? "approved" : version.status;
    return Object.freeze({ version, status, approval, rejection, supersession });
  }

  async getCurrentVersionId(caseId: string): Promise<string | undefined> {
    assertSafeId(caseId, "caseId");
    const rows = await this.safeQuery<{ version_id: unknown }>(
      `select version_id from drivable_review_case_heads where case_id = $1`,
      [caseId],
    );
    if (!rows[0]) return undefined;
    const versionId = text(rows[0].version_id, "versionId");
    assertSafeId(versionId, "versionId");
    return versionId;
  }

  private async safeQuery<Row>(query: string, values: readonly unknown[]): Promise<Row[]> {
    try {
      return (await this.executor.query<Row>(query, values)).rows;
    } catch (error) {
      if (error instanceof ReviewReadRepositoryError) throw error;
      throw new ReviewReadRepositoryError();
    }
  }
}

function parseVersion(row: ReviewRow): ReviewVersionRecord {
  const recipient = {
    algorithm: "sha256" as const,
    digest: text(row.recipient_digest, "recipient digest"),
    bindingVersion: text(row.recipient_binding_version, "recipient binding version"),
  };
  const record: ReviewVersionRecord = {
    versionId: text(row.version_id, "versionId"), caseId: text(row.case_id, "caseId"),
    stage: enumValue(row.stage, ["draft", "final"] as const),
    status: enumValue(row.initial_status, ["draft", "review_required"] as const),
    artifactDigest: text(row.artifact_digest, "artifact digest"), recipient,
    policyVersion: text(row.policy_version, "policy version"),
    modelVersion: text(row.model_version, "model version"),
    evidenceVersion: text(row.evidence_version, "evidence version"),
    riskLevel: enumValue(row.risk_level, ["low", "moderate", "high", "critical", "unknown"] as const),
    mock: booleanValue(row.mock, "mock"), createdAt: iso(row.created_at, "createdAt"),
    ...(row.source_version_id ? { sourceVersionId: text(row.source_version_id, "sourceVersionId") } : {}),
  };
  assertSafeId(record.versionId, "versionId"); assertSafeId(record.caseId, "caseId");
  assertArtifactDigest(record.artifactDigest); assertRecipientBinding(record.recipient); assertVersionBindings(record);
  if ((record.stage === "draft") !== (record.status === "draft") || (record.stage === "final") !== Boolean(record.sourceVersionId)) {
    throw new ReviewReadRepositoryError();
  }
  return Object.freeze(record);
}

function parseApproval(row: ReviewRow, version: ReviewVersionRecord): ReviewApprovalRecord {
  const approval: ReviewApprovalRecord = {
    approvalId: text(row.approval_id, "approvalId"), versionId: version.versionId, caseId: version.caseId,
    reviewerRef: text(row.approval_reviewer_ref, "reviewerRef"), approvedAt: iso(row.approved_at, "approvedAt"),
    policyVersion: text(row.approval_policy_version, "policyVersion"),
    modelVersion: text(row.approval_model_version, "modelVersion"),
    evidenceVersion: text(row.approval_evidence_version, "evidenceVersion"),
    recipientIdentityDigest: text(row.approval_recipient_digest, "recipient digest"),
    recipientBindingVersion: text(row.approval_recipient_binding_version, "recipient binding version"),
    riskLevel: enumValue(row.approval_risk_level, ["low", "moderate", "high", "critical", "unknown"] as const),
    highRiskAcknowledged: booleanValue(row.high_risk_acknowledged, "highRiskAcknowledged"),
  };
  assertSafeId(approval.approvalId, "approvalId"); assertReviewerRef(approval.reviewerRef); assertVersionBindings(approval);
  return Object.freeze(approval);
}

function parseRejection(row: ReviewRow, version: ReviewVersionRecord): ReviewRejectionRecord {
  const rejection: ReviewRejectionRecord = {
    rejectionId: text(row.rejection_id, "rejectionId"), versionId: version.versionId, caseId: version.caseId,
    reviewerRef: text(row.rejection_reviewer_ref, "reviewerRef"), rejectedAt: iso(row.rejected_at, "rejectedAt"),
    reasonCode: enumValue(row.reason_code, ["insufficient_evidence", "policy_mismatch", "unsafe_content", "other"] as const),
  };
  assertSafeId(rejection.rejectionId, "rejectionId"); assertReviewerRef(rejection.reviewerRef);
  return Object.freeze(rejection);
}

function parseSupersession(row: ReviewRow, version: ReviewVersionRecord): ReviewSupersessionRecord {
  const supersession: ReviewSupersessionRecord = {
    supersessionId: text(row.supersession_id, "supersessionId"), versionId: version.versionId, caseId: version.caseId,
    supersededAt: iso(row.superseded_at, "supersededAt"),
    ...(row.superseded_by_version_id ? { supersededByVersionId: text(row.superseded_by_version_id, "supersededByVersionId") } : {}),
  };
  assertSafeId(supersession.supersessionId, "supersessionId");
  return Object.freeze(supersession);
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ReviewReadRepositoryError();
  return value;
}
function booleanValue(value: unknown, _field: string): boolean {
  if (typeof value !== "boolean") throw new ReviewReadRepositoryError();
  return value;
}
function iso(value: unknown, field: string): string {
  const stringValue = value instanceof Date ? value.toISOString() : text(value, field);
  if (!Number.isFinite(Date.parse(stringValue))) throw new ReviewReadRepositoryError();
  return new Date(stringValue).toISOString();
}
function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new ReviewReadRepositoryError();
  return value as T[number];
}
