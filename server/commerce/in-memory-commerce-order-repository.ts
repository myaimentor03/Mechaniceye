import {
  freezeOrder,
  type CommerceOrder,
  type CommerceOrderRepository,
  type CommitCommerceEventInput,
  type CommitCommerceEventResult,
} from "./order-contract.js";

export const IN_MEMORY_COMMERCE_REPOSITORY_CAPABILITIES = Object.freeze({
  backendClass: "process-local-test-fake" as const,
  durable: false,
  atomicCompareAndSwap: true,
  idempotentEvents: true,
  generatedIdentifiers: true,
});

/** Process-local contract fake. It is intentionally ineligible for verified production state. */
export class InMemoryCommerceOrderRepository implements CommerceOrderRepository {
  readonly capabilities = IN_MEMORY_COMMERCE_REPOSITORY_CAPABILITIES;
  private readonly orders = new Map<string, CommerceOrder>();
  private readonly eventFingerprints = new Map<string, Map<string, string>>();

  constructor(
    private readonly failures: Readonly<{
      create?: boolean;
      get?: boolean;
      commit?: boolean;
    }> = {},
  ) {}

  async create(order: CommerceOrder): Promise<CommerceOrder> {
    if (this.failures.create) throw new Error("simulated create failure");
    if (this.orders.has(order.orderId)) throw new Error("duplicate orderId");
    const stored = freezeOrder(order);
    this.orders.set(stored.orderId, stored);
    this.eventFingerprints.set(stored.orderId, new Map());
    return freezeOrder(stored);
  }

  async get(orderId: string): Promise<CommerceOrder | null> {
    if (this.failures.get) throw new Error("simulated read failure");
    const order = this.orders.get(orderId);
    return order ? freezeOrder(order) : null;
  }

  async getEventFingerprint(orderId: string, eventId: string): Promise<string | null> {
    if (this.failures.get) throw new Error("simulated read failure");
    return this.eventFingerprints.get(orderId)?.get(eventId) ?? null;
  }

  async commitEvent(input: CommitCommerceEventInput): Promise<CommitCommerceEventResult> {
    if (this.failures.commit) throw new Error("simulated commit failure");
    const current = this.orders.get(input.orderId);
    if (!current) return Object.freeze({ status: "not_found" });

    const fingerprints = this.eventFingerprints.get(input.orderId)!;
    const existingFingerprint = fingerprints.get(input.eventId);
    if (existingFingerprint !== undefined) {
      return Object.freeze({
        status: existingFingerprint === input.eventFingerprint ? "duplicate" : "event_conflict",
        order: freezeOrder(current),
      });
    }
    if (current.version !== input.expectedVersion) {
      return Object.freeze({ status: "version_conflict", order: freezeOrder(current) });
    }

    const updated = freezeOrder({
      ...current,
      state: input.nextState,
      provider: input.provider,
      version: current.version + 1,
      eventCount: current.eventCount + 1,
      updatedAt: input.occurredAt,
      refundReasonCode: input.refundReasonCode,
    });
    fingerprints.set(input.eventId, input.eventFingerprint);
    this.orders.set(input.orderId, updated);
    return Object.freeze({ status: "applied", order: freezeOrder(updated) });
  }
}
