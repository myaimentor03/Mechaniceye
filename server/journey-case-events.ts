import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import { journeyCaseEvents } from "../shared/schema";
import { eq, and, asc } from "drizzle-orm";
import type { JourneyCase, JourneyState, JourneyTransition, OwnerOutcome, EvidenceRecord } from "./journey-state-machine";
import { logEvent, logEventError } from "./observability/safe-log";

// ── Resilient local fallback (file + in-memory) ─────────────────────────
// Ensures customer-visible timeline works without DATABASE_URL and survives
// process restarts via data/journey-events.json.  PG is durable primary
// when available; local cache is fallback and dual-write target.
const EVENTS_STORE_PATH = path.join(process.cwd(), "data", "journey-events.json");

function eventsStorePath(): string {
  return process.env.JOURNEY_EVENTS_PATH?.trim() || EVENTS_STORE_PATH;
}

function ensureEventsDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch { /* best-effort */ }
}

function loadEventsRaw(): JourneyCaseEventRow[] {
  const p = eventsStorePath();
  try {
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row: any) => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    })) as JourneyCaseEventRow[];
  } catch { return []; }
}

function saveEventsRaw(rows: JourneyCaseEventRow[]): void {
  const p = eventsStorePath();
  try {
    ensureEventsDir(path.dirname(p));
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
    fs.renameSync(tmp, p);
  } catch { /* ignore persistence errors */ }
}

const memoryEvents: JourneyCaseEventRow[] = loadEventsRaw();

function appendMemoryEvent(row: JourneyCaseEventRow): void {
  memoryEvents.push(row);
  // Keep bounded: retain last 5000 events to avoid unbounded growth
  if (memoryEvents.length > 5000) memoryEvents.splice(0, memoryEvents.length - 5000);
  saveEventsRaw(memoryEvents);
}

export function clearJourneyEventsForTests(): void {
  memoryEvents.length = 0;
  saveEventsRaw([]);
}

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
 * Dual-writes to PG (when configured) and local file/memory fallback.
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
  const row: JourneyCaseEventRow = {
    eventId: generateEventId(),
    caseId: event.caseId,
    customerId: event.customerId || null,
    eventType: event.eventType,
    fromState: event.fromState || null,
    toState: event.toState || null,
    transition: event.transition || null,
    outcome: event.outcome || null,
    evidenceKind: event.evidenceKind || null,
    evidenceCount: event.evidenceCount ?? null,
    reviewerRef: event.reviewerRef || null,
    reviewAction: event.reviewAction || null,
    reasonCode: event.reasonCode || null,
    message: event.message || null,
    payload: event.payload || null,
    createdAt: new Date(),
  };
  // Always persist to local fallback so timeline is available without DB
  appendMemoryEvent(row);
  try {
    await db.insert(journeyCaseEvents).values({
      eventId: row.eventId,
      caseId: row.caseId,
      customerId: row.customerId,
      eventType: row.eventType,
      fromState: row.fromState,
      toState: row.toState,
      transition: row.transition,
      outcome: row.outcome,
      evidenceKind: row.evidenceKind,
      evidenceCount: row.evidenceCount,
      reviewerRef: row.reviewerRef,
      reviewAction: row.reviewAction,
      reasonCode: row.reasonCode,
      message: row.message,
      payload: row.payload,
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
 * Falls back to local file/memory cache when PG is unavailable.
 */
export async function getCaseEvents(caseId: string): Promise<JourneyCaseEventRow[]> {
  try {
    const rows = await db
      .select()
      .from(journeyCaseEvents)
      .where(eq(journeyCaseEvents.caseId, caseId))
      .orderBy(asc(journeyCaseEvents.createdAt));
    if (rows.length > 0) return rows;
    // PG succeeded but returned no rows — fall back to memory if we have data
    const mem = memoryEvents.filter((r) => r.caseId === caseId).sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return at - bt;
    });
    return mem.length > 0 ? mem : rows;
  } catch (err) {
    // DB unavailable — serve from local fallback
    const mem = memoryEvents.filter((r) => r.caseId === caseId).sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return at - bt;
    });
    if (mem.length > 0) return mem;
    logEventError("journey.case_events_query_failed", err, { caseId });
    return mem;
  }
}

/**
 * Retrieve events for a customer across all their cases, newest first.
 * Falls back to local cache when PG is unavailable.
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
    if (rows.length > 0) return rows.reverse();
    const mem = memoryEvents
      .filter((r) => r.customerId === customerId)
      .sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return at - bt;
      })
      .slice(-limit)
      .reverse();
    return mem.length > 0 ? mem : rows.reverse();
  } catch (err) {
    const mem = memoryEvents
      .filter((r) => r.customerId === customerId)
      .sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return at - bt;
      })
      .slice(-limit)
      .reverse();
    if (mem.length > 0) return mem;
    logEventError("journey.customer_events_query_failed", err, { customerId });
    return mem;
  }
}
