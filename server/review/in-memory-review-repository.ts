import { randomUUID } from "node:crypto";
import type {
  ApproveReviewVersionInput,
  CreateFinalReviewVersionInput,
  CreateReviewVersionInput,
  RejectReviewVersionInput,
  ReviewApprovalRecord,
  ReviewRejectionReason,
  ReviewRejectionRecord,
  ReviewRepository,
  ReviewRepositoryCapabilities,
  ReviewRiskLevel,
  ReviewStage,
  ReviewStatus,
  ReviewSupersessionRecord,
  ReviewVersionRecord,
  ReviewVersionState,
  SupersedeReviewVersionInput,
} from "./types.js";
import {
  ReviewValidationError,
  assertArtifactDigest,
  assertRecipientBinding,
  assertReviewerRef,
  assertSafeId,
  assertVersionBindings,
} from "./validation.js";

export interface InMemoryReviewRepositoryOptions {
  readonly now?: () => Date;
  readonly generateId?: () => string;
}

export class ReviewConflictError extends Error {
  readonly code = "review_conflict";

  constructor(message: string) {
    super(message);
    this.name = "ReviewConflictError";
  }
}

export const IN_MEMORY_REVIEW_REPOSITORY_CAPABILITIES: ReviewRepositoryCapabilities =
  Object.freeze({
    backendClass: "ephemeral-test-double",
    durable: false,
    appendOnlyAudit: true,
    caseBoundTransitions: true,
    generatedIdentifiers: true,
  });

/**
 * Test/development repository. Records are append-only and frozen, but this fake
 * is intentionally not durable and must not be used as a production datastore.
 */
export class InMemoryReviewRepository implements ReviewRepository {
  readonly capabilities = IN_MEMORY_REVIEW_REPOSITORY_CAPABILITIES;

  private readonly versions = new Map<string, ReviewVersionRecord>();
  private readonly approvals = new Map<string, ReviewApprovalRecord>();
  private readonly rejections = new Map<string, ReviewRejectionRecord>();
  private readonly supersessions = new Map<string, ReviewSupersessionRecord>();
  private readonly currentVersionByCase = new Map<string, string>();
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(options: InMemoryReviewRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? randomUUID;
  }

  createDraft(input: CreateReviewVersionInput): ReviewVersionRecord {
    this.assertVersionInput(input);
    const priorVersionId = this.currentVersionByCase.get(input.caseId);
    const version = this.buildVersion("draft", "draft", input);
    const supersession = priorVersionId
      ? this.buildSupersession(priorVersionId, input.caseId, version.versionId)
      : undefined;

    this.versions.set(version.versionId, version);
    if (supersession) this.supersessions.set(priorVersionId!, supersession);
    this.currentVersionByCase.set(input.caseId, version.versionId);
    return version;
  }

  createFinal(input: CreateFinalReviewVersionInput): ReviewVersionRecord {
    this.assertVersionInput(input);
    assertSafeId(input.sourceVersionId, "sourceVersionId");
    const source = this.requireVersion(input.sourceVersionId, input.caseId);
    const sourceState = this.getVersionState(source.versionId)!;
    if (source.stage !== "draft" || sourceState.status !== "draft") {
      throw new ReviewConflictError("A final version must be created from the current draft");
    }
    if (this.currentVersionByCase.get(input.caseId) !== source.versionId) {
      throw new ReviewConflictError("The source draft is stale");
    }

    const version = this.buildVersion("final", "review_required", input);
    const supersession = this.buildSupersession(source.versionId, input.caseId, version.versionId);
    this.versions.set(version.versionId, version);
    this.supersessions.set(source.versionId, supersession);
    this.currentVersionByCase.set(input.caseId, version.versionId);
    return version;
  }

  approve(input: ApproveReviewVersionInput): ReviewApprovalRecord {
    assertSafeId(input.versionId, "versionId");
    assertSafeId(input.caseId, "caseId");
    assertReviewerRef(input.reviewerRef);
    const version = this.requireActionableFinal(input.versionId, input.caseId);

    const approval = freezeRecord({
      approvalId: this.nextId("approval"),
      versionId: version.versionId,
      caseId: version.caseId,
      reviewerRef: input.reviewerRef,
      approvedAt: this.timestamp(),
      policyVersion: version.policyVersion,
      modelVersion: version.modelVersion,
      evidenceVersion: version.evidenceVersion,
      recipientIdentityDigest: version.recipient.digest,
      recipientBindingVersion: version.recipient.bindingVersion,
      riskLevel: version.riskLevel,
      highRiskAcknowledged: input.highRiskAcknowledged === true,
    } satisfies ReviewApprovalRecord);
    this.approvals.set(version.versionId, approval);
    return approval;
  }

  reject(input: RejectReviewVersionInput): ReviewRejectionRecord {
    assertSafeId(input.versionId, "versionId");
    assertSafeId(input.caseId, "caseId");
    assertReviewerRef(input.reviewerRef);
    assertRejectionReason(input.reasonCode);
    const version = this.requireActionableFinal(input.versionId, input.caseId);

    const rejection = freezeRecord({
      rejectionId: this.nextId("rejection"),
      versionId: version.versionId,
      caseId: version.caseId,
      reviewerRef: input.reviewerRef,
      rejectedAt: this.timestamp(),
      reasonCode: input.reasonCode,
    } satisfies ReviewRejectionRecord);
    this.rejections.set(version.versionId, rejection);
    return rejection;
  }

  supersede(input: SupersedeReviewVersionInput): ReviewSupersessionRecord {
    assertSafeId(input.versionId, "versionId");
    assertSafeId(input.caseId, "caseId");
    this.requireVersion(input.versionId, input.caseId);
    if (this.supersessions.has(input.versionId)) {
      throw new ReviewConflictError("Version is already superseded");
    }
    if (this.currentVersionByCase.get(input.caseId) !== input.versionId) {
      throw new ReviewConflictError("Only the current version can be superseded directly");
    }

    const supersession = this.buildSupersession(input.versionId, input.caseId);
    this.supersessions.set(input.versionId, supersession);
    this.currentVersionByCase.delete(input.caseId);
    return supersession;
  }

  getVersion(versionId: string): ReviewVersionRecord | undefined {
    return this.versions.get(versionId);
  }

  getVersionState(versionId: string): ReviewVersionState | undefined {
    const version = this.versions.get(versionId);
    if (!version) return undefined;
    const supersession = this.supersessions.get(versionId);
    const approval = this.approvals.get(versionId);
    const rejection = this.rejections.get(versionId);
    const status: ReviewStatus = supersession
      ? "superseded"
      : rejection
        ? "rejected"
        : approval
          ? "approved"
          : version.status;
    return freezeRecord({ version, status, approval, rejection, supersession });
  }

  getCurrentVersionId(caseId: string): string | undefined {
    return this.currentVersionByCase.get(caseId);
  }

  private buildVersion(
    stage: ReviewStage,
    status: "draft" | "review_required",
    input: CreateReviewVersionInput & { readonly sourceVersionId?: string },
  ): ReviewVersionRecord {
    return freezeRecord({
      versionId: this.nextId("review_version"),
      caseId: input.caseId,
      stage,
      status,
      artifactDigest: input.artifactDigest,
      recipient: freezeRecord({ ...input.recipient }),
      policyVersion: input.policyVersion,
      modelVersion: input.modelVersion,
      evidenceVersion: input.evidenceVersion,
      riskLevel: input.riskLevel,
      mock: input.mock === true,
      createdAt: this.timestamp(),
      ...(input.sourceVersionId ? { sourceVersionId: input.sourceVersionId } : {}),
    });
  }

  private buildSupersession(
    versionId: string,
    caseId: string,
    supersededByVersionId?: string,
  ): ReviewSupersessionRecord {
    return freezeRecord({
      supersessionId: this.nextId("supersession"),
      versionId,
      caseId,
      supersededAt: this.timestamp(),
      ...(supersededByVersionId ? { supersededByVersionId } : {}),
    });
  }

  private assertVersionInput(input: CreateReviewVersionInput): void {
    assertSafeId(input.caseId, "caseId");
    assertArtifactDigest(input.artifactDigest);
    assertRecipientBinding(input.recipient);
    assertVersionBindings(input);
    assertRiskLevel(input.riskLevel);
  }

  private requireVersion(versionId: string, caseId: string): ReviewVersionRecord {
    const version = this.versions.get(versionId);
    if (!version) throw new ReviewConflictError("Review version does not exist");
    if (version.caseId !== caseId) throw new ReviewConflictError("Review version belongs to another case");
    return version;
  }

  private requireActionableFinal(versionId: string, caseId: string): ReviewVersionRecord {
    const version = this.requireVersion(versionId, caseId);
    const state = this.getVersionState(versionId)!;
    if (version.stage !== "final" || state.status !== "review_required") {
      throw new ReviewConflictError("Version is not awaiting review");
    }
    if (this.currentVersionByCase.get(caseId) !== versionId) {
      throw new ReviewConflictError("Version is stale");
    }
    return version;
  }

  private nextId(prefix: string): string {
    const generated = this.generateId();
    if (!SAFE_GENERATED_ID.test(generated)) {
      throw new ReviewValidationError("Generated identifier was not safe");
    }
    const id = `${prefix}_${generated}`;
    if (
      this.versions.has(id)
      || [...this.approvals.values()].some((record) => record.approvalId === id)
      || [...this.rejections.values()].some((record) => record.rejectionId === id)
      || [...this.supersessions.values()].some((record) => record.supersessionId === id)
    ) {
      throw new ReviewConflictError("Generated identifier already exists");
    }
    return id;
  }

  private timestamp(): string {
    const value = this.now();
    if (Number.isNaN(value.getTime())) throw new ReviewValidationError("Clock returned an invalid date");
    return value.toISOString();
  }
}

const SAFE_GENERATED_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REJECTION_REASONS: readonly ReviewRejectionReason[] = [
  "insufficient_evidence",
  "policy_mismatch",
  "unsafe_content",
  "other",
];

function assertRiskLevel(value: ReviewRiskLevel): void {
  const allowed: readonly ReviewRiskLevel[] = ["low", "moderate", "high", "critical", "unknown"];
  if (!allowed.includes(value)) throw new ReviewValidationError("Unknown review risk level");
}

function assertRejectionReason(value: ReviewRejectionReason): void {
  if (!REJECTION_REASONS.includes(value)) {
    throw new ReviewValidationError("Unknown review rejection reason");
  }
}

function freezeRecord<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}
