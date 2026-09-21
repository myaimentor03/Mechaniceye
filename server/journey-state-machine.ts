import { randomBytes } from "node:crypto";
import {
  SAFETY_STOP_DRIVING_TRIGGERS,
  DECISION_PATHS,
  type DecisionPathId,
  type RiskLevel,
  type ConfidenceLevel,
} from "../shared/drivableDecisionEngine";
import { type MatchedSymptom, classifySymptoms, getTopSymptomCategory } from "./journey-symptom-classifier";
import {
  type PlannedEvidenceItem,
  planEvidence,
  getNextEvidenceToRequest,
  buildEvidencePrompt,
} from "./journey-evidence-planner";

export const JOURNEY_STATES = [
  "intake",
  "triage",
  "evidence_requested",
  "evidence_received",
  "evaluating",
  "diagnosis_ready",
  "escalation_required",
  "human_review",
  "resolved",
] as const;

export type JourneyState = (typeof JOURNEY_STATES)[number];

export const OWNER_OUTCOMES = ["fix", "sell", "monitor", "stop_driving"] as const;
export type OwnerOutcome = (typeof OWNER_OUTCOMES)[number];

export type SafetyFlag = {
  triggerId: string;
  label: string;
  matched: boolean;
  matchedPhrase?: string;
};

export type EvidenceRecord = {
  id: string;
  kind: "photo" | "audio" | "video" | "vibration" | "text";
  addedAt: string;
  description?: string;
  // File-persisted evidence (photo path) — belongs to vehicle/case, reusable across FIX/SELL flows
  originalName?: string;
  mimeType?: string;
  byteSize?: number;
  storageKey?: string;
  attachmentId?: string;
  status?: "persisted" | "text_only";
};

export type JourneyCase = {
  id: string;
  state: JourneyState;
  createdAt: string;
  updatedAt: string;
  vehicleInfo: string;
  description: string;
  timing?: string;
  urgency?: string;
  canDrive?: string;
  customerId?: string;
  customerEmail?: string;
  evidence: EvidenceRecord[];
  safetyFlags: SafetyFlag[];
  safetyTriggered: boolean;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  riskLevel: RiskLevel;
  outcome?: OwnerOutcome;
  decisionPath?: DecisionPathId;
  resolutionNote?: string;
  humanReviewRequested: boolean;
  escalationReason?: string;
  nextAction?: string;
  nextActionPrompt?: string;
  matchedSymptomCategories: MatchedSymptom[];
  plannedEvidence: PlannedEvidenceItem[];
  currentEvidencePrompt?: string;
};

export type JourneyTransition =
  | "submit_intake"
  | "acknowledge_triage"
  | "request_evidence"
  | "submit_evidence"
  | "add_more_evidence"
  | "finish_evidence"
  | "evaluate"
  | "ready_diagnosis"
  | "escalate"
  | "request_human_review"
  | "resolve"
  | "resolve_stop_driving"
  | "add_followup_evidence";

const VALID_TRANSITIONS: Record<JourneyState, JourneyTransition[]> = {
  intake: ["submit_intake"],
  triage: ["acknowledge_triage", "request_evidence", "submit_evidence", "escalate", "resolve_stop_driving"],
  evidence_requested: ["submit_evidence", "finish_evidence", "escalate", "resolve_stop_driving"],
  evidence_received: ["add_more_evidence", "evaluate", "escalate", "resolve_stop_driving"],
  evaluating: ["ready_diagnosis", "escalate", "resolve_stop_driving"],
  diagnosis_ready: ["resolve", "request_human_review", "escalate"],
  escalation_required: ["request_human_review", "submit_evidence", "add_more_evidence", "resolve", "resolve_stop_driving"],
  human_review: ["resolve", "resolve_stop_driving"],
  resolved: ["add_followup_evidence"],
};

const TRANSITION_TARGETS: Record<JourneyTransition, JourneyState> = {
  submit_intake: "triage",
  acknowledge_triage: "evidence_requested",
  request_evidence: "evidence_requested",
  submit_evidence: "evidence_received",
  add_more_evidence: "evidence_received",
  finish_evidence: "evidence_received",
  evaluate: "evaluating",
  ready_diagnosis: "diagnosis_ready",
  escalate: "escalation_required",
  request_human_review: "human_review",
  resolve: "resolved",
  resolve_stop_driving: "resolved",
  add_followup_evidence: "evidence_received",
};

const SAFETY_KEYWORDS: Record<string, string[]> = {
  brakes: ["brake failure", "brakes failed", "no brakes", "brake loss", "braking loss", "can't stop", "cannot stop"],
  steering: ["steering loss", "steering failed", "can't steer", "cannot steer", "steering wheel loose"],
  overheating: ["overheating", "over heat", "over-heating", "temperature warning", "coolant loss", "steam from engine"],
  fuel_leak: ["fuel leak", "gas leak", "smell gas", "fuel odor", "fuel smell", "smelling gas"],
  smoke_fire: ["smoke", "fire", "flames", "burning", "smoldering"],
  severe_electrical: ["electrical fire", "wiring burning", "battery hot", "battery smoking", "electrical smell"],
  wheel_tire_separation: ["tire blowout", "wheel wobble", "wheel separation", "tire separation", "hub separation"],
  unsafe_drivability: ["can't drive", "cannot drive", "won't drive", "unsafe to drive", "dangerous to drive", "pulling hard", "vibrating violently"],
};

export function generateJourneyCaseId(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 17);
  return `JRN-${stamp}-${randomBytes(4).toString("hex")}`;
}

export function isValidTransition(current: JourneyState, transition: JourneyTransition): boolean {
  return VALID_TRANSITIONS[current]?.includes(transition) ?? false;
}

export function transitionTarget(transition: JourneyTransition): JourneyState {
  return TRANSITION_TARGETS[transition];
}

export function evaluateSafetyFlags(input: {
  urgency?: string;
  canDrive?: string;
  description?: string;
  timing?: string;
}): SafetyFlag[] {
  const combined = [
    input.urgency || "",
    input.canDrive || "",
    input.description || "",
    input.timing || "",
  ].join(" ").toLowerCase();

  return SAFETY_STOP_DRIVING_TRIGGERS.map((trigger) => {
    const keywords = SAFETY_KEYWORDS[trigger.id] || [];
    const matched = keywords.some((kw) => combined.includes(kw));
    return {
      triggerId: trigger.id,
      label: trigger.label,
      matched,
      matchedPhrase: matched ? keywords.find((kw) => combined.includes(kw)) : undefined,
    };
  });
}

export function hasSafetyTrigger(flags: SafetyFlag[]): boolean {
  return flags.some((f) => f.matched);
}

export function calculateConfidence(caseData: JourneyCase): {
  score: number;
  level: ConfidenceLevel;
  riskLevel: RiskLevel;
} {
  let score = 0;

  if (caseData.vehicleInfo && caseData.vehicleInfo.length > 5) score += 10;
  if (caseData.description && caseData.description.length >= 20) score += 15;
  if (caseData.description && caseData.description.length >= 50) score += 10;
  if (caseData.timing) score += 10;
  if (caseData.urgency) score += 5;
  if (caseData.canDrive) score += 5;

  const photoCount = caseData.evidence.filter((e) => e.kind === "photo").length;
  const textCount = caseData.evidence.filter((e) => e.kind === "text").length;
  score += Math.min(photoCount * 8, 24);
  score += Math.min(textCount * 5, 15);

  if (caseData.evidence.some((e) => e.kind === "audio")) score += 5;
  if (caseData.evidence.some((e) => e.kind === "video")) score += 5;
  if (caseData.evidence.some((e) => e.kind === "vibration")) score += 5;

  const symptomMatchCount = caseData.matchedSymptomCategories?.length || 0;
  if (symptomMatchCount > 0) score += Math.min(symptomMatchCount * 8, 20);

  score = Math.min(score, 100);

  let level: ConfidenceLevel;
  if (score >= 70) level = "high";
  else if (score >= 40) level = "moderate";
  else if (score >= 15) level = "low";
  else level = "insufficient_information";

  let riskLevel: RiskLevel;
  if (caseData.safetyTriggered) riskLevel = "critical";
  else if (score >= 60) riskLevel = "low";
  else if (score >= 35) riskLevel = "medium";
  else riskLevel = "high";

  return { score, level, riskLevel };
}

const SELL_INTENT_PHRASES = [
  "sell the car",
  "sell the vehicle",
  "sell it",
  "selling",
  "trade in",
  "trade-in",
  "get rid of",
  "not worth fixing",
  "not worth repairing",
  "not worth it",
  "junk it",
  "scrap it",
];

const CATASTROPHIC_REPAIR_PHRASES = [
  "blown engine",
  "seized engine",
  "cracked engine block",
  "needs a new engine",
  "needs new engine",
  "needs a new transmission",
  "needs new transmission",
  "transmission failed",
  "transmission failure",
  "frame damage",
  "bent frame",
  "flood damage",
  "flooded",
  "salvage title",
  "totaled",
];

export function determineOutcome(caseData: JourneyCase): OwnerOutcome {
  if (caseData.safetyTriggered) return "stop_driving";

  const combined = [caseData.description || "", caseData.urgency || "", caseData.canDrive || ""]
    .join(" ")
    .toLowerCase();

  // Explicit owner sell intent wins over fix/monitor (safety already handled above).
  if (SELL_INTENT_PHRASES.some((phrase) => combined.includes(phrase))) {
    return "sell";
  }

  // Catastrophic / uneconomical damage signals sell only when we have enough
  // confidence to be useful; otherwise monitor and ask for more evidence.
  if (
    (caseData.confidenceLevel === "moderate" || caseData.confidenceLevel === "high") &&
    CATASTROPHIC_REPAIR_PHRASES.some((phrase) => combined.includes(phrase))
  ) {
    return "sell";
  }

  const urgency = (caseData.urgency || "").toLowerCase();
  const canDrive = (caseData.canDrive || "").toLowerCase();

  if (urgency.includes("not safe") || urgency.includes("will not start") || canDrive.includes("no")) {
    return "fix";
  }

  if (urgency.includes("short distance") || canDrive.includes("short")) {
    return "fix";
  }

  if (caseData.confidenceLevel === "insufficient_information") {
    return "monitor";
  }

  if (caseData.confidenceLevel === "low") {
    return "monitor";
  }

  if (caseData.confidenceLevel === "moderate" || caseData.confidenceLevel === "high") {
    return "fix";
  }

  return "monitor";
}

export function determineDecisionPath(outcome: OwnerOutcome, confidenceLevel: ConfidenceLevel): DecisionPathId | undefined {
  switch (outcome) {
    case "fix":
      return confidenceLevel === "high" || confidenceLevel === "moderate" ? "professional_repair" : undefined;
    case "sell":
      return "sell_as_is";
    case "monitor":
      return "monitor_wait";
    case "stop_driving":
      return undefined;
  }
}

type DecisionPacket = {
  outcome: OwnerOutcome;
  decisionPath: DecisionPathId | undefined;
  confidenceLevel: ConfidenceLevel;
  confidenceScore: number;
  riskLevel: RiskLevel;
  safetyTriggered: boolean;
  vehicleInfo: string;
  summary: string;
  evidenceSummary: {
    photos: number;
    audio: number;
    video: number;
    vibration: number;
    text: number;
    persistedCount: number;
  };
  matchedSymptoms: Array<{
    label: string;
    confidence: number;
    possibleRiskLevel: string;
    safetyNote: string | null;
  }>;
  guidance: {
    title: string;
    description: string;
    immediateSteps: string[];
    whatToShare: string[];
    warnings: string[];
    followUp: string[];
  };
  evidenceBelongsToCase: boolean;
  reusableForFixSell: boolean;
};

function buildFixGuidance(caseData: JourneyCase): DecisionPacket["guidance"] {
  const hasPersistedEvidence = caseData.evidence.some((e) => e.status === "persisted");
  return {
    title: "Get It Repaired Professionally",
    description: "Take the vehicle and your collected evidence to a qualified shop, mobile mechanic, or specialist.",
    immediateSteps: [
      "Review the evidence you captured — it belongs to your case and can be shared with any shop.",
      "Contact a repair shop and share the symptom summary and evidence.",
      "Ask the shop to inspect the specific areas identified in your matched symptoms.",
    ],
    whatToShare: [
      "All photos, audio, video, and vibration recordings from this case.",
      "The symptom summary: " + caseData.matchedSymptomCategories.map((m) => m.label).join(", "),
      "Your description: " + caseData.description.slice(0, 200),
    ],
    warnings: [
      "This is not a certified diagnosis — a physical inspection by a qualified mechanic is required.",
      "Do not drive if safety triggers were detected (brakes, steering, overheating, fuel leak, smoke/fire).",
      "Confidence level: " + caseData.confidenceLevel + " — more evidence increases certainty.",
    ],
    followUp: [
      "If the shop confirms a different root cause, you can add that as follow-up evidence.",
      "Track repair outcome to improve future guidance.",
    ],
  };
}

function buildSellGuidance(caseData: JourneyCase): DecisionPacket["guidance"] {
  return {
    title: "Sell or List It As-Is",
    description: "Prepare an honest, evidence-backed listing when repair is not the preferred path.",
    immediateSteps: [
      "Gather all evidence from this case — it belongs to your vehicle and transfers to the buyer.",
      "Use the symptom summary and evidence to write an honest condition description.",
      "Disclose all known issues clearly; transparency reduces liability and builds trust.",
    ],
    whatToShare: [
      "All photos, audio, video, and vibration recordings from this case.",
      "Symptom categories detected: " + caseData.matchedSymptomCategories.map((m) => m.label).join(", "),
      "Confidence level: " + caseData.confidenceLevel + " (" + caseData.confidenceScore + "/100)",
      "Any safety triggers detected: " + (caseData.safetyTriggered ? "YES — must disclose" : "None"),
    ],
    warnings: [
      "Do not conceal safety-related issues — this may have legal consequences.",
      "If safety triggers were detected, the vehicle should not be driven to the buyer.",
      "This is not a certified inspection — buyers should still get their own inspection.",
    ],
    followUp: [
      "Consider a pre-sale inspection for buyer confidence.",
      "Use the evidence to justify your asking price or negotiate fairly.",
    ],
  };
}

function buildMonitorGuidance(caseData: JourneyCase): DecisionPacket["guidance"] {
  const topSymptom = caseData.matchedSymptomCategories[0];
  return {
    title: "Wait and Monitor",
    description: "Monitor a lower-risk concern with clear warning signs, usage limits, and a defined follow-up point.",
    immediateSteps: [
      "Continue driving normally unless symptoms worsen.",
      "Watch for the specific warning signs below.",
      "Re-check in 1-2 weeks or at the next service interval.",
    ],
    whatToShare: [
      "Current evidence is saved to your case for future reference.",
      "Primary concern: " + (topSymptom?.label || "unspecified issue"),
      "Confidence level: " + caseData.confidenceLevel + " — more evidence could clarify the issue.",
    ],
    warnings: [
      "If the issue worsens or new symptoms appear, start a new journey or add evidence to this case.",
      "Safety triggers override monitoring — stop driving immediately if brakes, steering, overheating, fuel leak, or smoke/fire occur.",
      "Low confidence means the issue is not well understood yet.",
    ],
    followUp: [
      "Re-run the journey if symptoms change or new evidence becomes available.",
      "Schedule a routine inspection at your next service visit.",
    ],
  };
}

function buildStopDrivingGuidance(caseData: JourneyCase): DecisionPacket["guidance"] {
  const triggeredFlags = caseData.safetyFlags.filter((f) => f.matched).map((f) => f.label).join(", ");
  return {
    title: "Do Not Drive — Seek In-Person Help",
    description: "A safety trigger was detected. This vehicle should not be driven until inspected in person by a qualified professional.",
    immediateSteps: [
      "STOP DRIVING immediately.",
      "Arrange for a tow to a repair shop or your home.",
      "Do not attempt to drive even a short distance.",
    ],
    whatToShare: [
      "All evidence from this case with the tow driver and repair shop.",
      "Safety trigger(s) detected: " + triggeredFlags,
      "Your full description: " + caseData.description.slice(0, 300),
    ],
    warnings: [
      "Driving with these conditions risks serious injury or death.",
      "This is not a suggestion — it is a safety boundary.",
      "No amount of evidence or confidence change alters this directive.",
    ],
    followUp: [
      "After in-person inspection and repair, you can start a new journey to verify the fix.",
      "Share the repair outcome to improve future safety detection.",
    ],
  };
}

export function buildDecisionPacket(caseData: JourneyCase): DecisionPacket {
  const evidenceSummary = {
    photos: caseData.evidence.filter((e) => e.kind === "photo").length,
    audio: caseData.evidence.filter((e) => e.kind === "audio").length,
    video: caseData.evidence.filter((e) => e.kind === "video").length,
    vibration: caseData.evidence.filter((e) => e.kind === "vibration").length,
    text: caseData.evidence.filter((e) => e.kind === "text").length,
    persistedCount: caseData.evidence.filter((e) => e.status === "persisted").length,
  };

  let guidance: DecisionPacket["guidance"];
  switch (caseData.outcome) {
    case "fix":
      guidance = buildFixGuidance(caseData);
      break;
    case "sell":
      guidance = buildSellGuidance(caseData);
      break;
    case "monitor":
      guidance = buildMonitorGuidance(caseData);
      break;
    case "stop_driving":
      guidance = buildStopDrivingGuidance(caseData);
      break;
    default:
      guidance = buildMonitorGuidance(caseData);
  }

  return {
    outcome: caseData.outcome || "monitor",
    decisionPath: caseData.decisionPath,
    confidenceLevel: caseData.confidenceLevel,
    confidenceScore: caseData.confidenceScore,
    riskLevel: caseData.riskLevel,
    safetyTriggered: caseData.safetyTriggered,
    vehicleInfo: caseData.vehicleInfo,
    summary: caseData.description.slice(0, 300),
    evidenceSummary,
    matchedSymptoms: caseData.matchedSymptomCategories.map((m) => ({
      label: m.label,
      confidence: m.confidence,
      possibleRiskLevel: m.possibleRiskLevel,
      safetyNote: m.safetyNote,
    })),
    guidance,
    evidenceBelongsToCase: true,
    reusableForFixSell: true,
  };
}

export function buildNextAction(state: JourneyState, caseData: JourneyCase): {
  action: string;
  prompt: string;
  evidencePrompt?: string;
} {
  switch (state) {
    case "intake":
      return {
        action: "submit_intake",
        prompt: "Tell us about your vehicle and what is happening.",
      };
    case "triage":
      if (caseData.safetyTriggered) {
        return {
          action: "resolve_stop_driving",
          prompt: "Based on what you described, this may not be safe to drive. Please stop driving and seek in-person help. We can connect you with next steps.",
        };
      }
      if (caseData.matchedSymptomCategories.length > 0) {
        const top = getTopSymptomCategory(caseData.matchedSymptomCategories);
        return {
          action: "request_evidence",
          prompt: `We detected a possible issue: ${top?.label || "vehicle problem"}. Can you share one piece of evidence that would help us understand it better? Pick the easiest thing to capture safely.`,
          evidencePrompt: top?.commonEvidenceNeeded || "Share a photo or description of what you observe.",
        };
      }
      return {
        action: "request_evidence",
        prompt: "Can you share one photo or one more detail that would help us understand the issue better? Pick the easiest thing to capture safely.",
      };
    case "evidence_requested": {
      const hasPlanned = caseData.plannedEvidence.length > 0;
      if (hasPlanned) {
        return {
          action: "submit_evidence",
          prompt: "Upload one piece of evidence when you can. When you are ready, let us know you are done.",
          evidencePrompt: "See the suggested evidence items below — choose the easiest one to capture safely.",
        };
      }
      return {
        action: "submit_evidence",
        prompt: "Upload one photo or describe one more detail when you can. When you are ready, let us know you are done.",
      };
    }
    case "evidence_received": {
      const confidenceLevel = caseData.confidenceLevel;
      const evidenceCount = caseData.evidence.length;
      const topSymptom = caseData.matchedSymptomCategories[0];
      if (confidenceLevel === "insufficient_information") {
        return {
          action: "evaluate",
          prompt: `Thanks — that evidence is saved. With only ${evidenceCount} piece${evidenceCount !== 1 ? "s" : ""} of evidence, confidence is still building. Add one more item when you can, or continue to review what you have shared.`,
        };
      }
      if (confidenceLevel === "low") {
        return {
          action: "evaluate",
          prompt: `Thanks — that evidence is saved. Confidence is currently low at ${confidenceLevel}. Add one more piece of evidence when you can to help clarify the issue, or continue to review what you have shared.`,
        };
      }
      if (topSymptom) {
        return {
          action: "evaluate",
          prompt: `Thanks — that evidence is saved. We detected a possible issue: ${topSymptom.label}. Add one more item if it helps, or continue to review what you have shared.`,
        };
      }
      return {
        action: "evaluate",
        prompt: "Thanks — that evidence is saved. You can add one more item if it helps, or continue to review what you have shared.",
      };
    }
    case "evaluating":
      return {
        action: "ready_diagnosis",
        prompt: "We are building your results.",
      };
    case "diagnosis_ready": {
      const outcome = caseData.outcome || "monitor";
      switch (outcome) {
        case "fix":
          return {
            action: "resolve",
            prompt: "Your results are ready. Based on what you shared, here is what we recommend and what to do next.",
          };
        case "sell":
          return {
            action: "resolve",
            prompt: "Your results are ready. Selling as-is may be a better option than continuing to repair.",
          };
        case "monitor":
          return {
            action: "resolve",
            prompt: "Your results are ready. We recommend keeping an eye on the issue and watching for changes.",
          };
        case "stop_driving":
          return {
            action: "resolve_stop_driving",
            prompt: "Your results are ready. Please do not drive this vehicle until it has been inspected in person.",
          };
        default:
          return {
            action: "resolve",
            prompt: "Your results are ready.",
          };
      }
    }
    case "escalation_required": {
      const safetyFlags = caseData.safetyFlags.filter((f) => f.matched);
      const evidenceCount = caseData.evidence.length;
      if (evidenceCount === 0) {
        return {
          action: "submit_evidence",
          prompt: "Your case has been flagged for safety review. Please share one piece of evidence that helps us understand the concern — such as a photo, audio clip, or description — so it can be reviewed thoroughly.",
        };
      }
      return {
        action: "request_human_review",
        prompt: "Your case has been flagged for safety review. You have shared evidence that will help the reviewer. Would you like to request a human review now?",
      };
    }
    case "human_review":
      return {
        action: "resolve",
        prompt: "A human reviewer is looking at your case. You will be notified when it is ready.",
      };
    case "resolved":
      return {
        action: "",
        prompt: "Your case is resolved. Thank you for using Drivable.",
      };
  }
}

export function createJourneyCase(input: {
  vehicleInfo: string;
  description: string;
  timing?: string;
  urgency?: string;
  canDrive?: string;
  customerId?: string;
  customerEmail?: string;
  symptomCategories?: any[];
  evidenceItems?: any[];
}): JourneyCase {
  const now = new Date().toISOString();
  const safetyFlags = evaluateSafetyFlags(input);
  const safetyTriggered = hasSafetyTrigger(safetyFlags);

  const matchedSymptoms = classifySymptoms(
    input.description,
    input.timing,
    input.urgency,
    input.canDrive,
    input.symptomCategories
  );

  const partialCase: JourneyCase = {
    id: generateJourneyCaseId(),
    state: "intake",
    createdAt: now,
    updatedAt: now,
    vehicleInfo: input.vehicleInfo,
    description: input.description,
    timing: input.timing,
    urgency: input.urgency,
    canDrive: input.canDrive,
    customerId: input.customerId,
    customerEmail: input.customerEmail,
    evidence: [],
    safetyFlags,
    safetyTriggered,
    confidenceScore: 0,
    confidenceLevel: "insufficient_information",
    riskLevel: "unknown",
    humanReviewRequested: false,
    matchedSymptomCategories: matchedSymptoms,
    plannedEvidence: [],
  };

  const conf = calculateConfidence(partialCase);
  partialCase.confidenceScore = conf.score;
  partialCase.confidenceLevel = conf.level;
  partialCase.riskLevel = conf.riskLevel;

  if (safetyTriggered) {
    partialCase.state = "escalation_required";
    partialCase.escalationReason = "Safety trigger detected during intake";
  }

  if (input.evidenceItems && input.evidenceItems.length > 0 && matchedSymptoms.length > 0 && !safetyTriggered) {
    partialCase.plannedEvidence = planEvidence(
      matchedSymptoms,
      input.evidenceItems,
      partialCase.evidence,
      5
    );
    const nextEvidence = getNextEvidenceToRequest(partialCase.plannedEvidence, partialCase.evidence);
    if (nextEvidence) {
      partialCase.currentEvidencePrompt = buildEvidencePrompt(nextEvidence, safetyTriggered);
    }
  }

  const next = buildNextAction(partialCase.state, partialCase);
  partialCase.nextAction = next.action;
  partialCase.nextActionPrompt = next.prompt;
  if (!partialCase.currentEvidencePrompt) {
    partialCase.currentEvidencePrompt = next.evidencePrompt;
  }

  return partialCase;
}

export function advanceJourney(
  caseData: JourneyCase,
  transition: JourneyTransition,
  additionalData?: {
    evidence?: (Evidence | EvidenceRecord)[];
    outcome?: OwnerOutcome;
    resolutionNote?: string;
    escalationReason?: string;
    evidenceItems?: any[];
  }
): JourneyCase {
  if (!isValidTransition(caseData.state, transition)) {
    throw new Error(`Invalid transition: ${transition} from state ${caseData.state}`);
  }

  const updated = { ...caseData };
  const now = new Date().toISOString();
  updated.updatedAt = now;

if ((transition === "submit_evidence" || transition === "add_more_evidence" || transition === "add_followup_evidence") && additionalData?.evidence) {
    const normalized: EvidenceRecord[] = additionalData.evidence.map((e: any) => ({
      id: e.id || `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      kind: e.kind,
      addedAt: e.addedAt || new Date().toISOString(),
      description: e.description,
      originalName: e.originalName,
      mimeType: e.mimeType,
      byteSize: e.byteSize,
      storageKey: e.storageKey,
      attachmentId: e.attachmentId,
      status: e.status || (e.storageKey ? "persisted" : "text_only"),
    }));
    updated.evidence = [...updated.evidence, ...normalized];
  }

  // When adding follow-up evidence to a resolved case, clear the previous resolution
  // so the case can be re-evaluated with the new evidence.
  if (transition === "add_followup_evidence") {
    updated.outcome = undefined;
    updated.decisionPath = undefined;
    updated.resolutionNote = undefined;
    updated.humanReviewRequested = false;
  }

  updated.confidenceScore = calculateConfidence(updated).score;
  updated.confidenceLevel = calculateConfidence(updated).level;
  updated.riskLevel = calculateConfidence(updated).riskLevel;

  const previousState = updated.state;
  updated.state = transitionTarget(transition);

  if (transition === "escalate") {
    updated.escalationReason = additionalData?.escalationReason || "Safety or confidence concern";
    updated.humanReviewRequested = true;
  }

  if (transition === "resolve" || transition === "resolve_stop_driving") {
    updated.outcome = transition === "resolve_stop_driving"
      ? "stop_driving"
      : additionalData?.outcome || determineOutcome(updated);
    updated.resolutionNote = additionalData?.resolutionNote;
    updated.decisionPath = determineDecisionPath(updated.outcome, updated.confidenceLevel);
  }

  if (transition === "ready_diagnosis") {
    updated.outcome = determineOutcome(updated);
    updated.decisionPath = determineDecisionPath(updated.outcome, updated.confidenceLevel);
  }

  const evidenceItems = additionalData?.evidenceItems;
  const entersEvidenceRequested =
    updated.state === "evidence_requested" &&
    (transition === "acknowledge_triage" || transition === "request_evidence" || (transition === "submit_evidence" && previousState === "triage"));

  if (entersEvidenceRequested && evidenceItems && evidenceItems.length > 0 && updated.matchedSymptomCategories.length > 0) {
    updated.plannedEvidence = planEvidence(
      updated.matchedSymptomCategories,
      evidenceItems,
      updated.evidence,
      5
    );
  }

  if ((transition === "submit_evidence" || transition === "add_more_evidence" || transition === "add_followup_evidence") && evidenceItems && evidenceItems.length > 0 && updated.matchedSymptomCategories.length > 0) {
    updated.plannedEvidence = planEvidence(
      updated.matchedSymptomCategories,
      evidenceItems,
      updated.evidence,
      5
    );
  }

  const next = buildNextAction(updated.state, updated);
  updated.nextAction = next.action;
  updated.nextActionPrompt = next.prompt;

  const nextEvidence = getNextEvidenceToRequest(updated.plannedEvidence, updated.evidence);
  if (nextEvidence) {
    updated.currentEvidencePrompt = buildEvidencePrompt(nextEvidence, updated.safetyTriggered);
  } else {
    updated.currentEvidencePrompt = next.evidencePrompt;
  }

  return updated;
}

type Evidence = {
  kind: "photo" | "audio" | "video" | "vibration" | "text";
  description?: string;
};

export type {
  Evidence as JourneyEvidence,
  DecisionPacket,
};
