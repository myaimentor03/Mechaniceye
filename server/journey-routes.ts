import type { Express, Response } from "express";
import {
  createJourneyCase,
  advanceJourney,
  evaluateSafetyFlags,
  calculateConfidence,
  determineOutcome,
  generateJourneyCaseId,
  type JourneyCase,
  type JourneyState,
  type JourneyTransition,
  type OwnerOutcome,
  type EvidenceRecord,
} from "./journey-state-machine";
import { requireCustomer } from "./customer-auth";
import { createRateLimit } from "./rate-limit";
import { logEvent, logEventError } from "./observability/safe-log";

const journeyCases = new Map<string, JourneyCase>();

const journeyLimit = createRateLimit({
  scope: "journey",
  windowMs: 60 * 60_000,
  max: 30,
  key: (req) => req.drivableCustomer?.id || req.ip || "unknown",
});

function journeyError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof TypeError) {
    res.status(400).json({ ok: false, code: "INVALID_INPUT", error: "The request input is invalid." });
    return;
  }
  if (error instanceof Error && error.message.startsWith("Invalid transition")) {
    res.status(409).json({ ok: false, code: "INVALID_TRANSITION", error: "This action is not available in the current state." });
    return;
  }
  res.status(500).json({ ok: false, code: "JOURNEY_OPERATION_FAILED", error: "The operation could not be completed." });
}

function safeJourneyResponse(caseData: JourneyCase) {
  return {
    id: caseData.id,
    state: caseData.state,
    createdAt: caseData.createdAt,
    updatedAt: caseData.updatedAt,
    vehicleInfo: caseData.vehicleInfo,
    description: caseData.description,
    timing: caseData.timing,
    urgency: caseData.urgency,
    canDrive: caseData.canDrive,
    safetyTriggered: caseData.safetyTriggered,
    safetyFlags: caseData.safetyFlags.filter((f) => f.matched),
    confidenceScore: caseData.confidenceScore,
    confidenceLevel: caseData.confidenceLevel,
    riskLevel: caseData.riskLevel,
    outcome: caseData.outcome,
    decisionPath: caseData.decisionPath,
    resolutionNote: caseData.resolutionNote,
    humanReviewRequested: caseData.humanReviewRequested,
    escalationReason: caseData.escalationReason,
    nextAction: caseData.nextAction,
    nextActionPrompt: caseData.nextActionPrompt,
    evidenceCount: caseData.evidence.length,
    evidenceTypes: [...new Set(caseData.evidence.map((e) => e.kind))],
  };
}

export function registerJourneyRoutes(app: Express): void {
  app.post("/api/journey/start", requireCustomer, journeyLimit, async (req, res) => {
    try {
      const { vehicleInfo, description, timing, urgency, canDrive, customerEmail } = req.body || {};

      if (!vehicleInfo || typeof vehicleInfo !== "string" || vehicleInfo.trim().length < 3) {
        res.status(400).json({ ok: false, error: "Vehicle information is required (year, make, model)." });
        return;
      }
      if (!description || typeof description !== "string" || description.trim().length < 10) {
        res.status(400).json({ ok: false, error: "A description of the issue is required (at least 10 characters)." });
        return;
      }

      const caseData = createJourneyCase({
        vehicleInfo: vehicleInfo.trim(),
        description: description.trim(),
        timing: typeof timing === "string" ? timing.trim() : undefined,
        urgency: typeof urgency === "string" ? urgency.trim() : undefined,
        canDrive: typeof canDrive === "string" ? canDrive.trim() : undefined,
        customerEmail: req.drivableCustomer?.email || (typeof customerEmail === "string" ? customerEmail.trim() : undefined),
      });

      journeyCases.set(caseData.id, caseData);

      logEvent("journey.case_started", {
        caseId: caseData.id,
        state: caseData.state,
        safetyTriggered: caseData.safetyTriggered,
        confidenceScore: caseData.confidenceScore,
      });

      res.status(201).json(safeJourneyResponse(caseData));
    } catch (error) {
      logEventError("journey.start_failed", error);
      journeyError(res, error);
    }
  });

  app.get("/api/journey/:caseId/status", requireCustomer, async (req, res) => {
    try {
      const caseData = journeyCases.get(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      res.json(safeJourneyResponse(caseData));
    } catch (error) {
      journeyError(res, error);
    }
  });

  app.post("/api/journey/:caseId/advance", requireCustomer, journeyLimit, async (req, res) => {
    try {
      const caseData = journeyCases.get(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }

      const { transition, outcome, resolutionNote, escalationReason } = req.body || {};
      if (!transition || typeof transition !== "string") {
        res.status(400).json({ ok: false, error: "A valid transition action is required." });
        return;
      }

      const validTransitions: Record<string, Partial<Record<JourneyState, JourneyTransition>>> = {
        acknowledge_triage: { triage: "acknowledge_triage" },
        request_evidence: { triage: "request_evidence", evidence_requested: "request_evidence" },
        finish_evidence: { evidence_requested: "finish_evidence" },
        evaluate: { evidence_received: "evaluate" },
        ready_diagnosis: { evaluating: "ready_diagnosis" },
        escalate: { triage: "escalate", evidence_requested: "escalate", evidence_received: "escalate", evaluating: "escalate", diagnosis_ready: "escalate" },
        resolve: { diagnosis_ready: "resolve", escalation_required: "resolve", human_review: "resolve" },
        resolve_stop_driving: { triage: "resolve_stop_driving", evidence_received: "resolve_stop_driving", evaluating: "resolve_stop_driving", diagnosis_ready: "resolve_stop_driving", escalation_required: "resolve_stop_driving", human_review: "resolve_stop_driving" },
        request_human_review: { diagnosis_ready: "request_human_review" },
      };

      const mappedTransition = validTransitions[transition]?.[caseData.state];
      if (!mappedTransition) {
        res.status(409).json({
          ok: false,
          error: `Cannot "${transition}" in state "${caseData.state}".`,
          currentState: caseData.state,
          availableActions: Object.keys(validTransitions).filter((key) => {
            const map = validTransitions[key];
            return map && caseData.state in map;
          }),
        });
        return;
      }

      const updated = advanceJourney(caseData, mappedTransition, {
        outcome: outcome as OwnerOutcome | undefined,
        resolutionNote: typeof resolutionNote === "string" ? resolutionNote : undefined,
        escalationReason: typeof escalationReason === "string" ? escalationReason : undefined,
      });

      journeyCases.set(updated.id, updated);

      logEvent("journey.advanced", {
        caseId: updated.id,
        fromState: caseData.state,
        toState: updated.state,
        transition: mappedTransition,
        safetyTriggered: updated.safetyTriggered,
        confidenceScore: updated.confidenceScore,
        outcome: updated.outcome,
      });

      res.json(safeJourneyResponse(updated));
    } catch (error) {
      logEventError("journey.advance_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  app.post("/api/journey/:caseId/evidence", requireCustomer, journeyLimit, async (req, res) => {
    try {
      const caseData = journeyCases.get(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }

      if (caseData.state !== "evidence_requested" && caseData.state !== "triage") {
        res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested or during triage." });
        return;
      }

      const { kind, description } = req.body || {};
      if (!kind || !["photo", "audio", "video", "vibration", "text"].includes(kind)) {
        res.status(400).json({ ok: false, error: "Evidence kind must be one of: photo, audio, video, vibration, text." });
        return;
      }

      const evidenceRecord: EvidenceRecord = {
        id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        addedAt: new Date().toISOString(),
        description: typeof description === "string" ? description.trim() : undefined,
      };

      const updated = advanceJourney(caseData, "submit_evidence", {
        evidence: [evidenceRecord],
      });

      journeyCases.set(updated.id, updated);

      logEvent("journey.evidence_added", {
        caseId: updated.id,
        evidenceKind: kind,
        evidenceCount: updated.evidence.length,
        confidenceScore: updated.confidenceScore,
      });

      res.json(safeJourneyResponse(updated));
    } catch (error) {
      logEventError("journey.evidence_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  app.post("/api/journey/:caseId/re-evaluate", requireCustomer, journeyLimit, async (req, res) => {
    try {
      const caseData = journeyCases.get(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }

      const newFlags = evaluateSafetyFlags({
        urgency: caseData.urgency,
        canDrive: caseData.canDrive,
        description: caseData.description,
        timing: caseData.timing,
      });

      const conf = calculateConfidence(caseData);

      const updated: JourneyCase = {
        ...caseData,
        safetyFlags: newFlags,
        safetyTriggered: newFlags.some((f) => f.matched),
        confidenceScore: conf.score,
        confidenceLevel: conf.level,
        riskLevel: conf.riskLevel,
        updatedAt: new Date().toISOString(),
      };

      if (updated.safetyTriggered && updated.state !== "escalation_required" && updated.state !== "resolved" && updated.state !== "human_review") {
        const escalated = advanceJourney(updated, "escalate", {
          escalationReason: "Safety re-evaluation triggered during case progression",
        });
        journeyCases.set(escalated.id, escalated);
        res.json(safeJourneyResponse(escalated));
        return;
      }

      journeyCases.set(updated.id, updated);
      res.json(safeJourneyResponse(updated));
    } catch (error) {
      logEventError("journey.re-evaluate_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });
}
