import type { ReviewTransaction, ReviewTransactionExecutor } from "../review/postgres-review-writer.js";
import { PostgresDeliveryOutboxRepository } from "../jobs/postgres-delivery-outbox.js";
import { freezeOrder, fingerprintProviderEvent, nextProviderState, PRODUCTION_COMMERCE_REPOSITORY_REQUIREMENTS,
  type CommerceOrder, type CommerceOrderRepository, type CommitCommerceEventInput,
  type CommitCommerceEventResult } from "./order-contract.js";

type Executor = ReviewTransaction & ReviewTransactionExecutor;
export const PAYMENT_RETRY_POLICY = Object.freeze({ maxAttempts: 5, initialRetryDelayMs: 1000,
  backoffMultiplier: 2, maxRetryDelayMs: 30000, leaseDurationMs: 60000 });
export function transactionOutbox(tx: ReviewTransaction) {
  return new PostgresDeliveryOutboxRepository({ query: tx.query.bind(tx), transaction: work => work(tx) });
}

function sameProviderBinding(
  left: NonNullable<CommerceOrder["provider"]>,
  right: NonNullable<CommerceOrder["provider"]>,
): boolean {
  return left.adapterId === right.adapterId
    && left.provider === right.provider
    && left.providerOrderReference === right.providerOrderReference;
}

/** Canonical v2 snapshot schema; a single checked-out Postgres transaction is mandatory. */
export class PostgresCommerceOrderRepository implements CommerceOrderRepository {
  readonly capabilities = PRODUCTION_COMMERCE_REPOSITORY_REQUIREMENTS;
  constructor(private readonly executor: Executor) {}
  async create(order: CommerceOrder): Promise<CommerceOrder> {
    if (order.state !== "pending" || order.provider !== null || order.version !== 1 || order.eventCount !== 0) {
      throw new Error("Only server-created pending orders can be inserted");
    }
    const result = await this.executor.query<{ snapshot: CommerceOrder }>(
      `insert into drivable_commerce_orders(order_id,case_id,snapshot,version)
       values($1,$2,$3::jsonb,$4) returning snapshot`,
      [order.orderId, order.caseId, JSON.stringify(order), order.version]);
    return freezeOrder(result.rows[0].snapshot);
  }
  async get(orderId: string): Promise<CommerceOrder | null> {
    const result = await this.executor.query<{ snapshot: CommerceOrder }>(
      "select snapshot from drivable_commerce_orders where order_id=$1", [orderId]);
    return result.rows[0] ? freezeOrder(result.rows[0].snapshot) : null;
  }
  async getOrderIdForProvider(reference: string): Promise<string | null> {
    const result = await this.executor.query<{ order_id: string }>(
      "select order_id from drivable_commerce_orders where provider_reference=$1", [`stripe_test:${reference}`]);
    return result.rows[0]?.order_id ?? null;
  }
  async bindCheckout(orderId: string, sessionId: string): Promise<void> {
    if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid test Checkout session");
    const result = await this.executor.query(
      `update drivable_commerce_orders set checkout_session_id=$2 where order_id=$1
       and snapshot->>'state' in ('pending','failed')
       and (checkout_session_id is null or checkout_session_id=$2) returning order_id`, [orderId, sessionId]);
    if (!result.rows.length) throw new Error("Checkout binding changed or order is no longer payable");
  }
  async getEventFingerprint(orderId: string, eventId: string): Promise<string | null> {
    const result = await this.executor.query<{ fingerprint: string }>(
      "select fingerprint from drivable_commerce_order_events where order_id=$1 and event_id=$2", [orderId, eventId]);
    return result.rows[0]?.fingerprint ?? null;
  }
  async hasVerifiedPayment(orderId: string): Promise<boolean> {
    const result = await this.executor.query(
      `select o.order_id from drivable_commerce_orders o where o.order_id=$1 and o.contract_version=2
       and o.snapshot->>'state'='verified' and coalesce((o.snapshot->>'refundedAmountMinor')::bigint,0)=0
       and o.snapshot->'provider'->>'adapterId'='stripe_test_v1' and o.snapshot->'provider'->>'provider'='stripe_test'
       and exists(select 1 from drivable_commerce_order_events e where e.order_id=o.order_id
         and e.event_kind='payment_verified' and e.provider_reference=o.provider_reference
         and e.proof->>'orderId'=o.order_id and e.proof->>'kind'='payment_verified'
         and (e.proof->>'amountMinor')::bigint=(o.snapshot->'offer'->>'amountMinor')::bigint
         and e.proof->>'currency'=o.snapshot->'offer'->>'currency')`, [orderId]);
    return result.rows.length === 1;
  }
  async commitEvent(input: CommitCommerceEventInput): Promise<CommitCommerceEventResult> {
    return this.executor.transaction(async (tx) => {
      const rows = await tx.query<{ snapshot: CommerceOrder }>(
        "select snapshot from drivable_commerce_orders where order_id=$1 for update", [input.orderId]);
      if (!rows.rows[0]) return { status: "not_found" };
      const current = rows.rows[0].snapshot;
      const existing = await tx.query<{ order_id: string; fingerprint: string }>(
        "select order_id,fingerprint from drivable_commerce_order_events where event_id=$1", [input.eventId]);
      if (existing.rows[0]) return { status: existing.rows[0].order_id === input.orderId
        && existing.rows[0].fingerprint === input.eventFingerprint ? "duplicate" : "event_conflict", order: freezeOrder(current) };
      if (current.version !== input.expectedVersion) return { status: "version_conflict", order: freezeOrder(current) };
      if (input.eventKind && input.nextState !== nextProviderState(current.state, input.eventKind)) throw new Error("Illegal transition");
      if (!input.eventKind && (current.state !== "verified" || input.nextState !== "refund_required")) throw new Error("Illegal refund request");
      const proof = input.proof;
      if (input.eventKind && (!proof || !input.provider || proof.eventId !== input.eventId
        || proof.orderId !== current.orderId || proof.amountMinor !== current.offer.amountMinor
        || proof.currency !== current.offer.currency || proof.kind !== input.eventKind
        || proof.provider !== input.provider.provider || proof.providerOrderReference !== input.provider.providerOrderReference
        || fingerprintProviderEvent(input.provider.adapterId, proof) !== input.eventFingerprint)) throw new Error("Payment proof mismatch");
      if (!input.eventKind && input.nextState !== "refund_required") throw new Error("Provider proof required");
      if (!input.provider || (current.provider && !sameProviderBinding(current.provider, input.provider))) throw new Error("Provider binding mismatch");
      const updated = freezeOrder({ ...current, state: input.nextState, provider: input.provider,
        version: current.version + 1, eventCount: current.eventCount + 1,
        updatedAt: input.occurredAt, refundReasonCode: input.refundReasonCode,
        refundedAmountMinor: Math.max(current.refundedAmountMinor ?? 0, input.refundedAmountMinor ?? 0) });
      const reference = `${input.provider.provider}:${input.provider.providerOrderReference}`;
      const inserted = await tx.query(
        `insert into drivable_commerce_order_events(event_id,order_id,fingerprint,next_state,occurred_at,event_kind,provider_reference,provider_occurred_at,proof)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) on conflict(event_id) do nothing returning event_id`,
        [input.eventId,input.orderId,input.eventFingerprint,input.nextState,input.occurredAt,
          input.eventKind ?? "refund_requested",reference,input.providerOccurredAt ?? input.occurredAt,JSON.stringify(proof ?? {})]);
      if (!inserted.rows.length) return { status: "event_conflict", order: freezeOrder(current) };
      await tx.query(`update drivable_commerce_orders set snapshot=$2::jsonb,version=$3,provider_reference=$4 where order_id=$1`,
        [input.orderId,JSON.stringify(updated),updated.version,reference]);
      if (input.eventKind === "payment_verified" && updated.state === "verified") {
        // This job asks for reconciliation. It is never permission to deliver/release a result.
        await transactionOutbox(tx).enqueue({ caseId: current.caseId, deduplicationKey: `payment:${current.orderId}`,
          metadata: { resourceKind: "case", resourceId: current.caseId, resourceVersion: "payment-v1",
            destinationKey: "payment-reconcile", channel: "internal_queue" }, retryPolicy: PAYMENT_RETRY_POLICY });
      }
      if (["refunded","partial_refund","refund_required"].includes(updated.state)) {
        // Invalidate outstanding releases atomically with the payment revocation.
        await tx.query(`update drivable_delivery_outbox set state='dead_letter',dead_lettered_at=now(),updated_at=now(),
          last_failure_code='payment_revoked',last_failure_retryable=false,lease_token=null,lease_owner=null
          where case_id=$1 and deduplication_key like $2 and state in ('pending','failed','leased')`,
          [current.caseId,`release:${current.orderId}:%`]);
      }
      return { status: "applied", order: updated };
    });
  }
  async verifyStorage(): Promise<boolean> {
    await this.executor.query("select order_id,snapshot,version,provider_reference,checkout_session_id,contract_version from drivable_commerce_orders limit 0");
    await this.executor.query("select event_id,order_id,fingerprint,next_state,occurred_at,event_kind,provider_reference,provider_occurred_at,proof from drivable_commerce_order_events limit 0");
    await this.executor.query("select last_replayed_at,lease_token from drivable_delivery_outbox limit 0");
    const result = await this.executor.query<{ name: string }>(
      `select c.relname as name from pg_index i join pg_class c on c.oid=i.indexrelid
       join pg_namespace n on n.oid=c.relnamespace where n.nspname=current_schema()
       and i.indisunique and i.indisvalid and c.relname = any($1::text[])`,
      [["drivable_commerce_orders_pkey", "drivable_commerce_order_events_pkey", "drivable_commerce_orders_provider_unique", "drivable_delivery_outbox_case_dedup_unique"]]);
    return result.rows.length === 4;
  }
}
