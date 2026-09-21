import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  pollAndEvaluate,
  getUnattendedWorkerStatus,
} from "./journey-unattended-worker";
import {
  createJourneyCase,
  advanceJourney,
  type JourneyCase,
} from "./journey-state-machine";
import { setJourneyCase, clearJourneyStoreForTests } from "./journey-store";
import { clearJourneyEventsForTests } from "./journey-case-events";
import { clearNotificationsForTests } from "./journey-notifications";

describe("journey-unattended-worker", () => {
  beforeEach(() => {
    clearJourneyStoreForTests();
    clearJourneyEventsForTests();
    clearNotificationsForTests();
  });

  function createCaseInEvidenceReceived(overrides?: Partial<{
    customerId: string;
    confidenceScore: number;
    confidenceLevel: "low" | "moderate" | "high";
  }>): JourneyCase {
    // Create a case and advance it to evidence_received state
    let caseData = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Car makes a grinding noise when braking at low speeds, grinding sound",
      timing: "Braking",
      urgency: "Safe to Drive",
      canDrive: "Yes",
      customerId: overrides?.customerId || "cust-test-worker",
    });

    // Advance through states: intake -> triage
    caseData = advanceJourney(caseData, "submit_intake");
    caseData = advanceJourney(caseData, "acknowledge_triage");

    // Add evidence to bump confidence
    caseData = advanceJourney(caseData, "submit_evidence", {
      evidence: [{ kind: "photo", description: "Grinding brake photo" }],
    });

    // If in evidence_requested, move to evidence_received
    if (caseData.state === "evidence_requested") {
      caseData = advanceJourney(caseData, "finish_evidence");
    }

    // If we need to override confidence, set it directly
    if (overrides?.confidenceLevel) {
      caseData.confidenceLevel = overrides.confidenceLevel;
      caseData.confidenceScore = overrides.confidenceScore || 50;
    }

    setJourneyCase(caseData);
    return caseData;
  }

  describe("pollAndEvaluate", () => {
    it("returns 0 when no eligible cases exist", async () => {
      const processed = await pollAndEvaluate();
      assert.equal(processed, 0);
    });

    it("auto-evaluates eligible cases in evidence_received state", async () => {
      const caseData = createCaseInEvidenceReceived({
        confidenceLevel: "moderate",
        confidenceScore: 50,
      });

      assert.equal(caseData.state, "evidence_received", "Case should start in evidence_received");

      const processed = await pollAndEvaluate();
      assert.equal(processed, 1, "Should process 1 case");

      // The case should have been advanced out of evidence_received
      // (it goes through evaluate -> evaluating -> ready_diagnosis via shouldAutoEvaluate)
    });

    it("does not evaluate cases with low confidence", async () => {
      const caseData = createCaseInEvidenceReceived({
        confidenceLevel: "low",
        confidenceScore: 10,
      });

      const processed = await pollAndEvaluate();
      assert.equal(processed, 0, "Should not process cases with low confidence");
    });

    it("does not evaluate safety-triggered cases", async () => {
      let caseData = createJourneyCase({
        vehicleInfo: "2020 Ford F-150",
        description: "Brakes failed completely, cannot stop the truck, brake failure",
        urgency: "Not Safe to Drive",
      });

      // Safety-triggered cases go directly to escalation_required
      assert.equal(caseData.state, "escalation_required");
      setJourneyCase(caseData);

      const processed = await pollAndEvaluate();
      assert.equal(processed, 0, "Should not process safety-triggered cases");
    });

    it("does not evaluate cases without evidence", async () => {
      let caseData = createJourneyCase({
        vehicleInfo: "2019 Toyota Camry",
        description: "Check engine light is on, engine light",
        timing: "Constantly",
        urgency: "Safe to Drive",
      });

      // Advance to triage
      caseData = advanceJourney(caseData, "submit_intake");
      caseData = advanceJourney(caseData, "acknowledge_triage");
      // Manually set state to evidence_received without adding evidence
      caseData.state = "evidence_received";
      caseData.confidenceLevel = "moderate";
      caseData.confidenceScore = 50;
      setJourneyCase(caseData);

      const processed = await pollAndEvaluate();
      assert.equal(processed, 0, "Should not process cases without evidence");
    });

    it("does not evaluate cases already resolved", async () => {
      const caseData = createCaseInEvidenceReceived({
        confidenceLevel: "high",
        confidenceScore: 80,
      });

      // Manually resolve the case
      const resolved = advanceJourney(caseData, "evaluate");
      const ready = advanceJourney(resolved, "ready_diagnosis");
      const final = advanceJourney(ready, "resolve", { outcome: "fix" });
      setJourneyCase(final);

      const processed = await pollAndEvaluate();
      assert.equal(processed, 0, "Should not process already-resolved cases");
    });

    it("does not evaluate cases in human_review", async () => {
      const caseData = createCaseInEvidenceReceived({
        confidenceLevel: "high",
        confidenceScore: 80,
      });

      // Advance to diagnosis_ready then request human review
      let evaluated = advanceJourney(caseData, "evaluate");
      evaluated = advanceJourney(evaluated, "ready_diagnosis");
      evaluated = advanceJourney(evaluated, "request_human_review");
      setJourneyCase(evaluated);

      const processed = await pollAndEvaluate();
      assert.equal(processed, 0, "Should not process cases in human_review");
    });

    it("handles multiple eligible cases in one batch", async () => {
      const case1 = createCaseInEvidenceReceived({
        customerId: "cust-worker-1",
        confidenceLevel: "moderate",
        confidenceScore: 45,
      });

      const case2 = createCaseInEvidenceReceived({
        customerId: "cust-worker-2",
        confidenceLevel: "high",
        confidenceScore: 80,
      });

      const processed = await pollAndEvaluate();
      assert.ok(processed >= 1, "Should process at least 1 case");
      assert.ok(processed <= 2, "Should process at most 2 cases");
    });

    it("is idempotent — running twice does not reprocess", async () => {
      createCaseInEvidenceReceived({
        confidenceLevel: "moderate",
        confidenceScore: 50,
      });

      const first = await pollAndEvaluate();
      assert.equal(first, 1, "First run should process 1 case");

      const second = await pollAndEvaluate();
      assert.equal(second, 0, "Second run should process 0 cases (already evaluated)");
    });
  });

  describe("getUnattendedWorkerStatus", () => {
    it("returns valid status object", () => {
      const status = getUnattendedWorkerStatus();
      assert.equal(typeof status.running, "boolean");
      assert.equal(typeof status.totalProcessed, "number");
      assert.equal(typeof status.totalErrors, "number");
      assert.equal(typeof status.pollIntervalMs, "number");
      assert.ok(status.pollIntervalMs >= 5000, "Poll interval should be at least 5s");
    });
  });
});
