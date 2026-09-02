import { randomUUID } from "node:crypto";
import type {
  ApproveReviewVersionInput,
  CreateFinalReviewVersionInput,
  CreateReviewVersionInput,
  RejectReviewVersionInput,
  ReviewApprovalRecord,
  ReviewRejectionReason,
  ReviewRejectionRecord,
  ReviewRepositoryCapabilities,
  ReviewRiskLevel,
  ReviewSupersessionRecord,
  ReviewVersionRecord,
  SupersedeReviewVersionInput,
} from "./types.js";
import {
  assertArtifactDigest,
  assertRecipientBinding,
  assertReviewerRef,
  assertSafeId,
  assertVersionBindings,
} from "./validation.js";

export interface ReviewTransaction {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}
export interface ReviewTransactionExecutor {
  transaction<T>(work: (transaction: ReviewTransaction) => Promise<T>): Promise<T>;
}

export interface AsyncReviewMutationRepository {
  readonly capabilities: ReviewRepositoryCapabilities;
  createDraft(input: CreateReviewVersionInput): Promise<ReviewVersionRecord>;
  createFinal(input: CreateFinalReviewVersionInput): Promise<ReviewVersionRecord>;
  approve(input: ApproveReviewVersionInput): Promise<ReviewApprovalRecord>;
  reject(input: RejectReviewVersionInput): Promise<ReviewRejectionRecord>;
  supersede(input: SupersedeReviewVersionInput): Promise<ReviewSupersessionRecord>;
}

export class ReviewWriteError extends Error {
  constructor(
    readonly code: "conflict" | "storage_unavailable" | "invalid_state",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ReviewWriteError";
  }
}

export const POSTGRES_REVIEW_WRITER_CAPABILITIES: ReviewRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository", durable: true, appendOnlyAudit: true,
  caseBoundTransitions: true, generatedIdentifiers: true,
});

type WriterOptions = { now?: () => Date; generateId?: () => string };

export class PostgresReviewWriter implements AsyncReviewMutationRepository {
  readonly capabilities = POSTGRES_REVIEW_WRITER_CAPABILITIES;
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(private readonly executor: ReviewTransactionExecutor, options: WriterOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? randomUUID;
  }

  async createDraft(input: CreateReviewVersionInput): Promise<ReviewVersionRecord> {
    validateVersionInput(input);
    const record = this.version("draft", "draft", input);
    return this.run(async (tx) => {
      await lockCase(tx, input.caseId);
      const current = await currentVersion(tx, input.caseId);
      await insertVersion(tx, record);
      if (current) await insertSupersession(tx, this.supersession(current, input.caseId, record.versionId));
      await setHead(tx, input.caseId, record.versionId, record.createdAt);
      return record;
    });
  }

  async createFinal(input: CreateFinalReviewVersionInput): Promise<ReviewVersionRecord> {
    validateVersionInput(input); assertSafeId(input.sourceVersionId, "sourceVersionId");
    const record = this.version("final", "review_required", input);
    return this.run(async (tx) => {
      await lockCase(tx, input.caseId);
      const current = await currentVersion(tx, input.caseId);
      if (current !== input.sourceVersionId) throw conflict("Source draft is stale");
      const source = await versionStage(tx, input.sourceVersionId, input.caseId);
      if (source !== "draft") throw conflict("Final version requires the current draft");
      if (await hasTerminalAction(tx, input.sourceVersionId)) throw conflict("Source draft is not actionable");
      await insertVersion(tx, record);
      await insertSupersession(tx, this.supersession(input.sourceVersionId, input.caseId, record.versionId));
      await setHead(tx, input.caseId, record.versionId, record.createdAt);
      return record;
    });
  }

  async approve(input: ApproveReviewVersionInput): Promise<ReviewApprovalRecord> {
    validateAction(input.versionId, input.caseId, input.reviewerRef);
    return this.run(async (tx) => {
      await this.requireActionableFinal(tx, input.versionId, input.caseId);
      const version = await loadApprovalBindings(tx, input.versionId);
      if (version.riskLevel === "high" && input.highRiskAcknowledged !== true) {
        throw new ReviewWriteError("invalid_state", "High-risk approval requires explicit acknowledgement");
      }
      const record = Object.freeze({
        approvalId: this.id("approval"), versionId: input.versionId, caseId: input.caseId,
        reviewerRef: input.reviewerRef, approvedAt: this.timestamp(),
        policyVersion: version.policyVersion, modelVersion: version.modelVersion,
        evidenceVersion: version.evidenceVersion, recipientIdentityDigest: version.recipientDigest,
        recipientBindingVersion: version.recipientBindingVersion, riskLevel: version.riskLevel,
        highRiskAcknowledged: input.highRiskAcknowledged === true,
      } satisfies ReviewApprovalRecord);
      await tx.query(
        `insert into drivable_review_approvals
          (approval_id, version_id, case_id, reviewer_ref, approved_at, policy_version,
           model_version, evidence_version, recipient_digest, recipient_binding_version,
           risk_level, high_risk_acknowledged)
         values ($1,$2,$3,$4,$5::timestamptz,$6,$7,$8,$9,$10,$11,$12)`,
        [record.approvalId, record.versionId, record.caseId, record.reviewerRef, record.approvedAt,
          record.policyVersion, record.modelVersion, record.evidenceVersion, record.recipientIdentityDigest,
          record.recipientBindingVersion, record.riskLevel, record.highRiskAcknowledged],
      );
      return record;
    });
  }

  async reject(input: RejectReviewVersionInput): Promise<ReviewRejectionRecord> {
    validateAction(input.versionId, input.caseId, input.reviewerRef);
    if (!(["insufficient_evidence", "policy_mismatch", "unsafe_content", "other"] as const).includes(input.reasonCode)) {
      throw new TypeError("Unknown review rejection reason");
    }
    return this.run(async (tx) => {
      await this.requireActionableFinal(tx, input.versionId, input.caseId);
      const record = Object.freeze({
        rejectionId: this.id("rejection"), versionId: input.versionId, caseId: input.caseId,
        reviewerRef: input.reviewerRef, rejectedAt: this.timestamp(), reasonCode: input.reasonCode,
      } satisfies ReviewRejectionRecord);
      await tx.query(
        `insert into drivable_review_rejections
          (rejection_id, version_id, case_id, reviewer_ref, rejected_at, reason_code)
         values ($1,$2,$3,$4,$5::timestamptz,$6)`,
        [record.rejectionId, record.versionId, record.caseId, record.reviewerRef, record.rejectedAt, record.reasonCode],
      );
      return record;
    });
  }

  async supersede(input: SupersedeReviewVersionInput): Promise<ReviewSupersessionRecord> {
    assertSafeId(input.versionId, "versionId"); assertSafeId(input.caseId, "caseId");
    return this.run(async (tx) => {
      await lockCase(tx, input.caseId);
      if (await currentVersion(tx, input.caseId) !== input.versionId) throw conflict("Only the current version can be superseded");
      const record = this.supersession(input.versionId, input.caseId);
      await insertSupersession(tx, record);
      await tx.query(`delete from drivable_review_case_heads where case_id = $1 and version_id = $2`, [input.caseId, input.versionId]);
      return record;
    });
  }

  private async requireActionableFinal(tx: ReviewTransaction, versionId: string, caseId: string): Promise<void> {
    await lockCase(tx, caseId);
    if (await currentVersion(tx, caseId) !== versionId) throw conflict("Review version is stale");
    if (await versionStage(tx, versionId, caseId) !== "final") throw conflict("Version is not awaiting review");
    if (await hasTerminalAction(tx, versionId)) throw conflict("Version already has a review decision");
  }

  private version(stage: "draft" | "final", status: "draft" | "review_required", input: CreateReviewVersionInput & { sourceVersionId?: string }): ReviewVersionRecord {
    return Object.freeze({
      versionId: this.id("review_version"), caseId: input.caseId, stage, status,
      artifactDigest: input.artifactDigest, recipient: Object.freeze({ ...input.recipient }),
      policyVersion: input.policyVersion, modelVersion: input.modelVersion, evidenceVersion: input.evidenceVersion,
      riskLevel: input.riskLevel, mock: input.mock === true, createdAt: this.timestamp(),
      ...(input.sourceVersionId ? { sourceVersionId: input.sourceVersionId } : {}),
    });
  }

  private supersession(versionId: string, caseId: string, supersededByVersionId?: string): ReviewSupersessionRecord {
    return Object.freeze({ supersessionId: this.id("supersession"), versionId, caseId,
      supersededAt: this.timestamp(), ...(supersededByVersionId ? { supersededByVersionId } : {}) });
  }
  private id(prefix: string): string { const value = `${prefix}_${this.generateId()}`; assertSafeId(value, `${prefix}Id`); return value; }
  private timestamp(): string { const value = this.now(); if (Number.isNaN(value.getTime())) throw new TypeError("Invalid review clock"); return value.toISOString(); }
  private async run<T>(work: (tx: ReviewTransaction) => Promise<T>): Promise<T> {
    try { return await this.executor.transaction(work); }
    catch (error) {
      if (error instanceof ReviewWriteError || error instanceof TypeError) throw error;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (["23505", "23503", "23514", "40001"].includes(code)) throw conflict("Concurrent or invalid review transition");
      throw new ReviewWriteError("storage_unavailable", "Review change could not be persisted", true);
    }
  }
}

function validateVersionInput(input: CreateReviewVersionInput): void {
  assertSafeId(input.caseId, "caseId"); assertArtifactDigest(input.artifactDigest);
  assertRecipientBinding(input.recipient); assertVersionBindings(input);
  if (!(["low", "moderate", "high", "critical", "unknown"] as readonly ReviewRiskLevel[]).includes(input.riskLevel)) throw new TypeError("Unknown risk level");
}
function validateAction(versionId: string, caseId: string, reviewerRef: string): void {
  assertSafeId(versionId, "versionId"); assertSafeId(caseId, "caseId"); assertReviewerRef(reviewerRef);
}
function conflict(message: string): ReviewWriteError { return new ReviewWriteError("conflict", message); }
async function lockCase(tx: ReviewTransaction, caseId: string) { await tx.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [caseId]); }
async function currentVersion(tx: ReviewTransaction, caseId: string): Promise<string | undefined> {
  const row = (await tx.query<{ version_id: string }>(`select version_id from drivable_review_case_heads where case_id = $1 for update`, [caseId])).rows[0];
  return row?.version_id;
}
async function versionStage(tx: ReviewTransaction, versionId: string, caseId: string): Promise<string | undefined> {
  return (await tx.query<{ stage: string }>(`select stage from drivable_review_versions where version_id = $1 and case_id = $2`, [versionId, caseId])).rows[0]?.stage;
}
async function hasTerminalAction(tx: ReviewTransaction, versionId: string): Promise<boolean> {
  const row = (await tx.query<{ decided: boolean }>(`select exists(select 1 from drivable_review_approvals where version_id=$1) or exists(select 1 from drivable_review_rejections where version_id=$1) or exists(select 1 from drivable_review_supersessions where version_id=$1) as decided`, [versionId])).rows[0];
  return row?.decided === true;
}
async function loadApprovalBindings(tx: ReviewTransaction, versionId: string) {
  const row = (await tx.query<Record<string, unknown>>(`select policy_version, model_version, evidence_version, recipient_digest, recipient_binding_version, risk_level from drivable_review_versions where version_id=$1`, [versionId])).rows[0];
  if (!row) throw conflict("Review version does not exist");
  const values = [row.policy_version, row.model_version, row.evidence_version, row.recipient_digest, row.recipient_binding_version, row.risk_level];
  if (values.some((value) => typeof value !== "string" || !value)) throw new ReviewWriteError("invalid_state", "Stored review bindings are invalid");
  return { policyVersion: row.policy_version as string, modelVersion: row.model_version as string,
    evidenceVersion: row.evidence_version as string, recipientDigest: row.recipient_digest as string,
    recipientBindingVersion: row.recipient_binding_version as string, riskLevel: row.risk_level as ReviewRiskLevel };
}
async function insertVersion(tx: ReviewTransaction, record: ReviewVersionRecord) {
  await tx.query(`insert into drivable_review_versions (version_id,case_id,stage,initial_status,artifact_digest,recipient_digest,recipient_binding_version,policy_version,model_version,evidence_version,risk_level,mock,source_version_id,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::timestamptz)`,
    [record.versionId,record.caseId,record.stage,record.status,record.artifactDigest,record.recipient.digest,record.recipient.bindingVersion,record.policyVersion,record.modelVersion,record.evidenceVersion,record.riskLevel,record.mock,record.sourceVersionId ?? null,record.createdAt]);
}
async function insertSupersession(tx: ReviewTransaction, record: ReviewSupersessionRecord) {
  await tx.query(`insert into drivable_review_supersessions (supersession_id,version_id,case_id,superseded_at,superseded_by_version_id) values ($1,$2,$3,$4::timestamptz,$5)`, [record.supersessionId,record.versionId,record.caseId,record.supersededAt,record.supersededByVersionId ?? null]);
}
async function setHead(tx: ReviewTransaction, caseId: string, versionId: string, updatedAt: string) {
  await tx.query(`insert into drivable_review_case_heads (case_id,version_id,updated_at) values ($1,$2,$3::timestamptz) on conflict (case_id) do update set version_id=excluded.version_id, updated_at=excluded.updated_at`, [caseId,versionId,updatedAt]);
}
