import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { PgLaunchControlExecutor } from "./postgres-adapter.js";
import { AsyncHumanReviewReleaseGate } from "./async-release-gate.js";
import { PostgresReviewReleaseReader } from "./postgres-review-release-reader.js";
import { PostgresReviewWriter } from "./postgres-review-writer.js";
import { mutationTargetGuard, verifyConnectedDatabaseTarget } from "../../scripts/lib/db-target-safe.mjs";

const candidateUrl = process.env.DRIVABLE_ALLOW_COMMERCE_TEST_SCHEMA_SETUP === "true"
  ? process.env.DRIVABLE_COMMERCE_TEST_DATABASE_URL : undefined;
const testUrl = candidateUrl && mutationTargetGuard(candidateUrl).ok ? candidateUrl : undefined;

test("Postgres: review approvals persist across restart and stale or changed bindings fail closed", {
  skip: !testUrl ? "Explicit verified isolated commerce-test URL and schema-setup opt-in are unavailable" : false,
}, async () => {
  const schema = `review_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: testUrl, ssl: { rejectUnauthorized: false }, max: 1 });
  let pool: pg.Pool | undefined;
  let targetVerified = false;
  try {
    await verifyConnectedDatabaseTarget(admin);
    targetVerified = true;
    await admin.query(`create schema ${schema}`);
    const open = () => new pg.Pool({ connectionString: testUrl, ssl: { rejectUnauthorized: false },
      options: `-c search_path=${schema}`, max: 2 });
    pool = open();
    await verifyConnectedDatabaseTarget(pool);
    await pool.query(await readFile(new URL("../../migrations/0001_drivable_launch_controls.sql", import.meta.url), "utf8"));

    const caseId = `case_${randomUUID().replaceAll("-", "")}`;
    const recipient = { algorithm: "sha256" as const, digest: "a".repeat(64), bindingVersion: "email-v1" };
    const bindings = { caseId, artifactDigest: "b".repeat(64), recipient, riskLevel: "moderate" as const,
      policyVersion: "policy-v1", modelVersion: "model-v1", evidenceVersion: "evidence-v1" };
    const reviewerRef = "reviewer_test_12345678";
    const makeApproved = async (executor: PgLaunchControlExecutor) => {
      const repository = new PostgresReviewWriter(executor);
      const draft = await repository.createDraft(bindings);
      const final = await repository.createFinal({ ...bindings, sourceVersionId: draft.versionId });
      const approval = await repository.approve({ caseId, versionId: final.versionId, reviewerRef });
      return { repository, final, approval };
    };

    let executor = new PgLaunchControlExecutor(pool);
    const { final, approval } = await makeApproved(executor);
    const releaseRequest = { caseId, versionId: final.versionId, recipient, policyVersion: bindings.policyVersion,
      modelVersion: bindings.modelVersion, evidenceVersion: bindings.evidenceVersion };

    await pool.end();
    pool = open();
    executor = new PgLaunchControlExecutor(pool);
    const readerAfterRestart = new PostgresReviewReleaseReader(executor);
    const persisted = await readerAfterRestart.getVersionState(final.versionId);
    assert.equal(persisted?.status, "approved");
    assert.equal(persisted?.approval?.approvalId, approval.approvalId);
    assert.equal((await new AsyncHumanReviewReleaseGate(readerAfterRestart).decide(releaseRequest)).allowed, true);

    const wrongRecipient = await new AsyncHumanReviewReleaseGate(readerAfterRestart).decide({ ...releaseRequest,
      recipient: { ...recipient, digest: "c".repeat(64) } });
    assert.equal(wrongRecipient.allowed, false);
    if (!wrongRecipient.allowed) assert.equal(wrongRecipient.code, "wrong_recipient");

    const changedEvidence = await new AsyncHumanReviewReleaseGate(readerAfterRestart).decide({ ...releaseRequest,
      evidenceVersion: "evidence-v2" });
    assert.equal(changedEvidence.allowed, false);
    if (!changedEvidence.allowed) assert.equal(changedEvidence.code, "approval_binding_mismatch");

    // A new draft records an append-only supersession, revoking release authority
    // for the formerly approved artifact even before a replacement is finalized.
    const changed = { ...bindings, artifactDigest: "d".repeat(64), evidenceVersion: "evidence-v2" };
    const currentDraft = await new PostgresReviewWriter(executor).createDraft(changed);
    const revoked = await new AsyncHumanReviewReleaseGate(readerAfterRestart).decide(releaseRequest);
    assert.equal(revoked.allowed, false);
    if (!revoked.allowed) assert.ok(["superseded", "stale_version"].includes(revoked.code));
    assert.equal(await readerAfterRestart.getCurrentVersionId(caseId), currentDraft.versionId);

    // Once a changed artifact/evidence version becomes final, the old approval
    // remains historical and cannot authorize it.
    const changedFinal = await new PostgresReviewWriter(executor).createFinal({ ...changed,
      sourceVersionId: currentDraft.versionId });
    const changedVersionDecision = await new AsyncHumanReviewReleaseGate(readerAfterRestart).decide({ ...releaseRequest,
      versionId: changedFinal.versionId, evidenceVersion: changed.evidenceVersion });
    assert.equal(changedVersionDecision.allowed, false);
    if (!changedVersionDecision.allowed) assert.equal(changedVersionDecision.code, "review_required");
  } finally {
    try {
      await pool?.end();
    } finally {
      try {
        if (targetVerified) await admin.query(`drop schema if exists ${schema} cascade`);
      } finally {
        await admin.end();
      }
    }
  }
});
