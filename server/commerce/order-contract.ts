import { createHash, randomUUID } from "node:crypto";

export const COMMERCE_ORDER_SCHEMA_VERSION = 1 as const;
export const PAYMENT_PROVIDER_EVENT_SCHEMA_VERSION = 1 as const;

export type CommerceOrderState =
  | "pending"
  | "verified"
  | "failed"
  | "refund_required"
  | "refunded";

export type ProviderPaymentEventKind =
  | "payment_verified"
  | "payment_failed"
  | "refund_confirmed";

export type CommerceOfferSnapshot = Readonly<{
  offerId: string;
  offerVersion: string;
  label: string;
  amountMinor: number;
  currency: string;
}>;

export type CommerceProviderBinding = Readonly<{
  adapterId: string;
  provider: string;
  providerOrderReference: string;
}>;

export type CommerceOrder = Readonly<{
  schemaVersion: typeof COMMERCE_ORDER_SCHEMA_VERSION;
  orderId: string;
  caseId: string;
  offer: CommerceOfferSnapshot;
  state: CommerceOrderState;
  provider: CommerceProviderBinding | null;
  version: number;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
  refundReasonCode: string | null;
}>;

export type CommerceOrderRepositoryCapabilities = Readonly<{
  backendClass: "durable-repository" | "process-local-test-fake";
  durable: boolean;
  atomicCompareAndSwap: boolean;
  idempotentEvents: boolean;
  generatedIdentifiers: boolean;
}>;

export const PRODUCTION_COMMERCE_REPOSITORY_REQUIREMENTS = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  atomicCompareAndSwap: true,
  idempotentEvents: true,
  generatedIdentifiers: true,
} as const);

export type CommitCommerceEventInput = Readonly<{
  orderId: string;
  expectedVersion: number;
  eventId: string;
  eventFingerprint: string;
  nextState: CommerceOrderState;
  provider: CommerceProviderBinding | null;
  occurredAt: string;
  refundReasonCode: string | null;
}>;

export type CommitCommerceEventResult =
  | Readonly<{ status: "applied"; order: CommerceOrder }>
  | Readonly<{ status: "duplicate"; order: CommerceOrder }>
  | Readonly<{ status: "event_conflict"; order: CommerceOrder }>
  | Readonly<{ status: "version_conflict"; order: CommerceOrder }>
  | Readonly<{ status: "not_found" }>;

export interface CommerceOrderRepository {
  readonly capabilities: CommerceOrderRepositoryCapabilities;
  create(order: CommerceOrder): Promise<CommerceOrder>;
  get(orderId: string): Promise<CommerceOrder | null>;
  getEventFingerprint(orderId: string, eventId: string): Promise<string | null>;
  commitEvent(input: CommitCommerceEventInput): Promise<CommitCommerceEventResult>;
}

export type PaymentProviderAdapterCapabilities = Readonly<{
  configured: boolean;
  serverSideOnly: boolean;
  verifiesAuthenticity: boolean;
  bindsOrderIdFromAuthenticatedMetadata: boolean;
}>;

export interface PaymentProviderAdapter {
  readonly adapterId: string;
  readonly capabilities: PaymentProviderAdapterCapabilities;
  verifyAndNormalize(payload: unknown): Promise<unknown>;
}

type NormalizedProviderPaymentEvent = Readonly<{
  schemaVersion: typeof PAYMENT_PROVIDER_EVENT_SCHEMA_VERSION;
  eventId: string;
  provider: string;
  providerOrderReference: string;
  orderId: string;
  kind: ProviderPaymentEventKind;
  amountMinor: number;
  currency: string;
  occurredAt: string;
}>;

export type CommerceEventApplication = Readonly<{
  status: "applied" | "duplicate";
  order: CommerceOrder;
}>;

export class CommerceContractError extends Error {
  constructor(
    readonly code:
      | "invalid_order_input"
      | "invalid_provider_event"
      | "provider_unavailable"
      | "order_not_found"
      | "order_mismatch"
      | "amount_mismatch"
      | "currency_mismatch"
      | "provider_binding_mismatch"
      | "event_conflict"
      | "version_conflict"
      | "illegal_transition"
      | "durable_repository_required"
      | "persistence_failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CommerceContractError";
  }
}

export function assertDurableCommerceOrderRepository(
  repository: Pick<CommerceOrderRepository, "capabilities">,
): void {
  const capabilities = repository.capabilities;
  if (
    capabilities.backendClass !== "durable-repository"
    || !capabilities.durable
    || !capabilities.atomicCompareAndSwap
    || !capabilities.idempotentEvents
    || !capabilities.generatedIdentifiers
  ) {
    throw new CommerceContractError(
      "durable_repository_required",
      "Verified commerce state requires a durable, atomic, idempotent repository with server-generated identifiers",
    );
  }
}

export type CommerceOrderServiceOptions = Readonly<{
  now?: () => Date;
  generateOrderId?: () => string;
  generateEventId?: () => string;
}>;

export class CommerceOrderService {
  private readonly now: () => Date;
  private readonly generateOrderId: () => string;
  private readonly generateEventId: () => string;

  constructor(
    private readonly repository: CommerceOrderRepository,
    options: CommerceOrderServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateOrderId = options.generateOrderId ?? (() => `ord_${randomUUID()}`);
    this.generateEventId = options.generateEventId ?? (() => `evt_${randomUUID()}`);
  }

  async createPendingOrder(input: unknown): Promise<CommerceOrder> {
    const parsed = parseCreateOrderInput(input);
    const timestamp = this.timestamp();
    const order = freezeOrder({
      schemaVersion: COMMERCE_ORDER_SCHEMA_VERSION,
      orderId: requireIdentifier(this.generateOrderId(), "generated orderId"),
      caseId: parsed.caseId,
      offer: parsed.offer,
      state: "pending",
      provider: null,
      version: 1,
      eventCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      refundReasonCode: null,
    });

    let persisted: CommerceOrder;
    try {
      persisted = await this.repository.create(order);
    } catch (cause) {
      throw new CommerceContractError(
        "persistence_failed",
        "The pending order was not confirmed as persisted",
        { cause },
      );
    }

    if (!sameInitialOrder(persisted, order)) {
      throw new CommerceContractError(
        "persistence_failed",
        "The commerce repository returned an order that does not match the server snapshot",
      );
    }
    return freezeOrder(persisted);
  }

  async applyProviderPayload(
    adapter: PaymentProviderAdapter,
    payload: unknown,
  ): Promise<CommerceEventApplication> {
    assertUsableProviderAdapter(adapter);

    let untrustedEvent: unknown;
    try {
      untrustedEvent = await adapter.verifyAndNormalize(payload);
    } catch (cause) {
      throw new CommerceContractError(
        "invalid_provider_event",
        "The payment provider event could not be authenticated and normalized",
        { cause },
      );
    }
    const event = parseProviderPaymentEvent(untrustedEvent);

    if (event.kind === "payment_verified" || event.kind === "refund_confirmed") {
      assertDurableCommerceOrderRepository(this.repository);
    }

    const current = await this.loadOrder(event.orderId);
    const eventFingerprint = fingerprintProviderEvent(adapter.adapterId, event);
    const existingFingerprint = await this.loadEventFingerprint(current.orderId, event.eventId);
    if (existingFingerprint !== null) {
      if (existingFingerprint !== eventFingerprint) {
        throw new CommerceContractError(
          "event_conflict",
          "The provider event ID was already used for different content",
        );
      }
      return Object.freeze({ status: "duplicate", order: current });
    }

    assertProviderEventMatchesOrder(current, event, adapter.adapterId, this.timestamp());
    const nextState = nextProviderState(current.state, event.kind);
    const provider = Object.freeze({
      adapterId: requireIdentifier(adapter.adapterId, "adapterId"),
      provider: event.provider,
      providerOrderReference: event.providerOrderReference,
    });

    return this.commit({
      orderId: current.orderId,
      expectedVersion: current.version,
      eventId: event.eventId,
      eventFingerprint,
      nextState,
      provider,
      occurredAt: event.occurredAt,
      refundReasonCode: current.refundReasonCode,
    });
  }

  async markRefundRequired(input: unknown): Promise<CommerceOrder> {
    assertDurableCommerceOrderRepository(this.repository);
    const parsed = parseRefundRequiredInput(input);
    const current = await this.loadOrder(parsed.orderId);
    if (current.state !== "verified") {
      throw new CommerceContractError(
        "illegal_transition",
        `Cannot mark refund required from ${current.state}`,
      );
    }

    const occurredAt = latestTimestamp(this.timestamp(), current.updatedAt);
    const eventId = requireIdentifier(this.generateEventId(), "generated eventId");
    const result = await this.commit({
      orderId: current.orderId,
      expectedVersion: current.version,
      eventId,
      eventFingerprint: createHash("sha256")
        .update(JSON.stringify({ eventId, orderId: current.orderId, reasonCode: parsed.reasonCode }))
        .digest("hex"),
      nextState: "refund_required",
      provider: current.provider,
      occurredAt,
      refundReasonCode: parsed.reasonCode,
    });
    return result.order;
  }

  async getOrder(orderId: string): Promise<CommerceOrder | null> {
    const normalized = requireIdentifier(orderId, "orderId");
    try {
      const order = await this.repository.get(normalized);
      return order ? freezeOrder(order) : null;
    } catch (cause) {
      throw new CommerceContractError(
        "persistence_failed",
        "The order could not be loaded",
        { cause },
      );
    }
  }

  private async loadOrder(orderId: string): Promise<CommerceOrder> {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new CommerceContractError("order_not_found", "Commerce order not found");
    }
    return order;
  }

  private async loadEventFingerprint(orderId: string, eventId: string): Promise<string | null> {
    try {
      return await this.repository.getEventFingerprint(orderId, eventId);
    } catch (cause) {
      throw new CommerceContractError(
        "persistence_failed",
        "Provider event idempotency state could not be loaded",
        { cause },
      );
    }
  }

  private async commit(input: CommitCommerceEventInput): Promise<CommerceEventApplication> {
    let result: CommitCommerceEventResult;
    try {
      result = await this.repository.commitEvent(input);
    } catch (cause) {
      throw new CommerceContractError(
        "persistence_failed",
        "The commerce event was not confirmed as persisted",
        { cause },
      );
    }

    switch (result.status) {
      case "applied":
      case "duplicate":
        return Object.freeze({ status: result.status, order: freezeOrder(result.order) });
      case "event_conflict":
        throw new CommerceContractError(
          "event_conflict",
          "The provider event ID was already used for different content",
        );
      case "version_conflict":
        throw new CommerceContractError(
          "version_conflict",
          "The order changed while the provider event was being applied",
        );
      case "not_found":
        throw new CommerceContractError("order_not_found", "Commerce order not found");
    }
  }

  private timestamp(): string {
    const value = this.now();
    if (Number.isNaN(value.getTime())) {
      throw new CommerceContractError("invalid_order_input", "Server clock returned an invalid date");
    }
    return value.toISOString();
  }
}

function assertUsableProviderAdapter(adapter: PaymentProviderAdapter): void {
  requireIdentifier(adapter.adapterId, "adapterId");
  const capabilities = adapter.capabilities;
  if (
    !capabilities.configured
    || !capabilities.serverSideOnly
    || !capabilities.verifiesAuthenticity
    || !capabilities.bindsOrderIdFromAuthenticatedMetadata
  ) {
    throw new CommerceContractError(
      "provider_unavailable",
      "A configured server-side adapter with authenticity verification and authenticated order binding is required",
    );
  }
}

function parseCreateOrderInput(value: unknown): Readonly<{
  caseId: string;
  offer: CommerceOfferSnapshot;
}> {
  const record = requireExactRecord(value, ["caseId", "offer"], "order input");
  const offer = requireExactRecord(
    record.offer,
    ["offerId", "offerVersion", "label", "amountMinor", "currency"],
    "offer snapshot",
  );
  return Object.freeze({
    caseId: requireIdentifier(record.caseId, "caseId"),
    offer: Object.freeze({
      offerId: requireIdentifier(offer.offerId, "offerId"),
      offerVersion: requireIdentifier(offer.offerVersion, "offerVersion"),
      label: requireText(offer.label, "label", 160),
      amountMinor: requirePositiveMinorUnits(offer.amountMinor, "amountMinor"),
      currency: requireCurrency(offer.currency),
    }),
  });
}

function parseProviderPaymentEvent(value: unknown): NormalizedProviderPaymentEvent {
  const record = requireExactRecord(
    value,
    [
      "schemaVersion",
      "eventId",
      "provider",
      "providerOrderReference",
      "orderId",
      "kind",
      "amountMinor",
      "currency",
      "occurredAt",
    ],
    "provider event",
    "invalid_provider_event",
  );
  if (record.schemaVersion !== PAYMENT_PROVIDER_EVENT_SCHEMA_VERSION) {
    invalidProviderEvent("Unsupported provider event schemaVersion");
  }
  if (
    record.kind !== "payment_verified"
    && record.kind !== "payment_failed"
    && record.kind !== "refund_confirmed"
  ) {
    invalidProviderEvent("Unsupported provider event kind");
  }

  try {
    return Object.freeze({
      schemaVersion: PAYMENT_PROVIDER_EVENT_SCHEMA_VERSION,
      eventId: requireIdentifier(record.eventId, "eventId"),
      provider: requireIdentifier(record.provider, "provider"),
      providerOrderReference: requireIdentifier(
        record.providerOrderReference,
        "providerOrderReference",
      ),
      orderId: requireIdentifier(record.orderId, "orderId"),
      kind: record.kind,
      amountMinor: requirePositiveMinorUnits(record.amountMinor, "amountMinor"),
      currency: requireCurrency(record.currency),
      occurredAt: requireIsoDateTime(record.occurredAt, "occurredAt"),
    });
  } catch (cause) {
    if (cause instanceof CommerceContractError && cause.code === "invalid_provider_event") throw cause;
    throw new CommerceContractError(
      "invalid_provider_event",
      cause instanceof Error ? cause.message : "Invalid provider event",
      { cause },
    );
  }
}

function parseRefundRequiredInput(value: unknown): Readonly<{
  orderId: string;
  reasonCode: string;
}> {
  const record = requireExactRecord(value, ["orderId", "reasonCode"], "refund request");
  const reasonCode = requireText(record.reasonCode, "reasonCode", 80);
  if (!/^[a-z][a-z0-9_]*$/.test(reasonCode)) {
    throw new CommerceContractError(
      "invalid_order_input",
      "reasonCode must be a lower-case allowlisted-style code",
    );
  }
  return Object.freeze({
    orderId: requireIdentifier(record.orderId, "orderId"),
    reasonCode,
  });
}

function assertProviderEventMatchesOrder(
  order: CommerceOrder,
  event: NormalizedProviderPaymentEvent,
  adapterId: string,
  evaluatedAt: string,
): void {
  if (event.orderId !== order.orderId) {
    throw new CommerceContractError("order_mismatch", "Provider event order does not match");
  }
  if (event.amountMinor !== order.offer.amountMinor) {
    throw new CommerceContractError("amount_mismatch", "Provider event amount does not match order");
  }
  if (event.currency !== order.offer.currency) {
    throw new CommerceContractError("currency_mismatch", "Provider event currency does not match order");
  }
  if (Date.parse(event.occurredAt) < Date.parse(order.updatedAt)) {
    throw new CommerceContractError(
      "invalid_provider_event",
      "Provider event occurred before the order's current state",
    );
  }
  if (Date.parse(event.occurredAt) > Date.parse(evaluatedAt) + 5 * 60 * 1000) {
    throw new CommerceContractError(
      "invalid_provider_event",
      "Provider event occurred too far in the future",
    );
  }
  if (
    order.provider
    && (
      order.provider.adapterId !== adapterId
      || order.provider.provider !== event.provider
      || order.provider.providerOrderReference !== event.providerOrderReference
    )
  ) {
    throw new CommerceContractError(
      "provider_binding_mismatch",
      "Provider event does not match the order provider binding",
    );
  }
}

function nextProviderState(
  current: CommerceOrderState,
  kind: ProviderPaymentEventKind,
): CommerceOrderState {
  if (current === "pending" && kind === "payment_verified") return "verified";
  if (current === "pending" && kind === "payment_failed") return "failed";
  if (
    (current === "verified" || current === "refund_required")
    && kind === "refund_confirmed"
  ) {
    return "refunded";
  }
  throw new CommerceContractError(
    "illegal_transition",
    `Cannot apply ${kind} to an order in ${current}`,
  );
}

function fingerprintProviderEvent(
  adapterId: string,
  event: NormalizedProviderPaymentEvent,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ adapterId, ...event }))
    .digest("hex");
}

function sameInitialOrder(left: CommerceOrder, right: CommerceOrder): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.orderId === right.orderId
    && left.caseId === right.caseId
    && left.offer.offerId === right.offer.offerId
    && left.offer.offerVersion === right.offer.offerVersion
    && left.offer.label === right.offer.label
    && left.offer.amountMinor === right.offer.amountMinor
    && left.offer.currency === right.offer.currency
    && left.state === "pending"
    && left.provider === null
    && left.version === 1
    && left.eventCount === 0
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.refundReasonCode === null;
}

export function freezeOrder(order: CommerceOrder): CommerceOrder {
  return Object.freeze({
    ...order,
    offer: Object.freeze({ ...order.offer }),
    provider: order.provider ? Object.freeze({ ...order.provider }) : null,
  });
}

function requireExactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  field: string,
  code: "invalid_order_input" | "invalid_provider_event" = "invalid_order_input",
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CommerceContractError(code, `${field} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  const missing = allowedKeys.filter((key) => !(key in record));
  if (unexpected.length || missing.length) {
    throw new CommerceContractError(
      code,
      `${field} has invalid fields${unexpected.length ? `; unexpected: ${unexpected.join(", ")}` : ""}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`,
    );
  }
  return record;
}

function requireIdentifier(value: unknown, field: string): string {
  const text = requireText(value, field, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) {
    throw new CommerceContractError("invalid_order_input", `${field} has invalid characters`);
  }
  return text;
}

function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new CommerceContractError("invalid_order_input", `${field} is invalid`);
  }
  return value;
}

function requirePositiveMinorUnits(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new CommerceContractError(
      "invalid_order_input",
      `${field} must be a positive safe integer in minor units`,
    );
  }
  return value as number;
}

function requireCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw new CommerceContractError("invalid_order_input", "currency must be an uppercase ISO-style code");
  }
  return value;
}

function requireIsoDateTime(value: unknown, field: string): string {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !isStrictIsoDateTime(value)
  ) {
    throw new CommerceContractError("invalid_provider_event", `${field} must be an ISO date-time`);
  }
  return value;
}

function isStrictIsoDateTime(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return false;

  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return true;
}

function latestTimestamp(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function invalidProviderEvent(message: string): never {
  throw new CommerceContractError("invalid_provider_event", message);
}
