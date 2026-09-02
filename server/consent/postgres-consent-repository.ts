import {
  appendConsentEvent,
  createConsentAcceptedEvent,
  createConsentRevokedEvent,
  type ConsentEventV1,
  type ConsentSubject,
} from "../../shared/consent/index.js";

export type ConsentQueryResult<Row = Record<string, unknown>> = { rows: Row[] };
export interface ConsentSqlExecutor {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<ConsentQueryResult<Row>>;
}

type StoredConsentRow = {
  event_payload: unknown;
};

export class ConsentRepositoryError extends Error {
  constructor(
    readonly code: "conflict" | "storage_unavailable" | "corrupt_record",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ConsentRepositoryError";
  }
}

export const POSTGRES_CONSENT_CAPABILITIES = Object.freeze({
  backendClass: "durable-repository" as const,
  durable: true,
  appendOnlyAudit: true,
  caseBoundReads: true,
});

export class PostgresConsentRepository {
  readonly capabilities = POSTGRES_CONSENT_CAPABILITIES;

  constructor(private readonly executor: ConsentSqlExecutor) {}

  async append(event: ConsentEventV1): Promise<ConsentEventV1> {
    const validated = validateStoredEvent(event);
    const occurredAt = validated.kind === "consent.accepted" ? validated.acceptedAt : validated.revokedAt;
    try {
      await this.executor.query(
        `insert into drivable_consent_events
          (event_id, event_kind, schema_version, actor_id, account_id, case_id,
           acceptance_event_id, occurred_at, event_payload)
         values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::jsonb)`,
        [
          validated.eventId,
          validated.kind,
          validated.schemaVersion,
          validated.actorId,
          validated.accountId,
          validated.caseId,
          validated.kind === "consent.revoked" ? validated.acceptanceEventId : null,
          occurredAt,
          JSON.stringify(validated),
        ],
      );
      return validated;
    } catch (error) {
      if (postgresCode(error) === "23505") {
        throw new ConsentRepositoryError("conflict", "Consent event already exists");
      }
      if (["23503", "23514"].includes(postgresCode(error) ?? "")) {
        throw new ConsentRepositoryError("conflict", "Consent event violates its acceptance history");
      }
      throw new ConsentRepositoryError("storage_unavailable", "Consent event could not be persisted", true);
    }
  }

  async listForSubject(subject: ConsentSubject): Promise<readonly ConsentEventV1[]> {
    requireSubject(subject);
    let rows: StoredConsentRow[];
    try {
      const result = await this.executor.query<StoredConsentRow>(
        `select event_payload
           from drivable_consent_events
          where actor_id = $1 and account_id = $2 and case_id = $3
          order by occurred_at asc, created_at asc, event_id asc`,
        [subject.actorId, subject.accountId, subject.caseId],
      );
      rows = result.rows;
    } catch {
      throw new ConsentRepositoryError("storage_unavailable", "Consent events could not be loaded", true);
    }

    try {
      let events: readonly ConsentEventV1[] = Object.freeze([]);
      for (const row of rows) events = appendConsentEvent(events, validateStoredEvent(row.event_payload));
      return events;
    } catch {
      throw new ConsentRepositoryError("corrupt_record", "Stored consent history failed validation");
    }
  }
}

function validateStoredEvent(value: unknown): ConsentEventV1 {
  if (!value || typeof value !== "object") throw new TypeError("Consent event must be an object");
  const event = value as ConsentEventV1;
  if (event.kind === "consent.accepted") return createConsentAcceptedEvent(event);
  if (event.kind === "consent.revoked") return createConsentRevokedEvent(event);
  throw new TypeError("Unknown consent event kind");
}

function requireSubject(subject: ConsentSubject): void {
  for (const [field, value] of Object.entries(subject)) {
    if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${field} is required`);
  }
}

function postgresCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}
