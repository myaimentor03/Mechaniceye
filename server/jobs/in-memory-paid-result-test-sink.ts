import { createHash } from "node:crypto";
import type { PaidResultDeliveryTransport } from "./idempotent-paid-result-provider.js";

type TestSinkDelivery = Parameters<PaidResultDeliveryTransport["send"]>[0];

/**
 * Memory-only transport for isolated tests. It cannot deliver to real addresses,
 * performs no network calls, and models provider-side idempotency for one process.
 * It is not evidence of a real provider's durability or idempotency contract.
 */
export class InMemoryPaidResultTestSink implements PaidResultDeliveryTransport {
  readonly provider = "drivable_in_memory_test_sink";
  readonly capabilities = Object.freeze({ idempotencyEnforcedByProvider: true });
  private readonly accepted = new Map<string, Readonly<{
    fingerprint: string;
    providerReference: string;
    confirmedAt: string;
  }>>();
  private attempts = 0;

  constructor(private readonly options: Readonly<{ now?: () => Date }> = {}) {}

  get attemptCount(): number {
    return this.attempts;
  }

  get acceptedCount(): number {
    return this.accepted.size;
  }

  async send(input: TestSinkDelivery): Promise<Readonly<{ providerReference: string; confirmedAt: string }>> {
    this.attempts += 1;
    if (!isTestRecipient(input.recipient)
      || input.approvedResult.recipientEmail !== input.recipient
      || input.approvedResult.caseId !== input.caseId
      || input.approvedResult.versionId !== input.versionId
      || !safeKey(input.idempotencyKey)
      || !safeKey(input.approvalId)) {
      throw new TypeError("Isolated paid-result test sink rejected an unsafe delivery binding");
    }

    const fingerprint = createHash("sha256").update(canonicalJson({
      recipient: input.recipient,
      approvedResult: input.approvedResult,
      caseId: input.caseId,
      versionId: input.versionId,
      approvalId: input.approvalId,
    })).digest("hex");
    const previous = this.accepted.get(input.idempotencyKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new TypeError("Isolated paid-result test sink rejected idempotency-key content reuse");
      }
      return Object.freeze({ providerReference: previous.providerReference, confirmedAt: previous.confirmedAt });
    }

    const now = this.options.now?.() ?? new Date();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new TypeError("Isolated paid-result test sink requires a valid clock value");
    }
    const confirmation = Object.freeze({
      fingerprint,
      providerReference: `test_delivery_${createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 24)}`,
      confirmedAt: now.toISOString(),
    });
    this.accepted.set(input.idempotencyKey, confirmation);
    return Object.freeze({ providerReference: confirmation.providerReference, confirmedAt: confirmation.confirmedAt });
  }
}

function isTestRecipient(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.invalid$/i.test(value);
}

function safeKey(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
}

/** Sort object keys recursively while preserving array order, matching content identity semantics. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? "null" : canonicalJson(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Test sink content must be JSON serializable");
  return serialized;
}
