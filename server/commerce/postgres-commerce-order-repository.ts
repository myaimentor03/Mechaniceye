import {
  type CommerceOrder,
  type CommerceOrderRepository,
  type CommerceOrderRepositoryCapabilities,
  type CommitCommerceEventInput,
  type CommitCommerceEventResult,
  freezeOrder,
} from "./order-contract.js";

export type CommerceSqlExecutor = {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
  withConnection?<T>(work: (executor: CommerceSqlExecutor) => Promise<T>): Promise<T>;
};

type StoredOrderRow = {
  order_id: string;
  case_id: string;
  offer_id: string;
  offer_version: string;
  offer_label: string;
  offer_amount_minor: number;
  offer_currency: string;
  state: string;
  provider_adapter_id: string | null;
  provider_name: string | null;
  provider_order_reference: string | null;
  version: number;
  event_count: number;
  refund_reason_code: string | null;
  created_at: string;
  updated_at: string;
};

type StoredEventRow = {
  event_id: string;
  event_fingerprint: string;
};

export class CommerceRepositoryError extends Error {
  constructor(
    readonly code: "conflict" | "storage_unavailable" | "corrupt_record" | "not_found" | "version_conflict" | "event_conflict",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "CommerceRepositoryError";
  }
}

export const POSTGRES_COMMERCE_CAPABILITIES: CommerceOrderRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  atomicCompareAndSwap: true,
  idempotentEvents: true,
  generatedIdentifiers: true,
});

export class PostgresCommerceOrderRepository implements CommerceOrderRepository {
  readonly capabilities = POSTGRES_COMMERCE_CAPABILITIES;

  constructor(private readonly executor: CommerceSqlExecutor) {}

  async create(order: CommerceOrder): Promise<CommerceOrder> {
    const frozen = freezeOrder(order);
    try {
      await this.executor.query(
        `insert into drivable_commerce_orders
           (order_id, case_id, offer_id, offer_version, offer_label, offer_amount_minor, offer_currency,
            state, provider_adapter_id, provider_name, provider_order_reference,
            version, event_count, refund_reason_code, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz, $16::timestamptz)`,
        [
          frozen.orderId,
          frozen.caseId,
          frozen.offer.offerId,
          frozen.offer.offerVersion,
          frozen.offer.label,
          frozen.offer.amountMinor,
          frozen.offer.currency,
          frozen.state,
          frozen.provider?.adapterId ?? null,
          frozen.provider?.provider ?? null,
          frozen.provider?.providerOrderReference ?? null,
          frozen.version,
          frozen.eventCount,
          frozen.refundReasonCode,
          frozen.createdAt,
          frozen.updatedAt,
        ],
      );
      return frozen;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new CommerceRepositoryError("conflict", "Order already exists");
      }
      throw new CommerceRepositoryError("storage_unavailable", "Order could not be persisted", true);
    }
  }

  async get(orderId: string): Promise<CommerceOrder | null> {
    let rows: StoredOrderRow[];
    try {
      const result = await this.executor.query<StoredOrderRow>(
        `select order_id, case_id, offer_id, offer_version, offer_label, offer_amount_minor, offer_currency,
                state, provider_adapter_id, provider_name, provider_order_reference,
                version, event_count, refund_reason_code, created_at, updated_at
           from drivable_commerce_orders
          where order_id = $1`,
        [orderId],
      );
      rows = result.rows;
    } catch {
      throw new CommerceRepositoryError("storage_unavailable", "Order could not be loaded", true);
    }

    if (rows.length === 0) return null;
    return this.mapRowToOrder(rows[0]);
  }

  async getEventFingerprint(orderId: string, eventId: string): Promise<string | null> {
    let rows: StoredEventRow[];
    try {
      const result = await this.executor.query<StoredEventRow>(
        `select event_fingerprint
           from drivable_commerce_order_events
          where order_id = $1 and event_id = $2`,
        [orderId, eventId],
      );
      rows = result.rows;
    } catch {
      throw new CommerceRepositoryError("storage_unavailable", "Event fingerprint could not be loaded", true);
    }

    return rows[0]?.event_fingerprint ?? null;
  }

  async commitEvent(input: CommitCommerceEventInput): Promise<CommitCommerceEventResult> {
    if (this.executor.withConnection) {
      return this.executor.withConnection((executor) => this.commitEventWithExecutor(executor, input));
    }
    return this.commitEventWithExecutor(this.executor, input);
  }

  private async commitEventWithExecutor(
    executor: CommerceSqlExecutor,
    input: CommitCommerceEventInput,
  ): Promise<CommitCommerceEventResult> {
    try {
      await executor.query("begin");

      const currentResult = await executor.query<StoredOrderRow>(
        `select order_id, case_id, offer_id, offer_version, offer_label, offer_amount_minor, offer_currency,
                state, provider_adapter_id, provider_name, provider_order_reference,
                version, event_count, refund_reason_code, created_at, updated_at
           from drivable_commerce_orders
          where order_id = $1
          for update`,
        [input.orderId],
      );

      if (currentResult.rows.length === 0) {
        await executor.query("rollback");
        return Object.freeze({ status: "not_found" });
      }

      const current = this.mapRowToOrder(currentResult.rows[0]);

      const fingerprintResult = await executor.query<StoredEventRow>(
        `select event_fingerprint from drivable_commerce_order_events where order_id = $1 and event_id = $2`,
        [input.orderId, input.eventId],
      );
      const existingFingerprint = fingerprintResult.rows[0]?.event_fingerprint ?? null;
      if (existingFingerprint !== null) {
        await executor.query("rollback");
        return Object.freeze({
          status: existingFingerprint === input.eventFingerprint ? "duplicate" : "event_conflict",
          order: freezeOrder(current),
        });
      }

      if (current.version !== input.expectedVersion) {
        await executor.query("rollback");
        return Object.freeze({ status: "version_conflict", order: freezeOrder(current) });
      }

      const provider = input.provider
        ? Object.freeze({
            adapterId: input.provider.adapterId,
            provider: input.provider.provider,
            providerOrderReference: input.provider.providerOrderReference,
          })
        : null;

      const updated = freezeOrder({
        ...current,
        state: input.nextState,
        provider,
        version: current.version + 1,
        eventCount: current.eventCount + 1,
        updatedAt: input.occurredAt,
        refundReasonCode: input.refundReasonCode,
      });

      await executor.query(
        `update drivable_commerce_orders
            set state = $1,
                provider_adapter_id = $2,
                provider_name = $3,
                provider_order_reference = $4,
                version = $5,
                event_count = $6,
                refund_reason_code = $7,
                updated_at = $8::timestamptz
          where order_id = $9`,
        [
          updated.state,
          updated.provider?.adapterId ?? null,
          updated.provider?.provider ?? null,
          updated.provider?.providerOrderReference ?? null,
          updated.version,
          updated.eventCount,
          updated.refundReasonCode,
          updated.updatedAt,
          input.orderId,
        ],
      );

      await executor.query(
        `insert into drivable_commerce_order_events (order_id, event_id, event_fingerprint, occurred_at)
         values ($1, $2, $3, $4::timestamptz)`,
        [input.orderId, input.eventId, input.eventFingerprint, input.occurredAt],
      );

      await executor.query("commit");
      return Object.freeze({ status: "applied", order: updated });
    } catch (error) {
      try {
        await executor.query("rollback");
      } catch {
        // Ignore rollback errors
      }
      if (error instanceof CommerceRepositoryError) throw error;
      throw new CommerceRepositoryError("storage_unavailable", "Event could not be committed", true);
    }
  }

  private mapRowToOrder(row: StoredOrderRow): CommerceOrder {
    try {
      const validStates = new Set(["pending", "verified", "failed", "refund_required", "refunded"]);
      if (!validStates.has(row.state)) {
        throw new Error(`Invalid state: ${row.state}`);
      }
      if (!Number.isSafeInteger(row.version) || row.version <= 0) {
        throw new Error(`Invalid version: ${row.version}`);
      }
      if (!Number.isSafeInteger(row.event_count) || row.event_count < 0) {
        throw new Error(`Invalid event_count: ${row.event_count}`);
      }
      if (!/^[A-Z]{3}$/.test(row.offer_currency)) {
        throw new Error(`Invalid currency: ${row.offer_currency}`);
      }
      if (!Number.isSafeInteger(row.offer_amount_minor) || row.offer_amount_minor <= 0) {
        throw new Error(`Invalid amountMinor: ${row.offer_amount_minor}`);
      }
      return freezeOrder({
        schemaVersion: 1,
        orderId: row.order_id,
        caseId: row.case_id,
        offer: Object.freeze({
          offerId: row.offer_id,
          offerVersion: row.offer_version,
          label: row.offer_label,
          amountMinor: row.offer_amount_minor,
          currency: row.offer_currency,
        }),
        state: row.state as CommerceOrder["state"],
        provider: row.provider_adapter_id && row.provider_name && row.provider_order_reference
          ? Object.freeze({
              adapterId: row.provider_adapter_id,
              provider: row.provider_name,
              providerOrderReference: row.provider_order_reference,
            })
          : null,
        version: row.version,
        eventCount: row.event_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        refundReasonCode: row.refund_reason_code,
      });
    } catch {
      throw new CommerceRepositoryError("corrupt_record", "Stored order failed validation");
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return error !== null && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505";
  }
}
