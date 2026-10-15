import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJourneyCase,
  advanceJourney,
  type JourneyCase,
} from "./journey-state-machine";
import { JourneyReviewBridge, JourneyReviewPersistenceError } from "./journey-review-bridge";
import { InMemoryAsyncReviewRepository } from "./review/in-memory-async-review-repository";
import { NonDurableReviewRepositoryError, PostgresDurableReviewRepository } from "./review/durable-review-repository";
import type { AsyncReviewReleaseReader } from "./review/async-release-gate";
import type { AsyncReviewMutationRepository } from "./review/postgres-review-writer";

function createSafetyTriggeredCase(): JourneyCase {
  return createJourneyCase({
    vehicleInfo: "2020 Ford F-150",
    description: "Brakes failed completely, cannot stop the truck",
    urgency: "Not Safe to Drive",
    customerId: "cust-test-123",
    customerEmail: "test@example.com",
  });
}

function createNormalCase(): JourneyCase {
  let c = createJourneyCase({
    vehicleInfo: "2018 Honda Civic",
    description: "Grinding noise when braking at low speeds",
    timing: "Braking",
    urgency: "Safe to Drive",
    customerId: "cust-test-456",
    customerEmail: "owner@example.com",
  });
  c = advanceJourney(c, "submit_intake");
  c = advanceJourney(c, "request_evidence");
  c = advanceJourney(c, "submit_evidence", {
    evidence: [{ kind: "photo", description: "Brake rotor photo" }],
  });
  c = advanceJourney(c, "evaluate");
  c = advanceJourney(c, "ready_diagnosis");
  return c;
}

function newBridge() {
  return new JourneyReviewBridge({ repository: new InMemoryAsyncReviewRepository() });
}

describe("JourneyReviewBridge", () => {
  describe("durability gate", () => {
    it("refuses to construct without a repository instead of defaulting to in-memory state", () => {
      assert.throws(
        () => new JourneyReviewBridge(undefined as never),
        (error: unknown) => error instanceof JourneyReviewPersistenceError,
      );
      assert.throws(
        () => new JourneyReviewBridge({} as never),
        (error: unknown) => error instanceof JourneyReviewPersistenceError,
      );
    });

    it("the composed durable repository rejects an ephemeral review backend", () => {
      const ephemeral = new InMemoryAsyncReviewRepository();
      assert.equal(ephemeral.capabilities.durable, false);
      assert.throws(
        () => new PostgresDurableReviewRepository(ephemeral as unknown as AsyncReviewMutationRepository, ephemeral as unknown as AsyncReviewReleaseReader),
        (error: unknown) => error instanceof NonDurableReviewRepositoryError,
      );
    });
  });

  describe("createReviewForCase", () => {
    it("creates a review draft for a human_review case", async () => {
      const bridge = newBridge();
      let caseData = createNormalCase();
      caseData = advanceJourney(caseData, "request_human_review");
      assert.equal(caseData.state, "human_review");

      const version = await bridge.createReviewForCase(caseData);
      assert.ok(version, "Should create a review version");
      assert.equal(version.caseId, caseData.id);
      assert.equal(version.stage, "draft");
      assert.equal(version.status, "draft");
    });

    it("creates a review draft for an escalation_required case", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();
      assert.equal(caseData.state, "escalation_required");

      const version = await bridge.createReviewForCase(caseData);
      assert.ok(version, "Should create a review version");
      assert.equal(version.caseId, caseData.id);
      assert.equal(version.stage, "draft");
    });

    it("returns existing draft if one already exists", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      const v1 = await bridge.createReviewForCase(caseData);
      const v2 = await bridge.createReviewForCase(caseData);
      assert.ok(v1);
      assert.ok(v2);
      assert.equal(v1.versionId, v2.versionId, "Should return the same version");
    });

    it("starts a new draft when the case content changes", async () => {
      const bridge = newBridge();
      let original = createNormalCase();
      original = advanceJourney(original, "request_human_review");
      const firstDraft = await bridge.createReviewForCase(original);
      await bridge.finalizeReviewForCase(original);
      await bridge.approveReview(original, "reviewer_abc12345");

      const updated = { ...original, description: `${original.description} after driving longer` };
      const replacementDraft = await bridge.createReviewForCase(updated);

      assert.ok(firstDraft);
      assert.ok(replacementDraft);
      assert.notEqual(replacementDraft.versionId, firstDraft.versionId);
      assert.equal(replacementDraft.status, "draft");
      assert.deepEqual(await bridge.checkReleaseAllowed(updated), {
        allowed: false,
        reason: "review_required",
      });

      await bridge.finalizeReviewForCase(updated);
      await bridge.approveReview(updated, "reviewer_abc12345");
      assert.equal((await bridge.checkReleaseAllowed(updated)).allowed, true);
      assert.deepEqual(await bridge.checkReleaseAllowed(original), {
        allowed: false,
        reason: "approval_binding_mismatch",
      });
    });

    it("returns undefined for non-reviewable states", async () => {
      const bridge = newBridge();
      const caseData = createNormalCase();
      assert.equal(caseData.state, "diagnosis_ready");

      const version = await bridge.createReviewForCase(caseData);
      assert.equal(version, undefined);
    });

    it("fails closed with a persistence error when the durable store is unreachable", async () => {
      const failingBridge = new JourneyReviewBridge({ repository: new FailingReviewRepository() });
      const caseData = createSafetyTriggeredCase();
      await assert.rejects(
        () => failingBridge.createReviewForCase(caseData),
        (error: unknown) => error instanceof JourneyReviewPersistenceError,
      );
    });
  });

  describe("finalizeReviewForCase", () => {
    it("promotes a draft to review_required", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      await bridge.createReviewForCase(caseData);
      const finalized = await bridge.finalizeReviewForCase(caseData);

      assert.ok(finalized);
      assert.equal(finalized.stage, "final");
      assert.equal(finalized.status, "review_required");
    });

    it("returns undefined if no draft exists", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      const finalized = await bridge.finalizeReviewForCase(caseData);
      assert.equal(finalized, undefined);
    });

    it("returns undefined if already finalized", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);
      const second = await bridge.finalizeReviewForCase(caseData);
      assert.equal(second, undefined);
    });
  });

  describe("approveReview", () => {
    it("approves a finalized review", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);

      const approval = await bridge.approveReview(caseData, "reviewer_abc12345");
      assert.ok(approval);
      assert.equal(approval.reviewerRef, "reviewer_abc12345");
      assert.equal(approval.caseId, caseData.id);
    });

    it("throws if no review exists", async () => {
      const bridge = newBridge();
      await assert.rejects(
        () => bridge.approveReview({ id: "nonexistent-case" } as JourneyCase, "reviewer_abc12345"),
        /No pending review/,
      );
    });

    it("rejects approval when current evidence changed after finalization", async () => {
      const bridge = newBridge();
      let caseData = createNormalCase();
      caseData = advanceJourney(caseData, "request_human_review");
      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);

      const changed = {
        ...caseData,
        evidence: caseData.evidence.map((item, index) =>
          index === 0 ? { ...item, description: "Changed after review" } : item,
        ),
      };
      await assert.rejects(
        () => bridge.approveReview(changed, "reviewer_abc12345"),
        /approval_binding_mismatch/,
      );
      assert.equal((await bridge.getReviewStatus(caseData.id))?.reviewStatus, "review_required");
    });
  });

  describe("rejectReview", () => {
    it("rejects a finalized review", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);

      const rejection = await bridge.rejectReview(caseData.id, "reviewer_abc12345", "insufficient_evidence");
      assert.ok(rejection);
      assert.equal(rejection.reviewerRef, "reviewer_abc12345");
      assert.equal(rejection.reasonCode, "insufficient_evidence");
    });
  });

  describe("checkReleaseAllowed", () => {
    it("denies release when no review exists", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      const decision = await bridge.checkReleaseAllowed(caseData);
      assert.equal(decision.allowed, false);
    });

    it("denies release when review is not approved", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);

      const decision = await bridge.checkReleaseAllowed(caseData);
      assert.equal(decision.allowed, false);
    });

    it("allows release when review is approved for non-critical cases", async () => {
      const bridge = newBridge();
      // Use a non-safety-triggered case that escalates via human review request
      let caseData = createNormalCase();
      caseData = advanceJourney(caseData, "request_human_review");
      assert.equal(caseData.state, "human_review");

      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);
      await bridge.approveReview(caseData, "reviewer_abc12345");

      const decision = await bridge.checkReleaseAllowed(caseData);
      assert.equal(decision.allowed, true);
    });

    it("denies release when evidence content changes without changing its count", async () => {
      const bridge = newBridge();
      let caseData = createNormalCase();
      caseData = advanceJourney(caseData, "request_human_review");
      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);
      await bridge.approveReview(caseData, "reviewer_abc12345");

      const changedEvidence = {
        ...caseData,
        evidence: caseData.evidence.map((item, index) =>
          index === 0 ? { ...item, description: "A different brake component photo" } : item,
        ),
      };
      const decision = await bridge.checkReleaseAllowed(changedEvidence);

      assert.deepEqual(decision, { allowed: false, reason: "approval_binding_mismatch" });
    });

    it("allows release when identical evidence object keys are reordered", async () => {
      const bridge = newBridge();
      let caseData = createNormalCase();
      caseData = advanceJourney(caseData, "request_human_review");
      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);
      await bridge.approveReview(caseData, "reviewer_abc12345");

      const reordered = {
        ...caseData,
        evidence: caseData.evidence.map((item) =>
          Object.fromEntries(Object.entries(item).reverse()) as typeof item,
        ),
      };
      const decision = await bridge.checkReleaseAllowed(reordered);

      assert.equal(decision.allowed, true);
    });

    it("denies release for critical risk even when approved", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();
      assert.equal(caseData.riskLevel, "critical");

      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);
      await bridge.approveReview(caseData, "reviewer_abc12345", true);

      // Critical risk is always denied by the release gate - safety behavior
      const decision = await bridge.checkReleaseAllowed(caseData);
      assert.equal(decision.allowed, false);
    });
  });

  describe("getReviewStatus", () => {
    it("returns undefined when no review exists", async () => {
      const bridge = newBridge();
      const status = await bridge.getReviewStatus("nonexistent-case");
      assert.equal(status, undefined);
    });

    it("returns status for a review in progress", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);

      const status = await bridge.getReviewStatus(caseData.id);
      assert.ok(status);
      assert.equal(status.reviewStatus, "review_required");
      assert.equal(status.caseId, caseData.id);
    });

    it("returns status after approval", async () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      await bridge.createReviewForCase(caseData);
      await bridge.finalizeReviewForCase(caseData);
      await bridge.approveReview(caseData, "reviewer_abc12345");

      const status = await bridge.getReviewStatus(caseData.id);
      assert.ok(status);
      assert.equal(status.reviewStatus, "approved");
      assert.equal(status.reviewerRef, "reviewer_abc12345");
      assert.ok(status.reviewedAt);
    });
  });

  describe("buildEvidenceBoundary", () => {
    it("reports text-only when no file evidence", () => {
      const bridge = newBridge();
      const caseData = createSafetyTriggeredCase();

      const boundary = bridge.buildEvidenceBoundary(caseData);
      assert.deepEqual(boundary.analyzedInputTypes, ["description"]);
      assert.equal(boundary.evidenceProcessing.audio, "not_provided");
      assert.equal(boundary.evidenceProcessing.video, "not_provided");
    });

    it("reports audio when audio evidence is persisted", () => {
      const bridge = newBridge();
      // Build a case that has audio evidence from the start
      let caseData = createJourneyCase({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking at low speeds",
        timing: "Braking",
        urgency: "Safe to Drive",
        customerId: "cust-test-789",
        customerEmail: "audio@example.com",
      });
      caseData = advanceJourney(caseData, "submit_intake");
      caseData = advanceJourney(caseData, "request_evidence");
      caseData = advanceJourney(caseData, "submit_evidence", {
        evidence: [
          { kind: "audio", description: "Engine noise recording", status: "persisted" },
        ],
      });

      const boundary = bridge.buildEvidenceBoundary(caseData);
      assert.ok(boundary.analyzedInputTypes.includes("audio"));
      assert.equal(boundary.evidenceProcessing.audio, "stored_for_human_review_not_analyzed");
    });
  });
});

class FailingReviewRepository {
  readonly capabilities = { backendClass: "durable-repository" as const, durable: true, appendOnlyAudit: true, caseBoundTransitions: true, generatedIdentifiers: true };
  async createDraft(): Promise<never> { throw new Error("storage unavailable"); }
  async createFinal(): Promise<never> { throw new Error("storage unavailable"); }
  async approve(): Promise<never> { throw new Error("storage unavailable"); }
  async reject(): Promise<never> { throw new Error("storage unavailable"); }
  async supersede(): Promise<never> { throw new Error("storage unavailable"); }
  async getVersion(): Promise<never> { throw new Error("storage unavailable"); }
  async getVersionState(): Promise<never> { throw new Error("storage unavailable"); }
  async getCurrentVersionId(): Promise<never> { throw new Error("storage unavailable"); }
}
