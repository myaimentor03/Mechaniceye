import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryReviewRepository } from "./in-memory-review-repository.js";
import { AsyncHumanReviewReleaseGate, ReviewReleaseReadError, type AsyncReviewReleaseReader } from "./async-release-gate.js";

const recipient = { algorithm: "sha256" as const, digest: "a".repeat(64), bindingVersion: "email-v1" };
const bindings = { policyVersion: "policy-v1", modelVersion: "model-v1", evidenceVersion: "evidence-v1" };

function asyncReader(repository: InMemoryReviewRepository): AsyncReviewReleaseReader {
  return {
    capabilities: { ...repository.capabilities, backendClass: "durable-repository", durable: true },
    async getVersion(id) { return repository.getVersion(id); },
    async getVersionState(id) { return repository.getVersionState(id); },
    async getCurrentVersionId(caseId) { return repository.getCurrentVersionId(caseId); },
  };
}

test("awaits durable state and releases only the exact approved final version", async () => {
  const repository = new InMemoryReviewRepository({ generateId: (() => { let id = 0; return () => String(++id); })() });
  const draft = repository.createDraft({ caseId: "CASE-1", artifactDigest: "b".repeat(64), recipient, riskLevel: "moderate", ...bindings });
  const final = repository.createFinal({ caseId: "CASE-1", sourceVersionId: draft.versionId, artifactDigest: "c".repeat(64), recipient, riskLevel: "moderate", ...bindings });
  repository.approve({ caseId: "CASE-1", versionId: final.versionId, reviewerRef: "reviewer_12345678" });
  const decision = await new AsyncHumanReviewReleaseGate(asyncReader(repository)).decide({
    caseId: "CASE-1", versionId: final.versionId, recipient, ...bindings,
  });
  assert.equal(decision.allowed, true);
});

test("denies stale and recipient-mismatched requests", async () => {
  const repository = new InMemoryReviewRepository({ generateId: (() => { let id = 0; return () => String(++id); })() });
  const old = repository.createDraft({ caseId: "CASE-1", artifactDigest: "b".repeat(64), recipient, riskLevel: "low", ...bindings });
  repository.createDraft({ caseId: "CASE-1", artifactDigest: "c".repeat(64), recipient, riskLevel: "low", ...bindings });
  const gate = new AsyncHumanReviewReleaseGate(asyncReader(repository));
  assert.equal((await gate.decide({ caseId: "CASE-1", versionId: old.versionId, recipient, ...bindings })).allowed, false);
  const current = repository.getCurrentVersionId("CASE-1")!;
  const wrongRecipient = { ...recipient, digest: "d".repeat(64) };
  const decision = await gate.decide({ caseId: "CASE-1", versionId: current, recipient: wrongRecipient, ...bindings });
  assert.equal(decision.allowed, false);
  if (!decision.allowed) assert.equal(decision.code, "wrong_recipient");
});

test("storage failures never become denial-as-success or release approval", async () => {
  const reader: AsyncReviewReleaseReader = {
    capabilities: { backendClass: "durable-repository", durable: true, appendOnlyAudit: true, caseBoundTransitions: true, generatedIdentifiers: true },
    async getVersion() { throw new Error("database credentials and details"); },
    async getVersionState() { throw new Error("unused"); },
    async getCurrentVersionId() { throw new Error("unused"); },
  };
  await assert.rejects(
    new AsyncHumanReviewReleaseGate(reader).decide({ caseId: "CASE-1", versionId: "version_1", recipient, ...bindings }),
    (error) => error instanceof ReviewReleaseReadError && !error.message.includes("database"),
  );
});
