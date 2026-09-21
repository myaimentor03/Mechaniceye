import type { Express, Response } from "express";
import {
  createJourneyCase,
  advanceJourney,
  evaluateSafetyFlags,
  calculateConfidence,
  buildDecisionPacket,
  shouldAutoEvaluate,
  type JourneyCase,
  type JourneyState,
  type JourneyTransition,
  type OwnerOutcome,
  type EvidenceRecord,
  type DecisionPacket,
} from "./journey-state-machine";
import multer from "multer";
import { requireCustomer } from "./customer-auth";
import { createRateLimit } from "./rate-limit";
import { getJourneyCase, setJourneyCase, listJourneyCasesByCustomer, listAllJourneyCases } from "./journey-store";
import { logEvent, logEventError } from "./observability/safe-log";
import { planEvidence, getNextEvidenceToRequest } from "./journey-evidence-planner";
import { db } from "./db";
import { drivableSeedSymptomCategories, drivableSeedEvidenceItems } from "../shared/schema";
import {
  ALLOWED_AUDIO_MEDIA_TYPES,
  ALLOWED_PHOTO_MEDIA_TYPES,
  ALLOWED_VIDEO_MEDIA_TYPES,
  ALLOWED_VIBRATION_MEDIA_TYPES,
  AUDIO_LIMITS,
  PHOTO_LIMITS,
  VIDEO_LIMITS,
  VIBRATION_LIMITS,
  createEvidenceStoreFromEnvironment,
} from "./evidence-storage";
import { requireReviewer } from "./reviewer-auth";
import { buildFollowUpEvidenceBoundary } from "./follow-up-evidence-boundary";
import { logCaseStarted, logStateTransition, logEvidenceAdded, logReviewAction, logCaseResolved, getCaseEvents } from "./journey-case-events";
import {
  getCustomerNotifications,
  getUnreadCount,
  getCaseUnreadCount,
  markAsRead,
  markNotificationRead,
  notifyStateTransition,
} from "./journey-notifications";
import { getUnattendedWorkerStatus } from "./journey-unattended-worker";
import { InMemoryReviewRepository } from "./review/in-memory-review-repository";
import { HumanReviewReleaseGate } from "./review/release-gate";
import type { ReviewRepository } from "./review/types";
import { requireVerifiedLaunchControlRuntime } from "./review/launch-control-runtime";
import { JourneyReviewBridge } from "./journey-review-bridge";

const journeyLimit = createRateLimit({
  scope: "journey",
  windowMs: 60 * 60_000,
  max: 30,
  key: (req) => req.drivableCustomer?.id || req.ip || "unknown",
});

const journeyEvidenceStore = createEvidenceStoreFromEnvironment();
const journeyReviewBridge = new JourneyReviewBridge();

const journeyPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_LIMITS.maxBytesEach, files: PHOTO_LIMITS.maxCount },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_PHOTO_MEDIA_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported photo type: ${file.mimetype || "unknown"}`));
    }
    cb(null, true);
  },
});

const journeyAudioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_LIMITS.maxBytesEach, files: AUDIO_LIMITS.maxCount },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_AUDIO_MEDIA_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported audio type: ${file.mimetype || "unknown"}`));
    }
    cb(null, true);
  },
});

const journeyAudioUploadMiddleware = (req: any, res: any, next: any) => {
  journeyAudioUpload.array("audio", AUDIO_LIMITS.maxCount)(req, res, (error: unknown) => {
    if (!error) return next();
    const multerError = error instanceof multer.MulterError ? error : null;
    if (multerError?.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(415).json({
        ok: false,
        error: `Journey evidence accepts only audio under the "audio" field.`,
      });
    }
    const isLimitError = Boolean(multerError);
    return res.status(isLimitError ? 413 : 415).json({
      ok: false,
      error: isLimitError
        ? `Audio upload exceeds the limit of ${AUDIO_LIMITS.maxCount} files and 12 MB per file.`
        : error instanceof Error ? error.message : "Audio upload was rejected.",
    });
  });
};

const journeyVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_LIMITS.maxBytesEach, files: VIDEO_LIMITS.maxCount },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VIDEO_MEDIA_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported video type: ${file.mimetype || "unknown"}`));
    }
    cb(null, true);
  },
});

const journeyVideoUploadMiddleware = (req: any, res: any, next: any) => {
  journeyVideoUpload.array("video", VIDEO_LIMITS.maxCount)(req, res, (error: unknown) => {
    if (!error) return next();
    const multerError = error instanceof multer.MulterError ? error : null;
    if (multerError?.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(415).json({
        ok: false,
        error: `Journey evidence accepts only video under the "video" field.`,
      });
    }
    const isLimitError = Boolean(multerError);
    return res.status(isLimitError ? 413 : 415).json({
      ok: false,
      error: isLimitError
        ? `Video upload exceeds the limit of ${VIDEO_LIMITS.maxCount} files and 50 MB per file.`
        : error instanceof Error ? error.message : "Video upload was rejected.",
    });
  });
};

const journeyVibrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIBRATION_LIMITS.maxBytesEach, files: VIBRATION_LIMITS.maxCount },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VIBRATION_MEDIA_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported vibration type: ${file.mimetype || "unknown"}`));
    }
    cb(null, true);
  },
});

const journeyVibrationUploadMiddleware = (req: any, res: any, next: any) => {
  journeyVibrationUpload.array("vibration", VIBRATION_LIMITS.maxCount)(req, res, (error: unknown) => {
    if (!error) return next();
    const multerError = error instanceof multer.MulterError ? error : null;
    if (multerError?.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(415).json({
        ok: false,
        error: `Journey evidence accepts only vibration under the "vibration" field.`,
      });
    }
    const isLimitError = Boolean(multerError);
    return res.status(isLimitError ? 413 : 415).json({
      ok: false,
      error: isLimitError
        ? `Vibration upload exceeds the limit of ${VIBRATION_LIMITS.maxCount} files and ${VIBRATION_LIMITS.maxBytesEach / 1024 / 1024} MB per file.`
        : error instanceof Error ? error.message : "Vibration upload was rejected.",
    });
  });
};

const journeyPhotoUploadMiddleware = (req: any, res: any, next: any) => {
  journeyPhotoUpload.array("photos", PHOTO_LIMITS.maxCount)(req, res, (error: unknown) => {
    if (!error) return next();
    const multerError = error instanceof multer.MulterError ? error : null;
    if (multerError?.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(415).json({
        ok: false,
        error: `Journey evidence accepts only photos under the "photos" field.`,
      });
    }
    const isLimitError = Boolean(multerError);
    return res.status(isLimitError ? 413 : 415).json({
      ok: false,
      error: isLimitError
        ? `Photo upload exceeds the limit of ${PHOTO_LIMITS.maxCount} files and 12 MB per file.`
        : error instanceof Error ? error.message : "Photo upload was rejected.",
    });
  });
};

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
  const baseResponse = {
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
    evidence: caseData.evidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      addedAt: e.addedAt,
      description: e.description,
      originalName: e.originalName,
      mimeType: e.mimeType,
      byteSize: e.byteSize,
      storageKey: e.storageKey,
      attachmentId: e.attachmentId,
      status: e.status,
    })),
    // Evidence durability: belongs to vehicle/case, reusable for FIX/SELL
    evidencePersistence: {
      persistedCount: caseData.evidence.filter((e) => e.status === "persisted").length,
      textOnlyCount: caseData.evidence.filter((e) => e.status === "text_only").length,
    },
    matchedSymptomCategories: caseData.matchedSymptomCategories.map((m) => ({
      symptomCategoryId: m.symptomCategoryId,
      label: m.label,
      confidence: m.confidence,
      matchedPhrases: m.matchedPhrases,
      possibleRiskLevel: m.possibleRiskLevel,
      safetyNote: m.safetyNote,
      humanReviewRecommended: m.humanReviewRecommended,
      recommendedInitialPath: m.recommendedInitialPath,
      commonEvidenceNeeded: m.commonEvidenceNeeded,
    })),
    plannedEvidence: caseData.plannedEvidence.map((e) => ({
      evidenceId: e.evidenceId,
      label: e.label,
      description: e.description,
      evidenceType: e.evidenceType,
      safeCaptureInstructions: e.safeCaptureInstructions,
      unsafeCaptureWarning: e.unsafeCaptureWarning,
      priority: e.priority,
      customerPromptText: e.customerPromptText,
      relevanceScore: e.relevanceScore,
    })),
    currentEvidencePrompt: caseData.currentEvidencePrompt,
  };

  // Include structured decision packet when case reaches decision point
  if (caseData.state === "diagnosis_ready" || caseData.state === "resolved") {
    if (caseData.outcome) {
      return {
        ...baseResponse,
        decisionPacket: buildDecisionPacket(caseData),
      };
    }
  }

  return baseResponse;
}

function assertOwner(caseData: JourneyCase, customerId: string): boolean {
  if (!caseData.customerId) return true;
  return caseData.customerId === customerId;
}

async function tryAutoEvaluate(caseData: JourneyCase): Promise<JourneyCase> {
  if (!shouldAutoEvaluate(caseData)) return caseData;

  let evidenceItems: any[] = [];
  try {
    evidenceItems = await db.select().from(drivableSeedEvidenceItems);
  } catch {
    // Seed tables may not exist yet; fall back to empty
  }

  const evaluated = advanceJourney(caseData, "evaluate", { evidenceItems });
  setJourneyCase(evaluated);
  logStateTransition(evaluated, caseData.state, "evaluate");
  logEvent("journey.auto_evaluate", {
    caseId: evaluated.id,
    confidenceScore: evaluated.confidenceScore,
    confidenceLevel: evaluated.confidenceLevel,
    evidenceCount: evaluated.evidence.length,
  });

  return evaluated;
}

export function registerJourneyRoutes(app: Express): void {
  app.get("/api/journey/my-cases", requireCustomer, async (req, res) => {
    try {
      const customerId = req.drivableCustomer!.id;
      const cases = listJourneyCasesByCustomer(customerId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, cases: cases.map(safeJourneyResponse) });
    } catch (error) {
      journeyError(res, error);
    }
  });

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

      let symptomCategories: any[] = [];
      let evidenceItems: any[] = [];
      try {
        symptomCategories = await db.select().from(drivableSeedSymptomCategories);
        evidenceItems = await db.select().from(drivableSeedEvidenceItems);
      } catch {
        // Seed tables may not exist yet; fall back to empty
      }

      const caseData = createJourneyCase({
        vehicleInfo: vehicleInfo.trim(),
        description: description.trim(),
        timing: typeof timing === "string" ? timing.trim() : undefined,
        urgency: typeof urgency === "string" ? urgency.trim() : undefined,
        canDrive: typeof canDrive === "string" ? canDrive.trim() : undefined,
        customerId: req.drivableCustomer!.id,
        customerEmail: req.drivableCustomer?.email || (typeof customerEmail === "string" ? customerEmail.trim() : undefined),
        symptomCategories,
        evidenceItems,
      });

      setJourneyCase(caseData);

      // When safety triggers at intake, automatically create a review draft
      if (caseData.state === "escalation_required") {
        journeyReviewBridge.createReviewForCase(caseData);
      }

      logCaseStarted(caseData);

      logEvent("journey.case_started", {
        caseId: caseData.id,
        state: caseData.state,
        safetyTriggered: caseData.safetyTriggered,
        confidenceScore: caseData.confidenceScore,
        symptomMatchCount: caseData.matchedSymptomCategories.length,
      });

      res.status(201).json(safeJourneyResponse(caseData));
    } catch (error) {
      logEventError("journey.start_failed", error);
      journeyError(res, error);
    }
  });

  app.get("/api/journey/:caseId/status", requireCustomer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (!assertOwner(caseData, req.drivableCustomer!.id)) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(safeJourneyResponse(caseData));
    } catch (error) {
      journeyError(res, error);
    }
  });

  app.post("/api/journey/:caseId/advance", requireCustomer, journeyLimit, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (!assertOwner(caseData, req.drivableCustomer!.id)) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }

      const { transition, outcome, resolutionNote, escalationReason } = req.body || {};
      if (!transition || typeof transition !== "string") {
        res.status(400).json({ ok: false, error: "A valid transition action is required." });
        return;
      }

const validTransitions: Record<string, Partial<Record<JourneyState, JourneyTransition>>> = {
        submit_intake: { intake: "submit_intake" },
        acknowledge_triage: { triage: "acknowledge_triage" },
        request_evidence: { triage: "request_evidence", evidence_requested: "request_evidence" },
        submit_evidence: { triage: "submit_evidence", evidence_requested: "submit_evidence", escalation_required: "submit_evidence" },
        add_more_evidence: { evidence_received: "add_more_evidence", escalation_required: "add_more_evidence" },
        add_followup_evidence: { resolved: "add_followup_evidence" },
        finish_evidence: { evidence_requested: "finish_evidence" },
        evaluate: { evidence_received: "evaluate" },
        ready_diagnosis: { evaluating: "ready_diagnosis" },
        escalate: { triage: "escalate", evidence_requested: "escalate", evidence_received: "escalate", evaluating: "escalate", diagnosis_ready: "escalate" },
        // Customer self-resolve is NOT allowed from human_review: only the
        // reviewer decides there (approve path resolves server-side). The
        // customer may still acknowledge STOP DRIVING via resolve_stop_driving.
        resolve: { diagnosis_ready: "resolve", escalation_required: "resolve" },
        resolve_stop_driving: { triage: "resolve_stop_driving", evidence_requested: "resolve_stop_driving", evidence_received: "resolve_stop_driving", evaluating: "resolve_stop_driving", diagnosis_ready: "resolve_stop_driving", escalation_required: "resolve_stop_driving", human_review: "resolve_stop_driving" },
        request_human_review: { diagnosis_ready: "request_human_review", escalation_required: "request_human_review" },
    };

      const mappedTransition = validTransitions[transition]?.[caseData.state];
      if (!mappedTransition) {
        res.status(409).json({
          ok: false,
          // In human_review the customer waits for the reviewer decision;
          // resolve_stop_driving remains available as the safe acknowledgment.
          error: caseData.state === "human_review" && transition === "resolve"
            ? "This case is waiting for human review. Only the reviewer can resolve it — no action is needed right now."
            : `Cannot "${transition}" in state "${caseData.state}".`,
          currentState: caseData.state,
          availableActions: Object.keys(validTransitions).filter((key) => {
            const map = validTransitions[key];
            return map && caseData.state in map;
          }),
        });
        return;
      }

      // Safety boundary at the API edge: a safety-triggered case can never
      // resolve to FIX/SELL/MONITOR via the customer path, even if a stale or
      // tampered client sends outcome=fix. Coerce to the safe transition so
      // the stored outcome is truthfully stop_driving.
      const effectiveTransition = caseData.safetyTriggered && mappedTransition === "resolve"
        ? "resolve_stop_driving" as typeof mappedTransition
        : mappedTransition;

      let evidenceItems: any[] = [];
      try {
        evidenceItems = await db.select().from(drivableSeedEvidenceItems);
      } catch {
        // Seed tables may not exist yet; fall back to empty
      }

      const updated = advanceJourney(caseData, effectiveTransition, {
        outcome: outcome as OwnerOutcome | undefined,
        resolutionNote: typeof resolutionNote === "string" ? resolutionNote : undefined,
        escalationReason: typeof escalationReason === "string" ? escalationReason : undefined,
        evidenceItems,
      });

      setJourneyCase(updated);

      // Log the state transition to the durable event timeline.
      // Pass the UPDATED case plus the previous state so from→to is truthful.
      const previousState = caseData.state;
      logStateTransition(updated, previousState, effectiveTransition);

      // Create customer notification for meaningful state transitions (P0 #6)
      if (updated.customerId && updated.customerId === req.drivableCustomer!.id) {
        notifyStateTransition({
          caseId: updated.id,
          customerId: updated.customerId,
          fromState: previousState,
          toState: updated.state,
          transition: effectiveTransition,
          safetyTriggered: updated.safetyTriggered,
          outcome: updated.outcome,
        }).catch(() => {}); // fire-and-forget, never block response
      }

      // Customer asked for a human safety-valve review — record the request.
      if (effectiveTransition === "request_human_review") {
        logReviewAction(updated.id, updated.customerId, "requested", updated.customerId || "customer");
      }

      // Resolutions close the loop — record the outcome event for the timeline.
      if (effectiveTransition === "resolve" || effectiveTransition === "resolve_stop_driving") {
        logCaseResolved(updated, effectiveTransition, previousState);
      }

      // When a case enters human_review, automatically create a review draft
      if (updated.state === "human_review" && caseData.state !== "human_review") {
        journeyReviewBridge.createReviewForCase(updated);
      }

      logEvent("journey.advanced", {
        caseId: updated.id,
        fromState: caseData.state,
        toState: updated.state,
        transition: effectiveTransition,
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
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (!assertOwner(caseData, req.drivableCustomer!.id)) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }

      if (caseData.state !== "evidence_requested" && caseData.state !== "triage" && caseData.state !== "evidence_received" && caseData.state !== "escalation_required" && caseData.state !== "resolved") {
        res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested, during triage, after first evidence, during escalation, or as follow-up to a resolved case." });
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
        status: "text_only",
      };

      let evidenceItems: any[] = [];
      try {
        evidenceItems = await db.select().from(drivableSeedEvidenceItems);
      } catch {
        // Seed tables may not exist yet; fall back to empty
      }

      const transition = caseData.state === "evidence_received"
        ? "add_more_evidence"
        : caseData.state === "resolved"
        ? "add_followup_evidence"
        : "submit_evidence";

      const updated = advanceJourney(caseData, transition, {
        evidence: [evidenceRecord],
        evidenceItems,
      });

      setJourneyCase(updated);

      logEvidenceAdded(updated, [evidenceRecord]);

      logEvent("journey.evidence_added", {
        caseId: updated.id,
        evidenceKind: kind,
        evidenceCount: updated.evidence.length,
        confidenceScore: updated.confidenceScore,
      });

      const finalCase = await tryAutoEvaluate(updated);

      res.json(safeJourneyResponse(finalCase));
    } catch (error) {
      logEventError("journey.evidence_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  // Photo evidence upload — reliable file persistence belonging to vehicle/case, reusable for FIX/SELL
  app.post(
    "/api/journey/:caseId/evidence/photo",
    requireCustomer,
    journeyLimit,
    journeyPhotoUploadMiddleware,
    async (req: any, res) => {
      try {
        const caseData = getJourneyCase(req.params.caseId);
        if (!caseData) {
          res.status(404).json({ ok: false, error: "Journey case not found." });
          return;
        }
        if (!assertOwner(caseData, req.drivableCustomer!.id)) {
          res.status(404).json({ ok: false, error: "Journey case not found." });
          return;
        }
        if (caseData.state !== "evidence_requested" && caseData.state !== "triage" && caseData.state !== "evidence_received" && caseData.state !== "escalation_required" && caseData.state !== "resolved") {
          res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested, during triage, after first evidence, during escalation, or as follow-up to a resolved case." });
          return;
        }

        const files: Express.Multer.File[] = req.files || [];
        if (!files.length) {
          res.status(400).json({ ok: false, error: "At least one photo is required under the 'photos' field." });
          return;
        }

        // Persist via EvidenceStore (validates type/size/content, supports R2 or local)
        let attachments: any[] = [];
        try {
          attachments = await journeyEvidenceStore.savePhotos(caseData.id, files);
        } catch (storeErr: any) {
          const msg = storeErr instanceof Error ? storeErr.message : "Photo could not be saved.";
          // Map validation errors to 415/413 where appropriate
          if (msg.includes("Too many") || msg.includes("too large") || msg.includes("limit")) {
            res.status(413).json({ ok: false, error: msg });
            return;
          }
          if (msg.includes("Unsupported") || msg.includes("not a supported") || msg.includes("MIME")) {
            res.status(415).json({ ok: false, error: msg });
            return;
          }
          throw storeErr;
        }

        const evidenceRecords: EvidenceRecord[] = attachments.map((att) => ({
          id: `ev-${att.id.slice(0, 8)}`,
          kind: "photo" as const,
          addedAt: att.createdAt,
          description: att.originalName,
          originalName: att.originalName,
          mimeType: att.mimeType,
          byteSize: att.byteSize,
          storageKey: att.storageKey,
          attachmentId: att.id,
          status: "persisted" as const,
        }));

        let evidenceItems: any[] = [];
        try {
          evidenceItems = await db.select().from(drivableSeedEvidenceItems);
        } catch {
          // Seed tables may not exist yet; fall back to empty
        }

        const transition = caseData.state === "evidence_received"
          ? "add_more_evidence"
          : caseData.state === "resolved"
          ? "add_followup_evidence"
          : "submit_evidence";

        const updated = advanceJourney(caseData, transition, {
          evidence: evidenceRecords,
          evidenceItems,
        });

        setJourneyCase(updated);

        logEvidenceAdded(updated, evidenceRecords);

        logEvent("journey.photo_evidence_added", {
          caseId: updated.id,
          persistedCount: attachments.length,
          confidenceScore: updated.confidenceScore,
          evidenceCount: updated.evidence.length,
        });

        const finalCase = await tryAutoEvaluate(updated);

        res.json({
          ...safeJourneyResponse(finalCase),
          persistedAttachments: attachments,
          evidencePersistence: {
            durability: journeyEvidenceStore.durability,
            persisted: true,
            analysisStatus: "uploaded_not_analyzed",
          },
        });
      } catch (error) {
        logEventError("journey.photo_evidence_failed", error, { caseId: req.params.caseId });
        journeyError(res, error);
      }
    }
  );

  // Audio evidence upload — reliable file persistence belonging to vehicle/case, reusable for FIX/SELL
  // Truthful boundary: stored durably, uploaded_not_analyzed (no automated audio diagnosis claimed).
  app.post(
    "/api/journey/:caseId/evidence/audio",
    requireCustomer,
    journeyLimit,
    journeyAudioUploadMiddleware,
    async (req: any, res) => {
      try {
        const caseData = getJourneyCase(req.params.caseId);
        if (!caseData) {
          res.status(404).json({ ok: false, error: "Journey case not found." });
          return;
        }
        if (!assertOwner(caseData, req.drivableCustomer!.id)) {
          res.status(404).json({ ok: false, error: "Journey case not found." });
          return;
        }
        if (caseData.state !== "evidence_requested" && caseData.state !== "triage" && caseData.state !== "evidence_received" && caseData.state !== "escalation_required" && caseData.state !== "resolved") {
          res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested, during triage, after first evidence, during escalation, or as follow-up to a resolved case." });
          return;
        }

        const files: Express.Multer.File[] = req.files || [];
        if (!files.length) {
          res.status(400).json({ ok: false, error: "At least one audio clip is required under the 'audio' field." });
          return;
        }

        // Persist via EvidenceStore (validates type/size/content, supports R2 or local)
        let attachments: any[] = [];
        try {
          attachments = await journeyEvidenceStore.saveAudio(caseData.id, files);
        } catch (storeErr: any) {
          const msg = storeErr instanceof Error ? storeErr.message : "Audio could not be saved.";
          if (msg.includes("Too many") || msg.includes("too large") || msg.includes("limit")) {
            res.status(413).json({ ok: false, error: msg });
            return;
          }
          if (msg.includes("Unsupported") || msg.includes("not a supported") || msg.includes("MIME")) {
            res.status(415).json({ ok: false, error: msg });
            return;
          }
          throw storeErr;
        }

        const evidenceRecords: EvidenceRecord[] = attachments.map((att) => ({
          id: `ev-${att.id.slice(0, 8)}`,
          kind: "audio" as const,
          addedAt: att.createdAt,
          description: att.originalName,
          originalName: att.originalName,
          mimeType: att.mimeType,
          byteSize: att.byteSize,
          storageKey: att.storageKey,
          attachmentId: att.id,
          status: "persisted" as const,
        }));

        let evidenceItems: any[] = [];
        try {
          evidenceItems = await db.select().from(drivableSeedEvidenceItems);
        } catch {
          // Seed tables may not exist yet; fall back to empty
        }

        const transition = caseData.state === "evidence_received"
          ? "add_more_evidence"
          : caseData.state === "resolved"
          ? "add_followup_evidence"
          : "submit_evidence";

        const updated = advanceJourney(caseData, transition, {
          evidence: evidenceRecords,
          evidenceItems,
        });

        setJourneyCase(updated);

        logEvidenceAdded(updated, evidenceRecords);

        logEvent("journey.audio_evidence_added", {
          caseId: updated.id,
          persistedCount: attachments.length,
          confidenceScore: updated.confidenceScore,
          evidenceCount: updated.evidence.length,
        });

        const finalCase = await tryAutoEvaluate(updated);

        res.json({
          ...safeJourneyResponse(finalCase),
          persistedAttachments: attachments,
          evidencePersistence: {
            durability: journeyEvidenceStore.durability,
            persisted: true,
            analysisStatus: "uploaded_not_analyzed",
          },
        });
      } catch (error) {
        logEventError("journey.audio_evidence_failed", error, { caseId: req.params.caseId });
        journeyError(res, error);
      }
    }
  );

  // Video evidence upload — reliable file persistence belonging to vehicle/case, reusable for FIX/SELL
  // Truthful boundary: stored durably, uploaded_not_analyzed (no automated video diagnosis claimed).
  app.post(
    "/api/journey/:caseId/evidence/video",
    requireCustomer,
    journeyLimit,
    journeyVideoUploadMiddleware,
    async (req: any, res) => {
      try {
        const caseData = getJourneyCase(req.params.caseId);
        if (!caseData) {
          res.status(404).json({ ok: false, error: "Journey case not found." });
          return;
        }
        if (!assertOwner(caseData, req.drivableCustomer!.id)) {
          res.status(404).json({ ok: false, error: "Journey case not found." });
          return;
        }
        if (caseData.state !== "evidence_requested" && caseData.state !== "triage" && caseData.state !== "evidence_received" && caseData.state !== "escalation_required" && caseData.state !== "resolved") {
          res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested, during triage, after first evidence, during escalation, or as follow-up to a resolved case." });
          return;
        }

        const files: Express.Multer.File[] = req.files || [];
        if (!files.length) {
          res.status(400).json({ ok: false, error: "At least one video clip is required under the 'video' field." });
          return;
        }

        let attachments: any[] = [];
        try {
          attachments = await journeyEvidenceStore.saveVideo(caseData.id, files);
        } catch (storeErr: any) {
          const msg = storeErr instanceof Error ? storeErr.message : "Video could not be saved.";
          if (msg.includes("Too many") || msg.includes("too large") || msg.includes("limit")) {
            res.status(413).json({ ok: false, error: msg });
            return;
          }
          if (msg.includes("Unsupported") || msg.includes("not a supported") || msg.includes("MIME")) {
            res.status(415).json({ ok: false, error: msg });
            return;
          }
          throw storeErr;
        }

        const evidenceRecords: EvidenceRecord[] = attachments.map((att) => ({
          id: `ev-${att.id.slice(0, 8)}`,
          kind: "video" as const,
          addedAt: att.createdAt,
          description: att.originalName,
          originalName: att.originalName,
          mimeType: att.mimeType,
          byteSize: att.byteSize,
          storageKey: att.storageKey,
          attachmentId: att.id,
          status: "persisted" as const,
        }));

        let evidenceItems: any[] = [];
        try {
          evidenceItems = await db.select().from(drivableSeedEvidenceItems);
        } catch {
          // Seed tables may not exist yet; fall back to empty
        }

        const transition = caseData.state === "evidence_received"
          ? "add_more_evidence"
          : caseData.state === "resolved"
          ? "add_followup_evidence"
          : "submit_evidence";

        const updated = advanceJourney(caseData, transition, {
          evidence: evidenceRecords,
          evidenceItems,
        });

        setJourneyCase(updated);

        logEvidenceAdded(updated, evidenceRecords);

        logEvent("journey.video_evidence_added", {
          caseId: updated.id,
          persistedCount: attachments.length,
          confidenceScore: updated.confidenceScore,
          evidenceCount: updated.evidence.length,
        });

        const finalCase = await tryAutoEvaluate(updated);

        res.json({
          ...safeJourneyResponse(finalCase),
          persistedAttachments: attachments,
          evidencePersistence: {
            durability: journeyEvidenceStore.durability,
            persisted: true,
            analysisStatus: "uploaded_not_analyzed",
          },
        });
      } catch (error) {
        logEventError("journey.video_evidence_failed", error, { caseId: req.params.caseId });
        journeyError(res, error);
      }
    }
  );

  // Vibration evidence upload — reliable file persistence belonging to vehicle/case, reusable for FIX/SELL
  // Truthful boundary: stored durably, uploaded_not_analyzed (no automated vibration diagnosis claimed).
  app.post(
    "/api/journey/:caseId/evidence/vibration",
    requireCustomer,
    journeyLimit,
    journeyVibrationUploadMiddleware,
    async (req: any, res) => {
      try {
        const caseData = getJourneyCase(req.params.caseId);
        if (!caseData) {
          res.status(404).json({ ok: false, error: "Journey case not found." });
          return;
        }
        if (!assertOwner(caseData, req.drivableCustomer!.id)) {
          res.status(404).json({ ok: false, error: "Journey case not found." });
          return;
        }
        if (caseData.state !== "evidence_requested" && caseData.state !== "triage" && caseData.state !== "evidence_received" && caseData.state !== "escalation_required" && caseData.state !== "resolved") {
          res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested, during triage, after first evidence, during escalation, or as follow-up to a resolved case." });
          return;
        }

        const files: Express.Multer.File[] = req.files || [];
        if (!files.length) {
          res.status(400).json({ ok: false, error: "At least one vibration recording is required under the 'vibration' field." });
          return;
        }

        // Persist via EvidenceStore (validates type/size/content, supports R2 or local)
        let attachments: any[] = [];
        try {
          attachments = await journeyEvidenceStore.saveVibration(caseData.id, files);
        } catch (storeErr: any) {
          const msg = storeErr instanceof Error ? storeErr.message : "Vibration could not be saved.";
          if (msg.includes("Too many") || msg.includes("too large") || msg.includes("limit")) {
            res.status(413).json({ ok: false, error: msg });
            return;
          }
          if (msg.includes("Unsupported") || msg.includes("not a supported") || msg.includes("MIME")) {
            res.status(415).json({ ok: false, error: msg });
            return;
          }
          throw storeErr;
        }

        const evidenceRecords: EvidenceRecord[] = attachments.map((att) => ({
          id: `ev-${att.id.slice(0, 8)}`,
          kind: "vibration" as const,
          addedAt: att.createdAt,
          description: att.originalName,
          originalName: att.originalName,
          mimeType: att.mimeType,
          byteSize: att.byteSize,
          storageKey: att.storageKey,
          attachmentId: att.id,
          status: "persisted" as const,
        }));

        let evidenceItems: any[] = [];
        try {
          evidenceItems = await db.select().from(drivableSeedEvidenceItems);
        } catch {
          // Seed tables may not exist yet; fall back to empty
        }

        const transition = caseData.state === "evidence_received"
          ? "add_more_evidence"
          : caseData.state === "resolved"
          ? "add_followup_evidence"
          : "submit_evidence";

        const updated = advanceJourney(caseData, transition, {
          evidence: evidenceRecords,
          evidenceItems,
        });

        setJourneyCase(updated);

        logEvidenceAdded(updated, evidenceRecords);

        logEvent("journey.vibration_evidence_added", {
          caseId: updated.id,
          persistedCount: attachments.length,
          confidenceScore: updated.confidenceScore,
          evidenceCount: updated.evidence.length,
        });

        const finalCase = await tryAutoEvaluate(updated);

        res.json({
          ...safeJourneyResponse(finalCase),
          persistedAttachments: attachments,
          evidencePersistence: {
            durability: journeyEvidenceStore.durability,
            persisted: true,
            analysisStatus: "uploaded_not_analyzed",
          },
        });
      } catch (error) {
        logEventError("journey.vibration_evidence_failed", error, { caseId: req.params.caseId });
        journeyError(res, error);
      }
    }
  );

  // Retrieve persisted photo/audio/video evidence (belongs to case, customer-scoped)
  app.get("/api/journey/:caseId/evidence/:attachmentId", requireCustomer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (!assertOwner(caseData, req.drivableCustomer!.id)) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      const attachmentId = req.params.attachmentId;
      const record = caseData.evidence.find((e) => e.attachmentId === attachmentId);
      if (!record || !record.storageKey) {
        res.status(404).json({ ok: false, error: "Evidence attachment not found for this case." });
        return;
      }
      const result = await journeyEvidenceStore.getAttachment(caseData.id, attachmentId);
      if (!result) {
        res.status(404).json({ ok: false, error: "Attachment not found in storage." });
        return;
      }
      res.setHeader("Content-Type", result.attachment.mimeType);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", `inline; filename="${result.attachment.originalName || attachmentId}"`);
      res.send(result.bytes);
    } catch (error) {
      logEventError("journey.evidence_retrieve_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  app.post("/api/journey/:caseId/re-evaluate", requireCustomer, journeyLimit, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (!assertOwner(caseData, req.drivableCustomer!.id)) {
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
        journeyReviewBridge.createReviewForCase(escalated);
        logStateTransition(escalated, updated.state, "escalate");
        setJourneyCase(escalated);
        res.json(safeJourneyResponse(escalated));
        return;
      }

      setJourneyCase(updated);
      res.json(safeJourneyResponse(updated));
    } catch (error) {
      logEventError("journey.re-evaluate_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  // Case activity timeline — customer-visible event log for this case
  app.get("/api/journey/:caseId/events", requireCustomer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (!assertOwner(caseData, req.drivableCustomer!.id)) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }

      const events = await getCaseEvents(caseData.id);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, events });
    } catch (error) {
      logEventError("journey.events_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  app.get("/api/journey/:caseId/evidence-suggestions", requireCustomer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (!assertOwner(caseData, req.drivableCustomer!.id)) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }

      let evidenceItems: any[] = [];
      try {
        evidenceItems = await db.select().from(drivableSeedEvidenceItems);
      } catch {
        // Fall back to empty
      }

      const planned = planEvidence(
        caseData.matchedSymptomCategories,
        evidenceItems,
        caseData.evidence,
        5
      );

      const nextEvidence = getNextEvidenceToRequest(planned, caseData.evidence);

      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        plannedEvidence: planned,
        nextEvidence: nextEvidence || null,
        matchedSymptoms: caseData.matchedSymptomCategories,
      });
    } catch (error) {
      logEventError("journey.evidence-suggestions_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  // ── Reviewer-facing journey review routes ──────────────────────────────────
  // Human review is a safety valve, not the default. These endpoints allow a
  // reviewer to list cases pending human review and submit review decisions
  // with proper audit trail via the review infrastructure.

  app.get("/api/journey/review/pending", requireReviewer, async (_req, res) => {
    try {
      const allCases = listAllJourneyCases();
      const pendingCases = allCases.filter(
        (c) => c.state === "human_review" || c.state === "escalation_required"
      );

      const reviewStatuses = pendingCases.map((c) => {
        const reviewStatus = journeyReviewBridge.getReviewStatus(c.id);
        return {
          id: c.id,
          state: c.state,
          vehicleInfo: c.vehicleInfo,
          description: c.description,
          outcome: c.outcome,
          confidenceLevel: c.confidenceLevel,
          riskLevel: c.riskLevel,
          safetyTriggered: c.safetyTriggered,
          escalationReason: c.escalationReason,
          evidenceCount: c.evidence.length,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          reviewStatus: reviewStatus?.reviewStatus,
          reviewVersionId: reviewStatus?.reviewVersionId,
        };
      });

      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, cases: reviewStatuses });
    } catch (error) {
      logEventError("journey.review.pending_failed", error);
      journeyError(res, error);
    }
  });

  app.get("/api/journey/review/:caseId", requireReviewer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }

      const reviewStatus = journeyReviewBridge.getReviewStatus(caseData.id);
      const evidenceBoundary = journeyReviewBridge.buildEvidenceBoundary(caseData);

      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        case: safeJourneyResponse(caseData),
        reviewStatus: reviewStatus || null,
        evidenceBoundary,
      });
    } catch (error) {
      logEventError("journey.review.get_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  app.post("/api/journey/review/:caseId/finalize", requireReviewer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (caseData.state !== "human_review" && caseData.state !== "escalation_required") {
        res.status(409).json({ ok: false, error: "Case is not in a reviewable state." });
        return;
      }

      const version = journeyReviewBridge.createReviewForCase(caseData);
      if (!version) {
        res.status(409).json({ ok: false, error: "Could not create review record." });
        return;
      }

      const finalized = journeyReviewBridge.finalizeReviewForCase(caseData);

      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        versionId: finalized?.versionId || version.versionId,
        status: finalized ? "review_required" : "draft",
      });
    } catch (error) {
      logEventError("journey.review.finalize_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  app.post("/api/journey/review/:caseId/approve", requireReviewer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (caseData.state !== "human_review" && caseData.state !== "escalation_required") {
        res.status(409).json({ ok: false, error: "Case is not in a reviewable state." });
        return;
      }

      const reviewerRef = req.drivableReviewer!.ref;
      const highRiskAcknowledged = req.body?.highRiskAcknowledged === true;

      // Ensure a review record exists and is finalized (awaiting review):
      // cases entering human_review via the customer flow only have a draft,
      // which the repository refuses to approve — finalize it here so the
      // reviewer decision lands in one step with a truthful audit trail.
      let reviewStatus = journeyReviewBridge.getReviewStatus(caseData.id);
      if (!reviewStatus) {
        journeyReviewBridge.createReviewForCase(caseData);
        journeyReviewBridge.finalizeReviewForCase(caseData);
      } else if (reviewStatus.reviewStatus === "draft") {
        journeyReviewBridge.finalizeReviewForCase(caseData);
      }

      const approval = journeyReviewBridge.approveReview(
        caseData.id,
        reviewerRef,
        highRiskAcknowledged
      );

      // Now resolve the journey case
      let updated = advanceJourney(caseData, "resolve", {
        resolutionNote: `Approved by reviewer ${reviewerRef}`,
      });

      // Build evidence boundary for audit
      const evidenceBoundary = journeyReviewBridge.buildEvidenceBoundary(caseData);

      setJourneyCase(updated);

      logReviewAction(updated.id, updated.customerId, "approved", reviewerRef, {
        resolutionNote: `Approved by reviewer ${reviewerRef}`,
      });

      // Keep the customer-visible timeline truthful for the review→resolve hop.
      logStateTransition(updated, caseData.state, "resolve");
      logCaseResolved(updated, "resolve", caseData.state);

      // Notify customer that review is complete (P0 #6)
      if (updated.customerId) {
        notifyStateTransition({
          caseId: updated.id,
          customerId: updated.customerId,
          fromState: caseData.state,
          toState: updated.state,
          transition: "resolve",
          safetyTriggered: updated.safetyTriggered,
          outcome: updated.outcome,
        }).catch(() => {});
      }

      logEvent("journey.review_approved_and_resolved", {
        caseId: updated.id,
        approvalId: approval.approvalId,
        reviewerRef,
        outcome: updated.outcome,
        evidenceBoundary: evidenceBoundary.analysisBoundary,
      });

      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        case: safeJourneyResponse(updated),
        approval,
        evidenceBoundary,
      });
    } catch (error) {
      logEventError("journey.review.approve_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  app.post("/api/journey/review/:caseId/reject", requireReviewer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (caseData.state !== "human_review" && caseData.state !== "escalation_required") {
        res.status(409).json({ ok: false, error: "Case is not in a reviewable state." });
        return;
      }

      const reviewerRef = req.drivableReviewer!.ref;
      const reasonCode = req.body?.reasonCode;
      if (!reasonCode || !["insufficient_evidence", "policy_mismatch", "unsafe_content", "other"].includes(reasonCode)) {
        res.status(400).json({ ok: false, error: "A valid reason code is required: insufficient_evidence, policy_mismatch, unsafe_content, other." });
        return;
      }

      // Ensure a review record exists and is finalized (awaiting review):
      // cases entering human_review via the customer flow only have a draft,
      // which the repository refuses to reject — finalize it here so the
      // reviewer decision lands in one step with a truthful audit trail.
      let reviewStatus = journeyReviewBridge.getReviewStatus(caseData.id);
      if (!reviewStatus) {
        journeyReviewBridge.createReviewForCase(caseData);
        journeyReviewBridge.finalizeReviewForCase(caseData);
      } else if (reviewStatus.reviewStatus === "draft") {
        journeyReviewBridge.finalizeReviewForCase(caseData);
      }

      const rejection = journeyReviewBridge.rejectReview(
        caseData.id,
        reviewerRef,
        reasonCode
      );

      logReviewAction(caseData.id, caseData.customerId, "rejected", reviewerRef, {
        reasonCode,
      });

      // Notify customer that review was rejected (P0 #6)
      if (caseData.customerId) {
        notifyStateTransition({
          caseId: caseData.id,
          customerId: caseData.customerId,
          fromState: caseData.state,
          toState: caseData.state,
          transition: "request_human_review",
          safetyTriggered: caseData.safetyTriggered,
        }).catch(() => {});
      }

      logEvent("journey.review_rejected", {
        caseId: caseData.id,
        rejectionId: rejection.rejectionId,
        reviewerRef,
        reasonCode,
      });

      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        rejection,
        message: "Review rejected. Case remains in review state. Customer may provide additional evidence.",
      });
    } catch (error) {
      logEventError("journey.review.reject_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  app.get("/api/journey/review/:caseId/release-check", requireReviewer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }

      const decision = journeyReviewBridge.checkReleaseAllowed(caseData);
      const evidenceBoundary = journeyReviewBridge.buildEvidenceBoundary(caseData);

      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        ...decision,
        evidenceBoundary,
      });
    } catch (error) {
      logEventError("journey.review.release-check_failed", error, { caseId: req.params.caseId });
      journeyError(res, error);
    }
  });

  // ── Customer notification routes (P0 #6) ────────────────────────────────

  app.get("/api/journey/notifications/unread-count", requireCustomer, async (req, res) => {
    try {
      const customerId = req.drivableCustomer!.id;
      const count = getUnreadCount(customerId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, unreadCount: count });
    } catch (error) {
      journeyError(res, error);
    }
  });

  app.get("/api/journey/notifications", requireCustomer, async (req, res) => {
    try {
      const customerId = req.drivableCustomer!.id;
      const unreadOnly = req.query.unread === "true";
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const notifications = getCustomerNotifications(customerId, { unreadOnly, limit });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, notifications });
    } catch (error) {
      journeyError(res, error);
    }
  });

  app.get("/api/journey/:caseId/unread-count", requireCustomer, async (req, res) => {
    try {
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (!assertOwner(caseData, req.drivableCustomer!.id)) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      const count = getCaseUnreadCount(req.drivableCustomer!.id, caseData.id);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, unreadCount: count });
    } catch (error) {
      journeyError(res, error);
    }
  });

  app.post("/api/journey/notifications/mark-read", requireCustomer, async (req, res) => {
    try {
      const customerId = req.drivableCustomer!.id;
      const { notificationId, caseId } = req.body || {};

      if (notificationId) {
        const marked = markNotificationRead(notificationId, customerId);
        res.json({ ok: true, marked });
      } else {
        const count = markAsRead(customerId, caseId);
        res.json({ ok: true, markedCount: count });
      }
    } catch (error) {
      journeyError(res, error);
    }
  });

  app.get("/api/journey/system/unattended-status", requireReviewer, async (_req, res) => {
    try {
      const status = getUnattendedWorkerStatus();
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...status });
    } catch (error) {
      journeyError(res, error);
    }
  });
}
