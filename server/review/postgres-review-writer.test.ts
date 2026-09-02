import assert from "node:assert/strict";
import test from "node:test";
import { PostgresReviewWriter, ReviewWriteError, type ReviewTransaction, type ReviewTransactionExecutor } from "./postgres-review-writer.js";

const recipient = { algorithm: "sha256" as const, digest: "a".repeat(64), bindingVersion: "email-v1" };
const base = { caseId: "CASE-123", artifactDigest: "b".repeat(64), recipient, riskLevel: "moderate" as const,
  policyVersion: "policy-v1", modelVersion: "model-v1", evidenceVersion: "evidence-v1" };

class FakeDatabase implements ReviewTransactionExecutor, ReviewTransaction {
  head = new Map<string, string>();
  versions = new Map<string, { stage: string; bindings: Record<string, unknown> }>();
  decisions = new Set<string>();
  superseded = new Set<string>();
  calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  failure: unknown;
  inTransaction = false;

  async transaction<T>(work: (transaction: ReviewTransaction) => Promise<T>): Promise<T> {
    assert.equal(this.inTransaction, false);
    this.inTransaction = true;
    try { return await work(this); } finally { this.inTransaction = false; }
  }

  async query<Row>(sql: string, values?: readonly unknown[]) {
    assert.equal(this.inTransaction, true, "every review write query must run inside a transaction");
    this.calls.push({ sql, values });
    if (this.failure) throw this.failure;
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] as Row[] };
    if (sql.includes("select version_id from drivable_review_case_heads")) {
      const version = this.head.get(String(values?.[0]));
      return { rows: (version ? [{ version_id: version }] : []) as Row[] };
    }
    if (sql.startsWith("insert into drivable_review_versions")) {
      this.versions.set(String(values?.[0]), { stage: String(values?.[2]), bindings: {
        policy_version: values?.[7], model_version: values?.[8], evidence_version: values?.[9],
        recipient_digest: values?.[5], recipient_binding_version: values?.[6], risk_level: values?.[10],
      } });
      return { rows: [] as Row[] };
    }
    if (sql.includes("select stage from drivable_review_versions")) {
      const version = this.versions.get(String(values?.[0]));
      return { rows: (version ? [{ stage: version.stage }] : []) as Row[] };
    }
    if (sql.includes("select exists(select 1 from drivable_review_approvals")) {
      return { rows: [{ decided: this.decisions.has(String(values?.[0])) }] as Row[] };
    }
    if (sql.startsWith("select policy_version")) {
      const version = this.versions.get(String(values?.[0]));
      return { rows: (version ? [version.bindings] : []) as Row[] };
    }
    if (sql.startsWith("insert into drivable_review_approvals") || sql.startsWith("insert into drivable_review_rejections")) {
      this.decisions.add(String(values?.[1])); return { rows: [] as Row[] };
    }
    if (sql.startsWith("insert into drivable_review_supersessions")) {
      this.superseded.add(String(values?.[1])); return { rows: [] as Row[] };
    }
    if (sql.startsWith("insert into drivable_review_case_heads")) {
      this.head.set(String(values?.[0]), String(values?.[1])); return { rows: [] as Row[] };
    }
    if (sql.startsWith("delete from drivable_review_case_heads")) {
      if (this.head.get(String(values?.[0])) === String(values?.[1])) this.head.delete(String(values?.[0]));
      return { rows: [] as Row[] };
    }
    throw new Error(`Unexpected SQL in fake: ${sql}`);
  }
}

function writer(database = new FakeDatabase()) {
  let id = 0;
  return { database, repository: new PostgresReviewWriter(database, {
    now: () => new Date("2026-08-31T00:00:00.000Z"), generateId: () => `generated_${++id}`,
  }) };
}

test("draft, final, and approval transitions are case-locked and atomic", async () => {
  const { database, repository } = writer();
  const draft = await repository.createDraft(base);
  const final = await repository.createFinal({ ...base, sourceVersionId: draft.versionId });
  const approval = await repository.approve({ caseId: base.caseId, versionId: final.versionId, reviewerRef: "reviewer_12345678" });
  assert.equal(database.head.get(base.caseId), final.versionId);
  assert.equal(database.superseded.has(draft.versionId), true);
  assert.equal(database.decisions.has(final.versionId), true);
  assert.equal(approval.recipientIdentityDigest, recipient.digest);
  assert.equal(database.calls.filter((call) => call.sql.includes("pg_advisory_xact_lock")).length, 3);
});

test("stale and already-decided versions cannot receive another decision", async () => {
  const { repository } = writer();
  const draft = await repository.createDraft(base);
  const final = await repository.createFinal({ ...base, sourceVersionId: draft.versionId });
  await repository.reject({ caseId: base.caseId, versionId: final.versionId, reviewerRef: "reviewer_12345678", reasonCode: "insufficient_evidence" });
  await assert.rejects(
    repository.approve({ caseId: base.caseId, versionId: final.versionId, reviewerRef: "reviewer_87654321" }),
    (error) => error instanceof ReviewWriteError && error.code === "conflict",
  );
});

test("high-risk approval requires explicit acknowledgement", async () => {
  const { repository } = writer();
  const high = { ...base, riskLevel: "high" as const };
  const draft = await repository.createDraft(high);
  const final = await repository.createFinal({ ...high, sourceVersionId: draft.versionId });
  await assert.rejects(
    repository.approve({ caseId: high.caseId, versionId: final.versionId, reviewerRef: "reviewer_12345678" }),
    (error) => error instanceof ReviewWriteError && error.code === "invalid_state",
  );
  const approval = await repository.approve({ caseId: high.caseId, versionId: final.versionId, reviewerRef: "reviewer_12345678", highRiskAcknowledged: true });
  assert.equal(approval.highRiskAcknowledged, true);
});

test("database errors are redacted and retryable", async () => {
  const { database, repository } = writer();
  database.failure = new Error("postgres://user:password@private-host/database");
  await assert.rejects(repository.createDraft(base), (error) =>
    error instanceof ReviewWriteError && error.code === "storage_unavailable" && error.retryable && !error.message.includes("password"));
});
