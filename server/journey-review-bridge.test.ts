import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJourneyCase,
  advanceJourney,
  type JourneyCase,
} from "./journey-state-machine";
import { JourneyReviewBridge } from "./journey-review-bridge";

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

describe("JourneyReviewBridge", () => {
  describe("createReviewForCase", () => {
    it("creates a review draft for a human_review case", () => {
      const bridge = new JourneyReviewBridge();
      let caseData = createNormalCase();
      caseData = advanceJourney(caseData, "request_human_review");
      assert.equal(caseData.state, "human_review");

      const version = bridge.createReviewForCase(caseData);
      assert.ok(version, "Should create a review version");
      assert.equal(version.caseId, caseData.id);
      assert.equal(version.stage, "draft");
      assert.equal(version.status, "draft");
    });

    it("creates a review draft for an escalation_required case", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();
      assert.equal(caseData.state, "escalation_required");

      const version = bridge.createReviewForCase(caseData);
      assert.ok(version, "Should create a review version");
      assert.equal(version.caseId, caseData.id);
      assert.equal(version.stage, "draft");
    });

    it("returns existing draft if one already exists", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      const v1 = bridge.createReviewForCase(caseData);
      const v2 = bridge.createReviewForCase(caseData);
      assert.ok(v1);
      assert.ok(v2);
      assert.equal(v1.versionId, v2.versionId, "Should return the same version");
    });

    it("returns undefined for non-reviewable states", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createNormalCase();
      assert.equal(caseData.state, "diagnosis_ready");

      const version = bridge.createReviewForCase(caseData);
      assert.equal(version, undefined);
    });
  });

  describe("finalizeReviewForCase", () => {
    it("promotes a draft to review_required", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      bridge.createReviewForCase(caseData);
      const finalized = bridge.finalizeReviewForCase(caseData);

      assert.ok(finalized);
      assert.equal(finalized.stage, "final");
      assert.equal(finalized.status, "review_required");
    });

    it("returns undefined if no draft exists", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      const finalized = bridge.finalizeReviewForCase(caseData);
      assert.equal(finalized, undefined);
    });

    it("returns undefined if already finalized", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      bridge.createReviewForCase(caseData);
      bridge.finalizeReviewForCase(caseData);
      const second = bridge.finalizeReviewForCase(caseData);
      assert.equal(second, undefined);
    });
  });

  describe("approveReview", () => {
    it("approves a finalized review", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      bridge.createReviewForCase(caseData);
      bridge.finalizeReviewForCase(caseData);

      const approval = bridge.approveReview(caseData.id, "reviewer_abc12345");
      assert.ok(approval);
      assert.equal(approval.reviewerRef, "reviewer_abc12345");
      assert.equal(approval.caseId, caseData.id);
    });

    it("throws if no review exists", () => {
      const bridge = new JourneyReviewBridge();
      assert.throws(
        () => bridge.approveReview("nonexistent-case", "reviewer_abc12345"),
        /No pending review/
      );
    });
  });

  describe("rejectReview", () => {
    it("rejects a finalized review", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      bridge.createReviewForCase(caseData);
      bridge.finalizeReviewForCase(caseData);

      const rejection = bridge.rejectReview(caseData.id, "reviewer_abc12345", "insufficient_evidence");
      assert.ok(rejection);
      assert.equal(rejection.reviewerRef, "reviewer_abc12345");
      assert.equal(rejection.reasonCode, "insufficient_evidence");
    });
  });

  describe("checkReleaseAllowed", () => {
    it("denies release when no review exists", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      const decision = bridge.checkReleaseAllowed(caseData);
      assert.equal(decision.allowed, false);
    });

    it("denies release when review is not approved", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      bridge.createReviewForCase(caseData);
      bridge.finalizeReviewForCase(caseData);

      const decision = bridge.checkReleaseAllowed(caseData);
      assert.equal(decision.allowed, false);
    });

    it("allows release when review is approved for non-critical cases", () => {
      const bridge = new JourneyReviewBridge();
      // Use a non-safety-triggered case that escalates via human review request
      let caseData = createNormalCase();
      caseData = advanceJourney(caseData, "request_human_review");
      assert.equal(caseData.state, "human_review");

      bridge.createReviewForCase(caseData);
      bridge.finalizeReviewForCase(caseData);
      bridge.approveReview(caseData.id, "reviewer_abc12345");

      const decision = bridge.checkReleaseAllowed(caseData);
      assert.equal(decision.allowed, true);
    });

    it("denies release for critical risk even when approved", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();
      assert.equal(caseData.riskLevel, "critical");

      bridge.createReviewForCase(caseData);
      bridge.finalizeReviewForCase(caseData);
      bridge.approveReview(caseData.id, "reviewer_abc12345", true);

      // Critical risk is always denied by the release gate - safety behavior
      const decision = bridge.checkReleaseAllowed(caseData);
      assert.equal(decision.allowed, false);
    });
  });

  describe("getReviewStatus", () => {
    it("returns undefined when no review exists", () => {
      const bridge = new JourneyReviewBridge();
      const status = bridge.getReviewStatus("nonexistent-case");
      assert.equal(status, undefined);
    });

    it("returns status for a review in progress", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      bridge.createReviewForCase(caseData);
      bridge.finalizeReviewForCase(caseData);

      const status = bridge.getReviewStatus(caseData.id);
      assert.ok(status);
      assert.equal(status.reviewStatus, "review_required");
      assert.equal(status.caseId, caseData.id);
    });

    it("returns status after approval", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      bridge.createReviewForCase(caseData);
      bridge.finalizeReviewForCase(caseData);
      bridge.approveReview(caseData.id, "reviewer_abc12345");

      const status = bridge.getReviewStatus(caseData.id);
      assert.ok(status);
      assert.equal(status.reviewStatus, "approved");
      assert.equal(status.reviewerRef, "reviewer_abc12345");
      assert.ok(status.reviewedAt);
    });
  });

  describe("buildEvidenceBoundary", () => {
    it("reports text-only when no file evidence", () => {
      const bridge = new JourneyReviewBridge();
      const caseData = createSafetyTriggeredCase();

      const boundary = bridge.buildEvidenceBoundary(caseData);
      assert.deepEqual(boundary.analyzedInputTypes, ["description"]);
      assert.equal(boundary.evidenceProcessing.audio, "not_provided");
      assert.equal(boundary.evidenceProcessing.video, "not_provided");
    });

    it("reports audio when audio evidence is persisted", () => {
      const bridge = new JourneyReviewBridge();
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
