import assert from "node:assert/strict";
import test from "node:test";
import { AsyncHumanReviewReleaseGate } from "./async-release-gate.js";
import { PostgresReviewReleaseReader, ReviewReadRepositoryError, type ReviewSqlExecutor } from "./postgres-review-release-reader.js";

const versionRow = {
  version_id: "review_version_12345678", case_id: "CASE-123", stage: "final", initial_status: "review_required",
  artifact_digest: "a".repeat(64), recipient_digest: "b".repeat(64), recipient_binding_version: "email-v1",
  policy_version: "policy-v1", model_version: "model-v1", evidence_version: "evidence-v1",
  risk_level: "moderate", mock: false, source_version_id: "review_version_87654321", created_at: "2026-08-24T00:00:00.000Z",
};
const approvalRow = {
  approval_id: "approval_12345678", approval_reviewer_ref: "reviewer_12345678",
  approved_at: "2026-08-24T00:01:00.000Z", approval_policy_version: "policy-v1",
  approval_model_version: "model-v1", approval_evidence_version: "evidence-v1",
  approval_recipient_digest: "b".repeat(64), approval_recipient_binding_version: "email-v1",
  approval_risk_level: "moderate", high_risk_acknowledged: false,
  rejection_id: null, supersession_id: null,
};

class FakeExecutor implements ReviewSqlExecutor {
  fail = false;
  corrupt = false;
  async query<Row>(sql: string) {
    if (this.fail) throw new Error("postgres://secret@private-host/db");
    if (sql.includes("drivable_review_case_heads")) return { rows: [{ version_id: versionRow.version_id }] as Row[] };
    if (sql.includes("left join")) return { rows: [approvalRow] as Row[] };
    return { rows: [{ ...versionRow, ...(this.corrupt ? { mock: "false" } : {}) }] as Row[] };
  }
}

test("loads runtime-validated durable state for an exact release decision", async () => {
  const reader = new PostgresReviewReleaseReader(new FakeExecutor());
  const gate = new AsyncHumanReviewReleaseGate(reader);
  const decision = await gate.decide({
    versionId: versionRow.version_id, caseId: versionRow.case_id,
    recipient: { algorithm: "sha256", digest: versionRow.recipient_digest, bindingVersion: versionRow.recipient_binding_version },
    policyVersion: versionRow.policy_version, modelVersion: versionRow.model_version, evidenceVersion: versionRow.evidence_version,
  });
  assert.equal(reader.capabilities.durable, true);
  assert.equal(decision.allowed, true);
});

test("corrupt booleans and malformed persisted records fail closed", async () => {
  const executor = new FakeExecutor(); executor.corrupt = true;
  await assert.rejects(
    new PostgresReviewReleaseReader(executor).getVersion(versionRow.version_id),
    (error) => error instanceof ReviewReadRepositoryError,
  );
});

test("database errors are redacted and never become release approval", async () => {
  const executor = new FakeExecutor(); executor.fail = true;
  await assert.rejects(
    new PostgresReviewReleaseReader(executor).getVersion(versionRow.version_id),
    (error) => error instanceof ReviewReadRepositoryError && !error.message.includes("secret"),
  );
});
