import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJourneyCase,
  advanceJourney,
  evaluateSafetyFlags,
  calculateConfidence,
  determineOutcome,
  isValidTransition,
  hasSafetyTrigger,
  buildNextAction,
  generateJourneyCaseId,
  type JourneyCase,
  type SafetyFlag,
} from "./journey-state-machine";

describe("journey-state-machine", () => {
  describe("generateJourneyCaseId", () => {
    it("produces a JRN- prefixed ID", () => {
      const id = generateJourneyCaseId();
      assert.ok(id.startsWith("JRN-"), `Expected JRN- prefix, got ${id}`);
      assert.ok(id.length > 20, "ID should be reasonably long");
    });

    it("generates unique IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateJourneyCaseId()));
      assert.equal(ids.size, 100, "All generated IDs should be unique");
    });
  });

  describe("createJourneyCase", () => {
it("creates a case in intake state with basic info", () => {
       const caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
         timing: "Braking",
         urgency: "Safe to Drive",
       });

       assert.ok(caseData.id.startsWith("JRN-"));
       assert.equal(caseData.state, "intake");
       assert.equal(caseData.vehicleInfo, "2018 Honda Civic");
       assert.equal(caseData.description, "Car makes a grinding noise when braking at low speeds");
       assert.equal(caseData.timing, "Braking");
       assert.equal(caseData.urgency, "Safe to Drive");
       assert.equal(caseData.safetyTriggered, false);
       assert.equal(caseData.evidence.length, 0);
       assert.equal(caseData.humanReviewRequested, false);
     });

    it("escalates to escalation_required when safety trigger detected", () => {
      const caseData = createJourneyCase({
        vehicleInfo: "2020 Ford F-150",
        description: "Brakes failed completely, cannot stop the truck",
        urgency: "Not Safe to Drive",
      });

      assert.equal(caseData.state, "escalation_required");
      assert.equal(caseData.safetyTriggered, true);
      assert.ok(caseData.safetyFlags.some((f) => f.matched && f.triggerId === "brakes"));
      assert.equal(caseData.escalationReason, "Safety trigger detected during intake");
      assert.equal(caseData.humanReviewRequested, false);
    });

    it("detects overheating safety trigger", () => {
      const caseData = createJourneyCase({
        vehicleInfo: "2015 Toyota Camry",
        description: "Engine is overheating, steam coming from under the hood",
        urgency: "Not Safe to Drive",
      });

      assert.equal(caseData.safetyTriggered, true);
      assert.ok(caseData.safetyFlags.some((f) => f.matched && f.triggerId === "overheating"));
    });

    it("detects smoke/fire safety trigger", () => {
      const caseData = createJourneyCase({
        vehicleInfo: "2019 Chevrolet Malibu",
        description: "I see smoke coming from the engine bay",
        urgency: "Not Safe to Drive",
      });

      assert.equal(caseData.safetyTriggered, true);
      assert.ok(caseData.safetyFlags.some((f) => f.matched && f.triggerId === "smoke_fire"));
    });

    it("detects steering safety trigger", () => {
      const caseData = createJourneyCase({
        vehicleInfo: "2021 Subaru Outback",
        description: "Steering wheel is loose, I cannot steer properly",
        urgency: "Not Safe to Drive",
      });

      assert.equal(caseData.safetyTriggered, true);
      assert.ok(caseData.safetyFlags.some((f) => f.matched && f.triggerId === "steering"));
    });

    it("calculates confidence score based on evidence", () => {
      const caseData = createJourneyCase({
        vehicleInfo: "2017 Honda Accord",
        description: "Engine runs rough and shakes at idle, check engine light is on",
        timing: "Idle",
        urgency: "Safe to Drive",
      });

      assert.ok(caseData.confidenceScore > 0, "Should have some confidence from basic info");
      assert.ok(caseData.confidenceLevel === "low" || caseData.confidenceLevel === "moderate" || caseData.confidenceLevel === "high");
    });
  });

  describe("isValidTransition", () => {
    it("allows submit_intake from intake state", () => {
      assert.equal(isValidTransition("intake", "submit_intake"), true);
    });

    it("rejects invalid transitions", () => {
      assert.equal(isValidTransition("intake", "resolve"), false);
      assert.equal(isValidTransition("resolved", "submit_intake"), false);
      assert.equal(isValidTransition("triage", "submit_intake"), false);
    });

    it("allows common flow transitions", () => {
      assert.equal(isValidTransition("triage", "request_evidence"), true);
      assert.equal(isValidTransition("evidence_requested", "submit_evidence"), true);
      assert.equal(isValidTransition("evidence_received", "evaluate"), true);
      assert.equal(isValidTransition("evaluating", "ready_diagnosis"), true);
      assert.equal(isValidTransition("diagnosis_ready", "resolve"), true);
    });

    it("allows escalation from multiple states", () => {
      assert.equal(isValidTransition("triage", "escalate"), true);
      assert.equal(isValidTransition("evidence_requested", "escalate"), true);
      assert.equal(isValidTransition("evidence_received", "escalate"), true);
      assert.equal(isValidTransition("evaluating", "escalate"), true);
      assert.equal(isValidTransition("diagnosis_ready", "escalate"), true);
    });

    it("allows evidence submit directly from triage", () => {
      assert.equal(isValidTransition("triage", "submit_evidence"), true);
    });

    it("allows stop-driving resolution from evidence_requested", () => {
      assert.equal(isValidTransition("evidence_requested", "resolve_stop_driving"), true);
    });

    it("allows human review request from escalation_required", () => {
      assert.equal(isValidTransition("escalation_required", "request_human_review"), true);
    });

    it("allows acknowledge_triage from triage", () => {
      assert.equal(isValidTransition("triage", "acknowledge_triage"), true);
    });

    it("allows finish_evidence from evidence_requested", () => {
      assert.equal(isValidTransition("evidence_requested", "finish_evidence"), true);
    });
  });

describe("advanceJourney", () => {
     it("advances from intake to triage via submit_intake", () => {
       const caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
       });

       assert.equal(caseData.state, "intake");
       const updated = advanceJourney(caseData, "submit_intake");
       assert.equal(updated.state, "triage");
     });

     it("advances from triage to evidence_requested", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
       });
       caseData = advanceJourney(caseData, "submit_intake");
       assert.equal(caseData.state, "triage");

       const updated = advanceJourney(caseData, "request_evidence");
       assert.equal(updated.state, "evidence_requested");
       assert.ok(updated.updatedAt >= caseData.updatedAt);
     });

     it("advances through full happy path: intake -> triage -> evidence_requested -> evidence_received -> evaluating -> diagnosis_ready -> resolved", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2020 Toyota RAV4",
         description: "Check engine light is on, car runs a little rough",
         timing: "Constantly",
         urgency: "Safe to Drive",
       });

       assert.equal(caseData.state, "intake");
       caseData = advanceJourney(caseData, "submit_intake");
       assert.equal(caseData.state, "triage");

       caseData = advanceJourney(caseData, "request_evidence");
       assert.equal(caseData.state, "evidence_requested");

      caseData = advanceJourney(caseData, "submit_evidence", {
        evidence: [{ kind: "photo", description: "Check engine light photo" }],
      });
      assert.equal(caseData.state, "evidence_received");
      assert.equal(caseData.evidence.length, 1);

      caseData = advanceJourney(caseData, "evaluate");
      assert.equal(caseData.state, "evaluating");

      caseData = advanceJourney(caseData, "ready_diagnosis");
      assert.equal(caseData.state, "diagnosis_ready");
      assert.ok(caseData.outcome, "Should have determined an outcome");

      caseData = advanceJourney(caseData, "resolve");
      assert.equal(caseData.state, "resolved");
      assert.ok(caseData.outcome);
      assert.ok(caseData.decisionPath || caseData.outcome === "stop_driving");
    });

    it("accepts evidence directly from triage without a separate request step", () => {
      let caseData = createJourneyCase({
        vehicleInfo: "2018 Honda Civic",
        description: "Car makes a grinding noise when braking at low speeds",
      });

assert.equal(caseData.state, "intake");
       caseData = advanceJourney(caseData, "submit_intake");
       assert.equal(caseData.state, "triage");
       caseData = advanceJourney(caseData, "submit_evidence", {
         evidence: [{ kind: "photo", description: "Brake rotor photo" }],
       });

      assert.equal(caseData.state, "evidence_received");
      assert.equal(caseData.evidence.length, 1);
    });

it("resolves stop-driving directly from evidence_requested", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
       });
       caseData = advanceJourney(caseData, "submit_intake");
       caseData = advanceJourney(caseData, "request_evidence");
       assert.equal(caseData.state, "evidence_requested");
       caseData = advanceJourney(caseData, "resolve_stop_driving");
       assert.equal(caseData.state, "resolved");
       assert.equal(caseData.outcome, "stop_driving");
     });

it("request_human_review transitions from escalation_required to human_review", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
       });
       caseData = advanceJourney(caseData, "submit_intake");

       caseData = advanceJourney(caseData, "escalate", {
         escalationReason: "Reviewer should double-check",
       });
       assert.equal(caseData.state, "escalation_required");
       caseData = advanceJourney(caseData, "request_human_review");

       assert.equal(caseData.state, "human_review");
     });

it("acknowledge_triage transitions from intake to evidence_requested", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
       });
       caseData = advanceJourney(caseData, "submit_intake");
       assert.equal(caseData.state, "triage");
       caseData = advanceJourney(caseData, "acknowledge_triage");
       assert.equal(caseData.state, "evidence_requested");
       assert.ok(caseData.nextAction === "submit_evidence" || caseData.nextAction === "finish_evidence");
       assert.ok(caseData.nextActionPrompt.length > 0);
     });

it("finish_evidence transitions from evidence_requested to evidence_received", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
       });
       caseData = advanceJourney(caseData, "submit_intake");
       caseData = advanceJourney(caseData, "request_evidence");
       assert.equal(caseData.state, "evidence_requested");
       caseData = advanceJourney(caseData, "finish_evidence");
       assert.equal(caseData.state, "evidence_received");
       assert.equal(caseData.nextAction, "evaluate");
       assert.ok(caseData.nextActionPrompt.length > 0);
     });

    it("rejects invalid transitions with an error", () => {
      const caseData = createJourneyCase({
        vehicleInfo: "2018 Honda Civic",
        description: "Car makes a grinding noise when braking at low speeds",
      });

      assert.throws(
        () => advanceJourney(caseData, "resolve"),
        /Invalid transition/,
      );
    });

it("adds evidence on submit_evidence transition", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
       });
       caseData = advanceJourney(caseData, "submit_intake");
       caseData = advanceJourney(caseData, "request_evidence");
       caseData = advanceJourney(caseData, "submit_evidence", {
         evidence: [
           { kind: "photo", description: "Brake rotor photo" },
           { kind: "text", description: "Grinding noise happens at low speed only" },
         ],
       });

       assert.equal(caseData.evidence.length, 2);
       assert.equal(caseData.evidence[0].kind, "photo");
       assert.equal(caseData.evidence[1].kind, "text");
     });

it("escalates when requested", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
       });
       caseData = advanceJourney(caseData, "submit_intake");

       caseData = advanceJourney(caseData, "escalate", {
         escalationReason: "Confidence too low for automated path",
       });

       assert.equal(caseData.state, "escalation_required");
       assert.equal(caseData.escalationReason, "Confidence too low for automated path");
       assert.equal(caseData.humanReviewRequested, true);
     });

it("resolves with resolve_stop_driving", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2020 Ford F-150",
         description: "Brakes failed completely, cannot stop the truck",
         urgency: "Not Safe to Drive",
       });
       assert.equal(caseData.state, "escalation_required");

       caseData = advanceJourney(caseData, "resolve_stop_driving");
       assert.equal(caseData.state, "resolved");
       assert.equal(caseData.outcome, "stop_driving");
     });

     it("request_human_review transitions to human_review state", () => {
       let caseData = createJourneyCase({
         vehicleInfo: "2018 Honda Civic",
         description: "Car makes a grinding noise when braking at low speeds",
       });
       caseData = advanceJourney(caseData, "submit_intake");

       caseData = advanceJourney(caseData, "request_evidence");
       caseData = advanceJourney(caseData, "submit_evidence", {
         evidence: [{ kind: "photo", description: "Photo" }],
       });
       caseData = advanceJourney(caseData, "evaluate");
       caseData = advanceJourney(caseData, "ready_diagnosis");
       caseData = advanceJourney(caseData, "request_human_review");

       assert.equal(caseData.state, "human_review");
     });
  });

  describe("evaluateSafetyFlags", () => {
    it("returns no matched flags for safe description", () => {
      const flags = evaluateSafetyFlags({
        description: "Car makes a grinding noise when braking",
        urgency: "Safe to Drive",
      });

      assert.equal(flags.length > 0, true, "Should have flags");
      assert.equal(hasSafetyTrigger(flags), false);
    });

    it("detects brake failure", () => {
      const flags = evaluateSafetyFlags({
        description: "Brake failure, pedal goes to the floor",
        urgency: "Not Safe to Drive",
      });

      const brakeFlag = flags.find((f) => f.triggerId === "brakes");
      assert.ok(brakeFlag);
      assert.equal(brakeFlag.matched, true);
    });

    it("detects fuel leak", () => {
      const flags = evaluateSafetyFlags({
        description: "Strong fuel smell coming from under the car",
      });

      const fuelFlag = flags.find((f) => f.triggerId === "fuel_leak");
      assert.ok(fuelFlag);
      assert.equal(fuelFlag.matched, true);
    });

    it("detects multiple safety triggers", () => {
      const flags = evaluateSafetyFlags({
        description: "Smoke from engine and brake failure",
        urgency: "Not Safe to Drive",
      });

      assert.equal(hasSafetyTrigger(flags), true);
      assert.ok(flags.some((f) => f.triggerId === "smoke_fire" && f.matched));
      assert.ok(flags.some((f) => f.triggerId === "brakes" && f.matched));
    });

    it("is case-insensitive", () => {
      const flags = evaluateSafetyFlags({
        description: "SMOKE coming from the engine",
      });

      const smokeFlag = flags.find((f) => f.triggerId === "smoke_fire");
      assert.ok(smokeFlag);
      assert.equal(smokeFlag.matched, true);
    });
  });

  describe("calculateConfidence", () => {
    it("returns low confidence for minimal info", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "triage",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "Car",
        description: "Noise",
        evidence: [],
        safetyFlags: [],
        safetyTriggered: false,
        confidenceScore: 0,
        confidenceLevel: "insufficient_information",
        riskLevel: "unknown",
        humanReviewRequested: false,
      };

      const conf = calculateConfidence(caseData);
      assert.ok(conf.score < 30, `Expected low score, got ${conf.score}`);
      assert.ok(conf.level === "low" || conf.level === "insufficient_information");
    });

    it("returns higher confidence with more evidence", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "triage",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "2020 Toyota RAV4 XLE",
        description: "Check engine light is on, car runs rough at idle, shaking felt through steering wheel",
        timing: "Idle",
        urgency: "Safe to Drive",
        canDrive: "Yes",
        evidence: [
          { id: "1", kind: "photo", addedAt: new Date().toISOString(), description: "Check engine light" },
          { id: "2", kind: "photo", addedAt: new Date().toISOString(), description: "Engine bay" },
          { id: "3", kind: "text", addedAt: new Date().toISOString(), description: "OBD code P0300" },
        ],
        safetyFlags: [],
        safetyTriggered: false,
        confidenceScore: 0,
        confidenceLevel: "insufficient_information",
        riskLevel: "unknown",
        humanReviewRequested: false,
      };

      const conf = calculateConfidence(caseData);
      assert.ok(conf.score >= 50, `Expected moderate-high score, got ${conf.score}`);
      assert.ok(["moderate", "high"].includes(conf.level));
    });

    it("marks risk as critical when safety triggered", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "escalation_required",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "2020 Ford F-150",
        description: "Brakes failed completely",
        evidence: [],
        safetyFlags: [{ triggerId: "brakes", label: "Brake Safety Risk", matched: true }],
        safetyTriggered: true,
        confidenceScore: 0,
        confidenceLevel: "insufficient_information",
        riskLevel: "unknown",
        humanReviewRequested: true,
      };

      const conf = calculateConfidence(caseData);
      assert.equal(conf.riskLevel, "critical");
    });
  });

  describe("determineOutcome", () => {
    it("returns stop_driving when safety triggered", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "escalation_required",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "2020 Ford F-150",
        description: "Brakes failed",
        evidence: [],
        safetyFlags: [],
        safetyTriggered: true,
        confidenceScore: 0,
        confidenceLevel: "insufficient_information",
        riskLevel: "critical",
        humanReviewRequested: false,
      };

      assert.equal(determineOutcome(caseData), "stop_driving");
    });

    it("returns fix for not-safe-to-drive urgency", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "evaluating",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "2020 Ford F-150",
        description: "Engine knocking loudly",
        urgency: "Not Safe to Drive",
        evidence: [],
        safetyFlags: [],
        safetyTriggered: false,
        confidenceScore: 50,
        confidenceLevel: "moderate",
        riskLevel: "medium",
        humanReviewRequested: false,
      };

      assert.equal(determineOutcome(caseData), "fix");
    });

    it("returns monitor for low confidence", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "evaluating",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "Car",
        description: "Weird noise",
        evidence: [],
        safetyFlags: [],
        safetyTriggered: false,
        confidenceScore: 10,
        confidenceLevel: "low",
        riskLevel: "high",
        humanReviewRequested: false,
      };

      assert.equal(determineOutcome(caseData), "monitor");
    });

    it("returns sell when the owner expresses sell intent", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "evaluating",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "2012 Nissan Altima",
        description: "Transmission slips badly, thinking about selling the car as-is since repairs cost too much",
        urgency: "Safe to Drive",
        evidence: [],
        safetyFlags: [],
        safetyTriggered: false,
        confidenceScore: 60,
        confidenceLevel: "moderate",
        riskLevel: "medium",
        humanReviewRequested: false,
      };

      assert.equal(determineOutcome(caseData), "sell");
    });

    it("returns sell for catastrophic damage with sufficient confidence", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "evaluating",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "2010 Ford Explorer",
        description: "Mechanic says the engine is seized and it needs a new engine, high mileage and rust everywhere",
        timing: "Constantly",
        urgency: "Will Not Start",
        canDrive: "No",
        evidence: [
          { id: "1", kind: "photo", addedAt: new Date().toISOString() },
          { id: "2", kind: "text", addedAt: new Date().toISOString() },
        ],
        safetyFlags: [],
        safetyTriggered: false,
        confidenceScore: 70,
        confidenceLevel: "high",
        riskLevel: "low",
        humanReviewRequested: false,
      };

      assert.equal(determineOutcome(caseData), "sell");
    });

    it("does not sell catastrophic damage on low confidence — asks for more evidence first", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "evaluating",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "Car",
        description: "Blown engine maybe",
        evidence: [],
        safetyFlags: [],
        safetyTriggered: false,
        confidenceScore: 10,
        confidenceLevel: "low",
        riskLevel: "high",
        humanReviewRequested: false,
      };

      assert.equal(determineOutcome(caseData), "monitor");
    });

    it("safety takes precedence over sell intent", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "evaluating",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "2020 Ford F-150",
        description: "Brakes failed completely, I want to sell it",
        urgency: "Not Safe to Drive",
        evidence: [],
        safetyFlags: [],
        safetyTriggered: true,
        confidenceScore: 60,
        confidenceLevel: "moderate",
        riskLevel: "critical",
        humanReviewRequested: false,
      };

      assert.equal(determineOutcome(caseData), "stop_driving");
    });

    it("returns fix for moderate confidence", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "evaluating",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light, runs rough at idle, no mention of parting with the vehicle",
        timing: "Idle",
        urgency: "Safe to Drive",
        evidence: [
          { id: "1", kind: "photo", addedAt: new Date().toISOString() },
          { id: "2", kind: "text", addedAt: new Date().toISOString() },
        ],
        safetyFlags: [],
        safetyTriggered: false,
        confidenceScore: 60,
        confidenceLevel: "moderate",
        riskLevel: "medium",
        humanReviewRequested: false,
      };

      assert.equal(determineOutcome(caseData), "fix");
    });
  });

  describe("buildNextAction", () => {
    it("returns intake prompt for intake state", () => {
      const caseData = createJourneyCase({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      });

      const action = buildNextAction("intake", caseData);
      assert.ok(action.prompt.length > 0);
      assert.equal(action.action, "submit_intake");
    });

    it("returns safety warning for triage with safety trigger", () => {
      const caseData = createJourneyCase({
        vehicleInfo: "2020 Ford F-150",
        description: "Brakes failed completely",
        urgency: "Not Safe to Drive",
      });

      const action = buildNextAction("escalation_required", caseData);
      assert.ok(action.prompt.includes("human reviewer") || action.prompt.includes("human"));
    });

    it("returns outcome-specific prompts for diagnosis_ready", () => {
      const caseData: JourneyCase = {
        id: "test",
        state: "diagnosis_ready",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light",
        evidence: [],
        safetyFlags: [],
        safetyTriggered: false,
        confidenceScore: 70,
        confidenceLevel: "high",
        riskLevel: "low",
        outcome: "fix",
        humanReviewRequested: false,
      };

      const action = buildNextAction("diagnosis_ready", caseData);
      assert.ok(action.prompt.includes("recommend") || action.prompt.includes("next"));
    });

    it("returns empty action for resolved state", () => {
      const caseData = createJourneyCase({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      });

      const action = buildNextAction("resolved", caseData);
      assert.equal(action.action, "");
      assert.ok(action.prompt.includes("resolved"));
    });
  });
});
