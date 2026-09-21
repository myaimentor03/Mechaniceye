import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logEvent, logEventError } from "./observability/safe-log";

// ── Customer-visible notification indicators ──────────────────────────────
// Notifications are the subset of case events that require customer attention.
// They track unread state so the UI can show "You have 2 new updates" badges.
// Stored with the same resilient dual-write pattern as case events.

const NOTIFICATIONS_STORE_PATH = path.join(process.cwd(), "data", "journey-notifications.json");

function notificationsStorePath(): string {
  return process.env.JOURNEY_NOTIFICATIONS_PATH?.trim() || NOTIFICATIONS_STORE_PATH;
}

function ensureDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch { /* best-effort */ }
}

function loadRaw(): NotificationRow[] {
  const p = notificationsStorePath();
  try {
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row: any) => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      readAt: row.readAt ? new Date(row.readAt) : null,
    })) as NotificationRow[];
  } catch { return []; }
}

function saveRaw(rows: NotificationRow[]): void {
  const p = notificationsStorePath();
  try {
    ensureDir(path.dirname(p));
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), "utf8");
    fs.renameSync(tmp, p);
  } catch { /* ignore persistence errors */ }
}

const memoryNotifications: NotificationRow[] = loadRaw();

function appendNotification(row: NotificationRow): void {
  memoryNotifications.push(row);
  // Keep bounded: retain last 2000 notifications
  if (memoryNotifications.length > 2000) memoryNotifications.splice(0, memoryNotifications.length - 2000);
  saveRaw(memoryNotifications);
}

export function clearNotificationsForTests(): void {
  memoryNotifications.length = 0;
  saveRaw([]);
}

export type NotificationKind =
  | "case_started"
  | "state_changed"
  | "evidence_added"
  | "safety_escalated"
  | "review_requested"
  | "review_decided"
  | "case_resolved"
  | "auto_evaluated";

export type NotificationRow = {
  notificationId: string;
  caseId: string;
  customerId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  caseState: string;
  readAt: Date | null;
  createdAt: Date;
};

function generateNotificationId(): string {
  return `ntf-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function titleForKind(kind: NotificationKind, caseState: string): string {
  switch (kind) {
    case "case_started": return "Case Started";
    case "state_changed": return `Case Updated — ${caseState.replace(/_/g, " ")}`;
    case "evidence_added": return "Evidence Received";
    case "safety_escalated": return "Safety Alert";
    case "review_requested": return "Submitted for Review";
    case "review_decided": return "Review Complete";
    case "case_resolved": return "Case Resolved";
    case "auto_evaluated": return "Results Ready";
  }
}

/**
 * Create a notification for a customer about a case event.
 * Notifications are append-only and track read state.
 */
export async function createNotification(opts: {
  caseId: string;
  customerId: string;
  kind: NotificationKind;
  message: string;
  caseState: string;
}): Promise<NotificationRow> {
  const row: NotificationRow = {
    notificationId: generateNotificationId(),
    caseId: opts.caseId,
    customerId: opts.customerId,
    kind: opts.kind,
    title: titleForKind(opts.kind, opts.caseState),
    message: opts.message,
    caseState: opts.caseState,
    readAt: null,
    createdAt: new Date(),
  };

  appendNotification(row);

  logEvent("journey.notification_created", {
    notificationId: row.notificationId,
    caseId: row.caseId,
    kind: row.kind,
    caseState: row.caseState,
  });

  return row;
}

/**
 * Get all notifications for a customer, newest first.
 */
export function getCustomerNotifications(
  customerId: string,
  opts?: { unreadOnly?: boolean; limit?: number },
): NotificationRow[] {
  let rows = memoryNotifications.filter((n) => n.customerId === customerId);

  if (opts?.unreadOnly) {
    rows = rows.filter((n) => n.readAt === null);
  }

  // Sort newest first
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (opts?.limit && opts.limit > 0) {
    rows = rows.slice(0, opts.limit);
  }

  return rows;
}

/**
 * Get unread notification count for a customer.
 */
export function getUnreadCount(customerId: string): number {
  return memoryNotifications.filter(
    (n) => n.customerId === customerId && n.readAt === null,
  ).length;
}

/**
 * Get unread count for a specific case.
 */
export function getCaseUnreadCount(customerId: string, caseId: string): number {
  return memoryNotifications.filter(
    (n) => n.customerId === customerId && n.caseId === caseId && n.readAt === null,
  ).length;
}

/**
 * Mark all notifications for a customer as read (optionally scoped to a case).
 * Returns the number of notifications marked.
 */
export function markAsRead(customerId: string, caseId?: string): number {
  const now = new Date();
  let count = 0;
  for (const n of memoryNotifications) {
    if (n.customerId === customerId && n.readAt === null) {
      if (!caseId || n.caseId === caseId) {
        n.readAt = now;
        count++;
      }
    }
  }
  if (count > 0) saveRaw(memoryNotifications);
  return count;
}

/**
 * Mark a specific notification as read.
 */
export function markNotificationRead(notificationId: string, customerId: string): boolean {
  const n = memoryNotifications.find(
    (x) => x.notificationId === notificationId && x.customerId === customerId,
  );
  if (!n || n.readAt) return false;
  n.readAt = new Date();
  saveRaw(memoryNotifications);
  return true;
}

/**
 * Generate a notification for a state transition if it's customer-meaningful.
 * Returns the notification if created, null otherwise.
 */
export async function notifyStateTransition(opts: {
  caseId: string;
  customerId: string;
  fromState: string;
  toState: string;
  transition: string;
  safetyTriggered: boolean;
  outcome?: string;
}): Promise<NotificationRow | null> {
  // Don't notify for internal transitions the customer doesn't care about
  const silentTransitions = new Set(["add_more_evidence", "add_followup_evidence"]);
  if (silentTransitions.has(opts.transition)) return null;

  // Safety escalation is always notable
  if (opts.safetyTriggered && opts.toState === "escalation_required") {
    return createNotification({
      caseId: opts.caseId,
      customerId: opts.customerId,
      kind: "safety_escalated",
      message: "A safety concern was detected and your case has been escalated for priority review.",
      caseState: opts.toState,
    });
  }

  // Key state changes that require customer attention
  const notableStates = new Set([
    "diagnosis_ready",
    "resolved",
    "human_review",
    "escalation_required",
    "evidence_requested",
  ]);

  if (notableStates.has(opts.toState)) {
    const kind: NotificationKind =
      opts.toState === "resolved" ? "case_resolved" :
      opts.toState === "human_review" ? "review_requested" :
      "state_changed";

    return createNotification({
      caseId: opts.caseId,
      customerId: opts.customerId,
      kind,
      message: stateNotificationMessage(opts.toState, opts.outcome),
      caseState: opts.toState,
    });
  }

  return null;
}

function stateNotificationMessage(toState: string, outcome?: string): string {
  switch (toState) {
    case "diagnosis_ready":
      return "Your results are ready. Open your case to review recommended next steps.";
    case "resolved":
      return `Your case has been resolved${outcome ? ` — recommendation: ${outcome.replace(/_/g, " ")}` : ""}.`;
    case "human_review":
      return "A team member is reviewing your case. You will be notified when complete.";
    case "escalation_required":
      return "Your case has been escalated for safety review.";
    case "evidence_requested":
      return "We need a bit more information to help you. Open your case to see what we need.";
    default:
      return `Your case has been updated — now: ${toState.replace(/_/g, " ")}.`;
  }
}
