import type { DeliveryOutboxRepository } from "../jobs/delivery-outbox.js";
import { HumanReviewReleaseGate } from "../review/release-gate.js";
import type {
  RecipientIdentityBinding,
  ReleaseDenialCode,
  ReviewRepository,
} from "../review/types.js";
import { isValidRecipientBinding } from "../review/validation.js";
import type {
  CommerceOfferSnapshot,
  CommerceOrder,
  CommerceOrderRepository,
} from "./order-contract.js";

export type PaidCasePersistenceRecord = Readonly<{
  caseId: string;
  persistenceVersion: string;
  evidenceVersion: string;
  state: "persisted";
  persistedAt: string;
}>;

export type PaidCasePersistenceRepositoryCapabilities = Readonly<{
  backendClass: "durable-repository" | "process-local-test-fake";
  durable: boolean;
  caseBound: boolean;
  versionedPersistence: boolean;
}>;

export interface PaidCasePersistenceRepository {
  readonly capabilities: PaidCasePersistenceRepositoryCapabilities;
  getPersistence(caseId: string): Promise<PaidCasePersistenceRecord | null>;
}

export const PRODUCTION_PAID_CASE_REPOSITORY_REQUIREMENTS = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  caseBound: true,
  versionedPersistence: true,
} as const);

export type PaidFulfillmentEligibilityInput = Readonly<{
  orderId: string;
  caseId: string;
  casePersistenceVersion: string;
  versionId: string;
  policyVersion: string;
  modelVersion: string;
  evidenceVersion: string;
  recipient: RecipientIdentityBinding;
}>;

export type PaidFulfillmentDenialCode =
  | "invalid_request"
  | "commerce_repository_not_durable"
  | "order_not_found"
  | "wrong_case"
  | "payment_not_verified"
  | "case_repository_not_durable"
  | "case_not_found"
  | "case_persistence_mismatch"
  | "review_repository_not_durable"
  | "review_denied"
  | "delivery_outbox_not_durable"
  | "dependency_unavailable";

export type PaidFulfillmentEligibilityDecision =
  | Readonly<{
    allowed: true;
    code: "paid_fulfillment_allowed";
    orderId: string;
    caseId: string;
    casePersistenceVersion: string;
    versionId: string;
    approvalId: string;
    offer: CommerceOfferSnapshot;
    recipient: RecipientIdentityBinding;
    evaluatedAt: string;
  }>
  | Readonly<{
    allowed: false;
    code: PaidFulfillmentDenialCode;
    evaluatedAt: string;
    reviewCode?: ReleaseDenialCode;
  }>;

type CommerceOrderLookup = Pick<CommerceOrderRepository, "capabilities" | "get">;
type DeliveryOutboxCapability = Pick<DeliveryOutboxRepository, "capabilities">;

export type PaidFulfillmentEligibilityDependencies = Readonly<{
  commerceOrders: CommerceOrderLookup;
  cases: PaidCasePersistenceRepository;
  reviews: ReviewRepository;
  deliveryOutbox: DeliveryOutboxCapability;
}>;

export type PaidFulfillmentEligibilityOptions = Readonly<{
  now?: () => Date;
}>;

/**
 * Fail-closed composition boundary for paid delivery.
 *
 * A verified payment is necessary but never sufficient. This decision must be
 * evaluated immediately before a durable delivery job is enqueued.
 */
export class PaidFulfillmentEligibilityService {
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: PaidFulfillmentEligibilityDependencies,
    options: PaidFulfillmentEligibilityOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async decide(input: unknown): Promise<PaidFulfillmentEligibilityDecision> {
    const evaluatedAt = this.timestamp();
    let request: PaidFulfillmentEligibilityInput;
    try {
      request = parseEligibilityInput(input);
    } catch {
      return deny("invalid_request", evaluatedAt);
    }

    if (!isDurableCommerceRepository(this.dependencies.commerceOrders)) {
      return deny("commerce_repository_not_durable", evaluatedAt);
    }

    let order: CommerceOrder | null;
    try {
      order = await this.dependencies.commerceOrders.get(request.orderId);
    } catch {
      return deny("dependency_unavailable", evaluatedAt);
    }
    if (!order) return deny("order_not_found", evaluatedAt);
    if (!isValidOrderRecord(order, request.orderId)) {
      return deny("dependency_unavailable", evaluatedAt);
    }
    if (order.caseId !== request.caseId) return deny("wrong_case", evaluatedAt);
    if (order.state !== "verified" || order.provider === null) {
      return deny("payment_not_verified", evaluatedAt);
    }

    if (!isDurableCaseRepository(this.dependencies.cases)) {
      return deny("case_repository_not_durable", evaluatedAt);
    }

    let persistedCase: PaidCasePersistenceRecord | null;
    try {
      persistedCase = await this.dependencies.cases.getPersistence(request.caseId);
    } catch {
      return deny("dependency_unavailable", evaluatedAt);
    }
    if (!persistedCase) return deny("case_not_found", evaluatedAt);
    if (!isValidCasePersistenceRecord(persistedCase)) {
      return deny("dependency_unavailable", evaluatedAt);
    }
    if (
      persistedCase.caseId !== request.caseId
      || persistedCase.persistenceVersion !== request.casePersistenceVersion
      || persistedCase.evidenceVersion !== request.evidenceVersion
    ) {
      return deny("case_persistence_mismatch", evaluatedAt);
    }

    if (!isDurableReviewRepository(this.dependencies.reviews)) {
      return deny("review_repository_not_durable", evaluatedAt);
    }

    let releaseDecision;
    try {
      releaseDecision = new HumanReviewReleaseGate(this.dependencies.reviews, {
        now: () => new Date(evaluatedAt),
      }).decide({
        versionId: request.versionId,
        caseId: request.caseId,
        policyVersion: request.policyVersion,
        modelVersion: request.modelVersion,
        evidenceVersion: request.evidenceVersion,
        recipient: request.recipient,
      });
    } catch {
      return deny("dependency_unavailable", evaluatedAt);
    }
    if (!releaseDecision.allowed) {
      return Object.freeze({
        allowed: false,
        code: "review_denied",
        reviewCode: releaseDecision.code,
        evaluatedAt,
      });
    }

    if (!isDurableDeliveryOutbox(this.dependencies.deliveryOutbox)) {
      return deny("delivery_outbox_not_durable", evaluatedAt);
    }

    return Object.freeze({
      allowed: true,
      code: "paid_fulfillment_allowed",
      orderId: order.orderId,
      caseId: order.caseId,
      casePersistenceVersion: persistedCase.persistenceVersion,
      versionId: releaseDecision.versionId,
      approvalId: releaseDecision.approvalId,
      offer: Object.freeze({ ...order.offer }),
      recipient: Object.freeze({ ...request.recipient }),
      evaluatedAt,
    });
  }

  private timestamp(): string {
    const value = this.now();
    return Number.isNaN(value.getTime()) ? new Date(0).toISOString() : value.toISOString();
  }
}

function deny(
  code: PaidFulfillmentDenialCode,
  evaluatedAt: string,
): PaidFulfillmentEligibilityDecision {
  return Object.freeze({ allowed: false, code, evaluatedAt });
}

function parseEligibilityInput(value: unknown): PaidFulfillmentEligibilityInput {
  const record = exactRecord(value, [
    "orderId",
    "caseId",
    "casePersistenceVersion",
    "versionId",
    "policyVersion",
    "modelVersion",
    "evidenceVersion",
    "recipient",
  ]);
  const recipientRecord = exactRecord(record.recipient, [
    "algorithm",
    "digest",
    "bindingVersion",
  ]);
  const recipient: RecipientIdentityBinding = Object.freeze({
    algorithm: recipientRecord.algorithm as "sha256",
    digest: recipientRecord.digest as string,
    bindingVersion: recipientRecord.bindingVersion as string,
  });
  if (!isValidRecipientBinding(recipient)) throw new TypeError("Invalid recipient binding");

  return Object.freeze({
    orderId: token(record.orderId),
    caseId: token(record.caseId),
    casePersistenceVersion: token(record.casePersistenceVersion),
    versionId: token(record.versionId),
    policyVersion: token(record.policyVersion),
    modelVersion: token(record.modelVersion),
    evidenceVersion: token(record.evidenceVersion),
    recipient,
  });
}

function exactRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(fields);
  if (
    Object.keys(record).some((key) => !allowed.has(key))
    || fields.some((key) => !Object.prototype.hasOwnProperty.call(record, key))
  ) {
    throw new TypeError("Unexpected or missing field");
  }
  return record;
}

function token(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) {
    throw new TypeError("Invalid identifier or version token");
  }
  return value;
}

function isDurableCommerceRepository(repository: CommerceOrderLookup): boolean {
  const value = repository.capabilities;
  return value.backendClass === "durable-repository"
    && value.durable
    && value.atomicCompareAndSwap
    && value.idempotentEvents
    && value.generatedIdentifiers;
}

function isDurableCaseRepository(repository: PaidCasePersistenceRepository): boolean {
  const value = repository.capabilities;
  return value.backendClass === "durable-repository"
    && value.durable
    && value.caseBound
    && value.versionedPersistence;
}

function isDurableReviewRepository(repository: ReviewRepository): boolean {
  const value = repository.capabilities;
  return value.backendClass === "durable-repository"
    && value.durable
    && value.appendOnlyAudit
    && value.caseBoundTransitions
    && value.generatedIdentifiers;
}

function isDurableDeliveryOutbox(outbox: DeliveryOutboxCapability): boolean {
  const value = outbox.capabilities;
  return value.backendClass === "durable-repository"
    && value.durable
    && value.horizontallyScalable
    && value.atomicLeasing
    && value.fencedAcknowledgement
    && value.idempotentEnqueue;
}

function isValidOrderRecord(order: CommerceOrder, requestedOrderId: string): boolean {
  const validState = ["pending", "verified", "failed", "refund_required", "refunded"]
    .includes(order.state);
  const validProvider = order.provider === null
    ? order.state === "pending"
    : tokenOrFalse(order.provider.adapterId)
      && tokenOrFalse(order.provider.provider)
      && tokenOrFalse(order.provider.providerOrderReference);

  return order.orderId === requestedOrderId
    && tokenOrFalse(order.caseId)
    && tokenOrFalse(order.offer.offerId)
    && tokenOrFalse(order.offer.offerVersion)
    && typeof order.offer.label === "string"
    && order.offer.label.trim().length > 0
    && order.offer.amountMinor > 0
    && Number.isSafeInteger(order.offer.amountMinor)
    && /^[A-Z]{3}$/.test(order.offer.currency)
    && validState
    && validProvider
    && Number.isSafeInteger(order.version)
    && order.version > 0
    && Number.isSafeInteger(order.eventCount)
    && order.eventCount >= 0
    && isStrictIsoDateTime(order.createdAt)
    && isStrictIsoDateTime(order.updatedAt)
    && Date.parse(order.updatedAt) >= Date.parse(order.createdAt);
}

function isValidCasePersistenceRecord(record: PaidCasePersistenceRecord): boolean {
  return record.state === "persisted"
    && tokenOrFalse(record.caseId)
    && tokenOrFalse(record.persistenceVersion)
    && tokenOrFalse(record.evidenceVersion)
    && isStrictIsoDateTime(record.persistedAt);
}

function tokenOrFalse(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
}

function isStrictIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
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
