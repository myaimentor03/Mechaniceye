import type { JourneyCase } from "./journey-state-machine";

type QueryResult = { rows: Record<string, unknown>[] };

interface SqlExecutor {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
}

/**
 * PostgreSQL-backed journey case store.
 * Same exported interface as the in-memory journey-store, but each case is a
 * durable row.  Falls back to the in-memory store when the database is not
 * configured or the table does not exist.
 */

function rowToCase(row: Record<string, unknown>): JourneyCase {
  return {
    id: String(row.id),
    state: String(row.state) as JourneyCase["state"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    vehicleInfo: String(row.vehicle_info),
    description: String(row.description),
    timing: row.timing != null ? String(row.timing) : undefined,
    urgency: row.urgency != null ? String(row.urgency) : undefined,
    canDrive: row.can_drive != null ? String(row.can_drive) : undefined,
    customerId: row.customer_id != null ? String(row.customer_id) : undefined,
    customerEmail: row.customer_email != null ? String(row.customer_email) : undefined,
    evidence: Array.isArray(row.evidence) ? (row.evidence as any[]) : [],
    safetyFlags: Array.isArray(row.safety_flags) ? (row.safety_flags as any[]) : [],
    safetyTriggered: Boolean(row.safety_triggered),
    confidenceScore: Number(row.confidence_score) || 0,
    confidenceLevel: String(row.confidence_level) as JourneyCase["confidenceLevel"],
    riskLevel: String(row.risk_level) as JourneyCase["riskLevel"],
    outcome: row.outcome != null ? (String(row.outcome) as JourneyCase["outcome"]) : undefined,
    decisionPath: row.decision_path != null ? (String(row.decision_path) as any) : undefined,
    resolutionNote: row.resolution_note != null ? String(row.resolution_note) : undefined,
    humanReviewRequested: Boolean(row.human_review_requested),
    escalationReason: row.escalation_reason != null ? String(row.escalation_reason) : undefined,
    nextAction: row.next_action != null ? String(row.next_action) : undefined,
    nextActionPrompt: row.next_action_prompt != null ? String(row.next_action_prompt) : undefined,
    matchedSymptomCategories: Array.isArray(row.matched_symptom_categories)
      ? (row.matched_symptom_categories as any[])
      : [],
    plannedEvidence: Array.isArray(row.planned_evidence)
      ? (row.planned_evidence as any[])
      : [],
    currentEvidencePrompt: row.current_evidence_prompt != null
      ? String(row.current_evidence_prompt)
      : undefined,
    nextServiceDestination: row.next_service_destination != null && typeof row.next_service_destination === "object"
      ? (row.next_service_destination as any)
      : undefined,
  };
}

function caseToRow(c: JourneyCase): Record<string, unknown> {
  return {
    id: c.id,
    state: c.state,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    vehicle_info: c.vehicleInfo,
    description: c.description,
    timing: c.timing ?? null,
    urgency: c.urgency ?? null,
    can_drive: c.canDrive ?? null,
    customer_id: c.customerId ?? null,
    customer_email: c.customerEmail ?? null,
    evidence: c.evidence,
    safety_flags: c.safetyFlags,
    safety_triggered: c.safetyTriggered,
    confidence_score: c.confidenceScore,
    confidence_level: c.confidenceLevel,
    risk_level: c.riskLevel,
    outcome: c.outcome ?? null,
    decision_path: c.decisionPath ?? null,
    resolution_note: c.resolutionNote ?? null,
    human_review_requested: c.humanReviewRequested,
    escalation_reason: c.escalationReason ?? null,
    next_action: c.nextAction ?? null,
    next_action_prompt: c.nextActionPrompt ?? null,
    matched_symptom_categories: c.matchedSymptomCategories,
    planned_evidence: c.plannedEvidence,
    current_evidence_prompt: c.currentEvidencePrompt ?? null,
    next_service_destination: c.nextServiceDestination ?? null,
  };
}

const UPSERT = `
  insert into journey_cases (
    id, state, created_at, updated_at, vehicle_info, description,
    timing, urgency, can_drive, customer_id, customer_email,
    evidence, safety_flags, safety_triggered, confidence_score,
    confidence_level, risk_level, outcome, decision_path,
    resolution_note, human_review_requested, escalation_reason,
    next_action, next_action_prompt, matched_symptom_categories,
    planned_evidence, current_evidence_prompt, next_service_destination
  ) values (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12::jsonb, $13::jsonb, $14, $15,
    $16, $17, $18, $19,
    $20, $21, $22,
    $23, $24, $25::jsonb,
    $26::jsonb, $27, $28::jsonb
  )
  on conflict (id) do update set
    state = excluded.state,
    updated_at = excluded.updated_at,
    vehicle_info = excluded.vehicle_info,
    description = excluded.description,
    timing = excluded.timing,
    urgency = excluded.urgency,
    can_drive = excluded.can_drive,
    customer_id = excluded.customer_id,
    customer_email = excluded.customer_email,
    evidence = excluded.evidence,
    safety_flags = excluded.safety_flags,
    safety_triggered = excluded.safety_triggered,
    confidence_score = excluded.confidence_score,
    confidence_level = excluded.confidence_level,
    risk_level = excluded.risk_level,
    outcome = excluded.outcome,
    decision_path = excluded.decision_path,
    resolution_note = excluded.resolution_note,
    human_review_requested = excluded.human_review_requested,
    escalation_reason = excluded.escalation_reason,
    next_action = excluded.next_action,
    next_action_prompt = excluded.next_action_prompt,
    matched_symptom_categories = excluded.matched_symptom_categories,
    planned_evidence = excluded.planned_evidence,
    current_evidence_prompt = excluded.current_evidence_prompt,
    next_service_destination = excluded.next_service_destination
`;

function buildUpsertParams(c: JourneyCase): unknown[] {
  const row = caseToRow(c);
  return [
    row.id, row.state, row.created_at, row.updated_at, row.vehicle_info, row.description,
    row.timing, row.urgency, row.can_drive, row.customer_id, row.customer_email,
    JSON.stringify(row.evidence), JSON.stringify(row.safety_flags), row.safety_triggered, row.confidence_score,
    row.confidence_level, row.risk_level, row.outcome, row.decision_path,
    row.resolution_note, row.human_review_requested, row.escalation_reason,
    row.next_action, row.next_action_prompt, JSON.stringify(row.matched_symptom_categories),
    JSON.stringify(row.planned_evidence), row.current_evidence_prompt,
    JSON.stringify(row.next_service_destination),
  ];
}

// ── Table-readiness probe (cached after first successful probe) ───────────
let tableReady: boolean | null = null;

async function ensureTable(executor: SqlExecutor): Promise<boolean> {
  if (tableReady === true) return true;
  if (tableReady === false) return false;
  try {
    const result = await executor.query(
      "select 1 from information_schema.tables where table_name = 'journey_cases' limit 1"
    );
    tableReady = result.rows.length > 0;
    return tableReady;
  } catch {
    tableReady = false;
    return false;
  }
}

/**
 * Create a PostgreSQL-backed journey store bound to the given executor.
 * If the journey_cases table does not exist the store silently degrades —
 * every write is a no-op and every read returns undefined/[].
 */
export function createPgJourneyStore(executor: SqlExecutor) {
  return {
    async get(caseId: string): Promise<JourneyCase | undefined> {
      if (!(await ensureTable(executor))) return undefined;
      try {
        const result = await executor.query(
          "select * from journey_cases where id = $1 limit 1",
          [caseId]
        );
        if (result.rows.length === 0) return undefined;
        return rowToCase(result.rows[0]);
      } catch {
        return undefined;
      }
    },

    async set(caseData: JourneyCase): Promise<void> {
      if (!(await ensureTable(executor))) return;
      try {
        await executor.query(UPSERT, buildUpsertParams(caseData));
      } catch {
        // best-effort; in-memory remains authoritative for the process
      }
    },

    async listByCustomer(customerId: string): Promise<JourneyCase[]> {
      if (!(await ensureTable(executor))) return [];
      try {
        const result = await executor.query(
          "select * from journey_cases where customer_id = $1 order by created_at desc",
          [customerId]
        );
        return result.rows.map(rowToCase);
      } catch {
        return [];
      }
    },

    async listAll(): Promise<JourneyCase[]> {
      if (!(await ensureTable(executor))) return [];
      try {
        const result = await executor.query(
          "select * from journey_cases order by created_at desc"
        );
        return result.rows.map(rowToCase);
      } catch {
        return [];
      }
    },

    async size(): Promise<number> {
      if (!(await ensureTable(executor))) return 0;
      try {
        const result = await executor.query("select count(*)::int as cnt from journey_cases");
        return Number(result.rows[0]?.cnt ?? 0);
      } catch {
        return 0;
      }
    },
  };
}

export type PgJourneyStore = ReturnType<typeof createPgJourneyStore>;
