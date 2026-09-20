import { randomBytes } from "node:crypto";
import { db } from "./db";
import { journeyCaseEvents } from "../shared/schema";
import { eq, and, asc } from "drizzle-orm";
import type { JourneyCase, JourneyState, JourneyTransition, OwnerOutcome, EvidenceRecord } from "./journey-state-machine";
import { logEvent, logEventError } from "./observability/safe-log";

export type JourneyCaseEventType =
  | "case_started"
  | "state_transition"
  | "evidence_added"
  | "safety_escalated"
  | "review_requested"
  | "review_approved"
  | "review_rejected"
  | "case_resolved";

export type JourneyCaseEventRow = {
  eventId: string;
  caseId: string;
  customerId: string | null;
  eventType: string;
  fromState: string | null;
  toState: string | null;
  transition: string | null;
  outcome: string | null;
  evidenceKind: string | null;
  evidenceCount: number | null;
  reviewerRef: string | null;
  reviewAction: string | null;
  reasonCode: string | null;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date | null;
};

function generateEventId(): string {
  return `evt-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function customerMessageForTransition(
  fromState: JourneyState,
  toState: JourneyState,
  transition: JourneyTransition,
  safetyTriggered: boolean,
): string {
  if (safetyTriggered && toState === "escalation_required") {
    return "A safety concern was detected. Your case has been escalated for priority review.";
  }
  switch (toState) {
    case "triage":
      return "Your vehicle information has been received. We are analyzing your concern.";
    case "evidence_requested":
      return "We need a bit more information. Please share evidence when you can.";
    case "evidence_received":
      return "Evidence saved. You can add more or continue to review.";
    case "evaluating":
      return "We are reviewing your case and building your results.";
    case "diagnosis_ready":
      return "Your results are ready. Review your recommended next steps.";
    case "escalation_required":
      return "Your case has been escalated for safety review.";
    case "human_review":
      return "A team member is reviewing your case. You will be notified when complete.";
    case "resolved":
      return "Your case is resolved. Thank you for using Drivable.";
    default:
      return `Your case moved to ${toState.replace(/_/g, " ")}.`;
  }
}

function evidenceAddedMessage(kind: string, count: number): string {
  const label = kind === "text" ? "description" : kind;
  return `New ${label} evidence added (${count} total).`;
}

/**
 * Append a journey case event to the durable event log.
 * Failures are logged but never throw — the event log is a side-effect, not a gate.
 */
export async function logJourneyCaseEvent(event: {
  caseId: string;
  customerId?: string;
  eventType: JourneyCaseEventType;
  fromState?: JourneyState;
  toState?: JourneyState;
  transition?: JourneyTransition;
  outcome?: OwnerOutcome;
  evidenceKind?: string;
  evidenceCount?: number;
  reviewerRef?: string;
  reviewAction?: string;
  reasonCode?: string;
  message?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(journeyCaseEvents).values({
      eventId: generateEventId(),
      caseId: event.caseId,
      customerId: event.customerId || null,
      eventType: event.eventType,
      fromState: event.fromState || null,
      toState: event.toState || null,
      transition: event.transition || null,
      outcome: event.outcome || null,
      evidenceKind: event.evidenceKind || null,
      evidenceCount: event.evidenceCount || null,
      reviewerRef: event.reviewerRef || null,
      reviewAction: event.reviewAction || null,
      reasonCode: event.reasonCode || null,
      message: event.message || null,
      payload: event.payload || null,
    });
  } catch (err) {
    logEventError("journey.case_event_log_failed", err, {
      caseId: event.caseId,
      eventType: event.eventType,
    });
  }
}

/** Log a case start event. */
export async function logCaseStarted(caseData: JourneyCase): Promise<void> {
  await logJourneyCaseEvent({
    caseId: caseData.id,
    customerId: caseData.customerId,
    eventType: "case_started",
    toState: caseData.state,
    outcome: caseData.outcome,
    message: `Case started for ${caseData.vehicleInfo}.`,
    payload: {
      vehicleInfo: caseData.vehicleInfo,
      safetyTriggered: caseData.safetyTriggered,
      confidenceScore: caseData.confidenceScore,
      confidenceLevel: caseData.confidenceLevel,
    },
  });
}

/** Log a state transition event. */
export async function logStateTransition(
  caseData: JourneyCase,
  previousState: JourneyState,
  transition: JourneyTransition,
): Promise<void> {
  const message = customerMessageForTransition(previousState, caseData.state, transition, caseData.safetyTriggered);
  await logJourneyCaseEvent({
    caseId: caseData.id,
    customerId: caseData.customerId,
    eventType: caseData.safetyTriggered && caseData.state === "escalation_required"
      ? "safety_escalated"
      : "state_transition",
    fromState: previousState,
    toState: caseData.state,
    transition,
    outcome: caseData.outcome,
    message,
    payload: {
      confidenceScore: caseData.confidenceScore,
      confidenceLevel: caseData.confidenceLevel,
      riskLevel: caseData.riskLevel,
      humanReviewRequested: caseData.humanReviewRequested,
    },
  });
}

/** Log an evidence addition event. */
export async function logEvidenceAdded(
  caseData: JourneyCase,
  evidenceRecords: EvidenceRecord[],
): Promise<void> {
  const kinds = [...new Set(evidenceRecords.map((e) => e.kind))];
  for (const kind of kinds) {
    const count = evidenceRecords.filter((e) => e.kind === kind).length;
    await logJourneyCaseEvent({
      caseId: caseData.id,
      customerId: caseData.customerId,
      eventType: "evidence_added",
      toState: caseData.state,
      evidenceKind: kind,
      evidenceCount: caseData.evidence.length,
      message: evidenceAddedMessage(kind, caseData.evidence.length),
    });
  }
}

/** Log a review action event. */
export async function logReviewAction(
  caseId: string,
  customerId: string | undefined,
  action: "requested" | "approved" | "rejected",
  reviewerRef: string,
  details?: { reasonCode?: string; resolutionNote?: string },
): Promise<void> {
  const eventType: JourneyCaseEventType =
    action === "requested" ? "review_requested" :
    action === "approved" ? "review_approved" :
    "review_rejected";

  const messages = {
    requested: "Your case has been submitted for human review.",
    approved: "Your case has been reviewed and approved.",
    rejected: `Review rejected: ${details?.reasonCode || "see details"}.`,
  };

  await logJourneyCaseEvent({
    caseId,
    customerId,
    eventType,
    reviewerRef,
    reviewAction: action,
    reasonCode: details?.reasonCode,
    message: messages[action],
    payload: {
      resolutionNote: details?.resolutionNote,
    },
  });
}

/** Log a case resolution event. */
export async function logCaseResolved(
  caseData: JourneyCase,
  transition: JourneyTransition,
): Promise<void> {
  await logJourneyCaseEvent({
    caseId: caseData.id,
    customerId: caseData.customerId,
    eventType: "case_resolved",
    fromState: "diagnosis_ready",
    toState: "resolved",
    transition,
    outcome: caseData.outcome,
    message: `Case resolved with outcome: ${caseData.outcome || "unknown"}.`,
    payload: {
      decisionPath: caseData.decisionPath,
      resolutionNote: caseData.resolutionNote,
      confidenceScore: caseData.confidenceScore,
      confidenceLevel: caseData.confidenceLevel,
    },
  });
}

/**
 * Retrieve the event timeline for a case, ordered chronologically.
 */
export async function getCaseEvents(caseId: string): Promise<JourneyCaseEventRow[]> {
  try {
    const rows = await db
      .select()
      .from(journeyCaseEvents)
      .where(eq(journeyCaseEvents.caseId, caseId))
      .orderBy(asc(journeyCaseEvents.createdAt));
    return rows;
  } catch (err) {
    logEventError("journey.case_events_query_failed", err, { caseId });
    return [];
  }
}

/**
 * Retrieve events for a customer across all their cases, newest first.
 */
export async function getCustomerCaseEvents(
  customerId: string,
  limit = 50,
): Promise<JourneyCaseEventRow[]> {
  try {
    const rows = await db
      .select()
      .from(journeyCaseEvents)
      .where(eq(journeyCaseEvents.customerId, customerId))
      .orderBy(asc(journeyCaseEvents.createdAt))
      .limit(limit);
    return rows.reverse();
  } catch (err) {
    logEventError("journey.customer_events_query_failed", err, { customerId });
    return [];
  }
}
