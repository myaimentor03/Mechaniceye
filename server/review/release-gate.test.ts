import assert from "node:assert/strict";
import test from "node:test";
import {
  HumanReviewReleaseGate,
  InMemoryReviewRepository,
  ReviewConflictError,
  ReviewValidationError,
  assertDurableReviewRepository,
  type CreateReviewVersionInput,
  type RecipientIdentityBinding,
  type ReleaseRequest,
  type ReviewRepository,
  type ReviewRiskLevel,
} from "./index.js";

const NOW = new Date("2026-08-24T20:00:00.000Z");
const ARTIFACT_DIGEST = "a".repeat(64);
const RECIPIENT: RecipientIdentityBinding = Object.freeze({
  algorithm: "sha256",
  digest: "b".repeat(64),
  bindingVersion: "recipient-v1",
});

function fixture(riskLevel: ReviewRiskLevel = "low", mock = false) {
  let sequence = 0;
  const repository = new InMemoryReviewRepository({
    now: () => NOW,
    generateId: () => `generated_${++sequence}`,
  });
  const common: CreateReviewVersionInput = {
    caseId: "CASE-123",
    artifactDigest: ARTIFACT_DIGEST,
    recipient: RECIPIENT,
    policyVersion: "policy-v3",
    modelVersion: "model-v5",
    evidenceVersion: "evidence-v8",
    riskLevel,
    mock,
  };
  const draft = repository.createDraft(common);
  const final = repository.createFinal({ ...common, sourceVersionId: draft.versionId });
  const request: ReleaseRequest = {
    versionId: final.versionId,
    caseId: final.caseId,
    recipient: RECIPIENT,
    policyVersion: final.policyVersion,
    modelVersion: final.modelVersion,
    evidenceVersion: final.evidenceVersion,
  };
  return {
    repository,
    gate: new HumanReviewReleaseGate(repository, { now: () => NOW }),
    common,
    draft,
    final,
    request,
  };
}

test("draft and final versions are generated, immutable, case-bound records", () => {
  const { repository, draft, final } = fixture();

  assert.match(draft.versionId, /^review_version_generated_\d+$/);
  assert.match(final.versionId, /^review_version_generated_\d+$/);
  assert.notEqual(final.versionId, draft.versionId);
  assert.equal(draft.caseId, "CASE-123");
  assert.equal(draft.stage, "draft");
  assert.equal(final.stage, "final");
  assert.equal(final.status, "review_required");
  assert.equal(final.sourceVersionId, draft.versionId);
  assert.equal(repository.getVersionState(draft.versionId)?.status, "superseded");
  assert.equal(Object.isFrozen(draft), true);
  assert.equal(Object.isFrozen(final), true);
  assert.equal(Object.isFrozen(final.recipient), true);
  assert.throws(() => {
    (final as { caseId: string }).caseId = "CASE-OTHER";
  }, TypeError);
});

test("the in-memory repository is rejected by the production durability gate", () => {
  assert.throws(
    () => assertDurableReviewRepository(new InMemoryReviewRepository()),
    /must be durable/,
  );
});

test("recipient and reviewer records accept opaque bindings, not plaintext identity fields", () => {
  const { repository, final } = fixture();
  const approval = repository.approve({
    versionId: final.versionId,
    caseId: final.caseId,
    reviewerRef: "reviewer_opaque123",
  });

  assert.equal(approval.approvedAt, NOW.toISOString());
  assert.equal(approval.policyVersion, final.policyVersion);
  assert.equal(approval.modelVersion, final.modelVersion);
  assert.equal(approval.evidenceVersion, final.evidenceVersion);
  assert.equal(approval.recipientIdentityDigest, RECIPIENT.digest);
  assert.equal(Object.isFrozen(approval), true);
  assert.equal("email" in approval, false);
  assert.equal("name" in approval, false);

  const invalidRepository = new InMemoryReviewRepository();
  assert.throws(
    () => invalidRepository.createDraft({
      ...fixture().common,
      recipient: {
        algorithm: "sha256",
        digest: "person@example.com",
        bindingVersion: "recipient-v1",
      },
    }),
    ReviewValidationError,
  );
  assert.throws(
    () => fixture().repository.approve({
      versionId: fixture().final.versionId,
      caseId: "CASE-123",
      reviewerRef: "person@example.com",
    }),
    ReviewValidationError,
  );
});

test("an exact approved version produces an explicit allow decision", () => {
  const { repository, gate, final, request } = fixture();
  const approval = repository.approve({
    versionId: final.versionId,
    caseId: final.caseId,
    reviewerRef: "reviewer_opaque123",
  });

  const decision = gate.decide(request);
  assert.deepEqual(decision, {
    allowed: true,
    code: "release_allowed",
    versionId: final.versionId,
    caseId: final.caseId,
    approvalId: approval.approvalId,
    evaluatedAt: NOW.toISOString(),
  });
  assert.equal(Object.isFrozen(decision), true);
});

test("unapproved, rejected, and wrong-case versions cannot be released", () => {
  const unapproved = fixture();
  assert.equal(unapproved.gate.decide(unapproved.request).code, "review_required");

  const rejected = fixture();
  rejected.repository.reject({
    versionId: rejected.final.versionId,
    caseId: rejected.final.caseId,
    reviewerRef: "reviewer_opaque123",
    reasonCode: "insufficient_evidence",
  });
  assert.equal(rejected.repository.getVersionState(rejected.final.versionId)?.status, "rejected");
  assert.equal(rejected.gate.decide(rejected.request).code, "rejected");
  assert.equal(
    rejected.gate.decide({ ...rejected.request, caseId: "CASE-OTHER" }).code,
    "wrong_case",
  );
});

test("wrong recipients and changed approval bindings cannot be released", () => {
  const { repository, gate, final, request } = fixture();
  repository.approve({
    versionId: final.versionId,
    caseId: final.caseId,
    reviewerRef: "reviewer_opaque123",
  });

  assert.equal(gate.decide({
    ...request,
    recipient: { ...RECIPIENT, digest: "c".repeat(64) },
  }).code, "wrong_recipient");
  assert.equal(gate.decide({ ...request, policyVersion: "policy-v4" }).code, "approval_binding_mismatch");
  assert.equal(gate.decide({ ...request, modelVersion: "model-v6" }).code, "approval_binding_mismatch");
  assert.equal(gate.decide({ ...request, evidenceVersion: "evidence-v9" }).code, "approval_binding_mismatch");
});

test("new work supersedes prior work and stale or superseded content cannot release", () => {
  const first = fixture();
  first.repository.approve({
    versionId: first.final.versionId,
    caseId: first.final.caseId,
    reviewerRef: "reviewer_opaque123",
  });
  first.repository.createDraft({
    ...first.common,
    artifactDigest: "d".repeat(64),
  });

  assert.equal(first.repository.getVersionState(first.final.versionId)?.status, "superseded");
  assert.equal(first.gate.decide(first.request).code, "superseded");

  const staleRepository = new InMemoryReviewRepository();
  assert.throws(
    () => staleRepository.createFinal({
      ...first.common,
      sourceVersionId: first.draft.versionId,
    }),
    ReviewConflictError,
  );

  const approved = fixture();
  approved.repository.approve({
    versionId: approved.final.versionId,
    caseId: approved.final.caseId,
    reviewerRef: "reviewer_opaque123",
  });
  const staleView: ReviewRepository = {
    capabilities: approved.repository.capabilities,
    createDraft: (input) => approved.repository.createDraft(input),
    createFinal: (input) => approved.repository.createFinal(input),
    approve: (input) => approved.repository.approve(input),
    reject: (input) => approved.repository.reject(input),
    supersede: (input) => approved.repository.supersede(input),
    getVersion: (versionId) => approved.repository.getVersion(versionId),
    getVersionState: (versionId) => approved.repository.getVersionState(versionId),
    getCurrentVersionId: () => "review_version_newer",
  };
  assert.equal(
    new HumanReviewReleaseGate(staleView, { now: () => NOW }).decide(approved.request).code,
    "stale_version",
  );
});

test("missing versions and malformed recipient bindings produce denial decisions", () => {
  const item = fixture();
  assert.equal(item.gate.decide({
    ...item.request,
    versionId: "review_version_missing",
  }).code, "version_not_found");
  assert.equal(item.gate.decide({
    ...item.request,
    recipient: { ...RECIPIENT, digest: "recipient@example.com" },
  }).code, "recipient_binding_invalid");
});

test("mock, critical, and unclassified risk content always fail closed", () => {
  for (const [risk, mock, expected] of [
    ["low", true, "mock_content"],
    ["critical", false, "critical_risk"],
    ["unknown", false, "risk_unclassified"],
  ] as const) {
    const item = fixture(risk, mock);
    item.repository.approve({
      versionId: item.final.versionId,
      caseId: item.final.caseId,
      reviewerRef: "reviewer_opaque123",
      highRiskAcknowledged: true,
    });
    assert.equal(item.gate.decide(item.request).code, expected);
  }
});

test("high risk requires an explicit reviewer acknowledgement", () => {
  const missing = fixture("high");
  missing.repository.approve({
    versionId: missing.final.versionId,
    caseId: missing.final.caseId,
    reviewerRef: "reviewer_opaque123",
  });
  assert.equal(
    missing.gate.decide(missing.request).code,
    "high_risk_acknowledgement_required",
  );

  const acknowledged = fixture("high");
  acknowledged.repository.approve({
    versionId: acknowledged.final.versionId,
    caseId: acknowledged.final.caseId,
    reviewerRef: "reviewer_opaque123",
    highRiskAcknowledged: true,
  });
  assert.equal(acknowledged.gate.decide(acknowledged.request).code, "release_allowed");
});

test("review decisions are single-use and case-bound", () => {
  const approved = fixture();
  approved.repository.approve({
    versionId: approved.final.versionId,
    caseId: approved.final.caseId,
    reviewerRef: "reviewer_opaque123",
  });
  assert.throws(() => approved.repository.reject({
    versionId: approved.final.versionId,
    caseId: approved.final.caseId,
    reviewerRef: "reviewer_opaque456",
    reasonCode: "other",
  }), ReviewConflictError);

  const wrongCase = fixture();
  assert.throws(() => wrongCase.repository.approve({
    versionId: wrongCase.final.versionId,
    caseId: "CASE-OTHER",
    reviewerRef: "reviewer_opaque123",
  }), ReviewConflictError);
});
