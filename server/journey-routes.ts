import type { Express, Response } from "express";
import {
  createJourneyCase,
  advanceJourney,
  evaluateSafetyFlags,
  calculateConfidence,
  type JourneyCase,
  type JourneyState,
  type JourneyTransition,
  type OwnerOutcome,
  type EvidenceRecord,
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
}

function assertOwner(caseData: JourneyCase, customerId: string): boolean {
  if (!caseData.customerId) return true;
  return caseData.customerId === customerId;
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
        submit_evidence: { triage: "submit_evidence", evidence_requested: "submit_evidence" },
        finish_evidence: { evidence_requested: "finish_evidence" },
        evaluate: { evidence_received: "evaluate" },
        ready_diagnosis: { evaluating: "ready_diagnosis" },
        escalate: { triage: "escalate", evidence_requested: "escalate", evidence_received: "escalate", evaluating: "escalate", diagnosis_ready: "escalate" },
        resolve: { diagnosis_ready: "resolve", escalation_required: "resolve", human_review: "resolve" },
        resolve_stop_driving: { triage: "resolve_stop_driving", evidence_requested: "resolve_stop_driving", evidence_received: "resolve_stop_driving", evaluating: "resolve_stop_driving", diagnosis_ready: "resolve_stop_driving", escalation_required: "resolve_stop_driving", human_review: "resolve_stop_driving" },
        request_human_review: { diagnosis_ready: "request_human_review", escalation_required: "request_human_review" },
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

      let evidenceItems: any[] = [];
      try {
        evidenceItems = await db.select().from(drivableSeedEvidenceItems);
      } catch {
        // Seed tables may not exist yet; fall back to empty
      }

      const updated = advanceJourney(caseData, mappedTransition, {
        outcome: outcome as OwnerOutcome | undefined,
        resolutionNote: typeof resolutionNote === "string" ? resolutionNote : undefined,
        escalationReason: typeof escalationReason === "string" ? escalationReason : undefined,
        evidenceItems,
      });

      setJourneyCase(updated);

      // When a case enters human_review, automatically create a review draft
      if (updated.state === "human_review" && caseData.state !== "human_review") {
        journeyReviewBridge.createReviewForCase(updated);
      }

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
      const caseData = getJourneyCase(req.params.caseId);
      if (!caseData) {
        res.status(404).json({ ok: false, error: "Journey case not found." });
        return;
      }
      if (!assertOwner(caseData, req.drivableCustomer!.id)) {
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
        status: "text_only",
      };

      let evidenceItems: any[] = [];
      try {
        evidenceItems = await db.select().from(drivableSeedEvidenceItems);
      } catch {
        // Seed tables may not exist yet; fall back to empty
      }

      const updated = advanceJourney(caseData, "submit_evidence", {
        evidence: [evidenceRecord],
        evidenceItems,
      });

      setJourneyCase(updated);

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
        if (caseData.state !== "evidence_requested" && caseData.state !== "triage") {
          res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested or during triage." });
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

        const updated = advanceJourney(caseData, "submit_evidence", {
          evidence: evidenceRecords,
          evidenceItems,
        });

        setJourneyCase(updated);

        logEvent("journey.photo_evidence_added", {
          caseId: updated.id,
          persistedCount: attachments.length,
          confidenceScore: updated.confidenceScore,
          evidenceCount: updated.evidence.length,
        });

        res.json({
          ...safeJourneyResponse(updated),
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
        if (caseData.state !== "evidence_requested" && caseData.state !== "triage") {
          res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested or during triage." });
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

        const updated = advanceJourney(caseData, "submit_evidence", {
          evidence: evidenceRecords,
          evidenceItems,
        });

        setJourneyCase(updated);

        logEvent("journey.audio_evidence_added", {
          caseId: updated.id,
          persistedCount: attachments.length,
          confidenceScore: updated.confidenceScore,
          evidenceCount: updated.evidence.length,
        });

        res.json({
          ...safeJourneyResponse(updated),
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
        if (caseData.state !== "evidence_requested" && caseData.state !== "triage") {
          res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested or during triage." });
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

        const updated = advanceJourney(caseData, "submit_evidence", {
          evidence: evidenceRecords,
          evidenceItems,
        });

        setJourneyCase(updated);

        logEvent("journey.video_evidence_added", {
          caseId: updated.id,
          persistedCount: attachments.length,
          confidenceScore: updated.confidenceScore,
          evidenceCount: updated.evidence.length,
        });

        res.json({
          ...safeJourneyResponse(updated),
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
        if (caseData.state !== "evidence_requested" && caseData.state !== "triage") {
          res.status(409).json({ ok: false, error: "Evidence can only be submitted when requested or during triage." });
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

        const updated = advanceJourney(caseData, "submit_evidence", {
          evidence: evidenceRecords,
          evidenceItems,
        });

        setJourneyCase(updated);

        logEvent("journey.vibration_evidence_added", {
          caseId: updated.id,
          persistedCount: attachments.length,
          confidenceScore: updated.confidenceScore,
          evidenceCount: updated.evidence.length,
        });

        res.json({
          ...safeJourneyResponse(updated),
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

      // Ensure a review draft exists, create if needed
      let reviewStatus = journeyReviewBridge.getReviewStatus(caseData.id);
      if (!reviewStatus) {
        journeyReviewBridge.createReviewForCase(caseData);
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

      // Ensure a review draft exists, create if needed
      let reviewStatus = journeyReviewBridge.getReviewStatus(caseData.id);
      if (!reviewStatus) {
        journeyReviewBridge.createReviewForCase(caseData);
        journeyReviewBridge.finalizeReviewForCase(caseData);
      }

      const rejection = journeyReviewBridge.rejectReview(
        caseData.id,
        reviewerRef,
        reasonCode
      );

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
}
