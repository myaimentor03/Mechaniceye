import { randomUUID } from "node:crypto";
import type {
  PaidDeliveryReceipt,
  PaidDeliveryReceiptRepository,
  PaidDeliveryReceiptRepositoryCapabilities,
} from "./paid-result-delivery-consumer.js";

export type DeliveryReceiptSqlExecutor = {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
};

type StoredReceipt = {
  receipt_id: unknown;
  job_id: unknown;
  case_id: unknown;
  resource_version: unknown;
  destination_key: unknown;
  provider: unknown;
  provider_reference: unknown;
  accepted_at: unknown;
  created_at: unknown;
};

export class DeliveryReceiptRepositoryError extends Error {
  constructor(readonly code: "invalid_input" | "idempotency_conflict" | "storage_unavailable" | "corrupt_record") {
    super("Delivery receipt storage failed");
    this.name = "DeliveryReceiptRepositoryError";
  }
}

export const POSTGRES_DELIVERY_RECEIPT_CAPABILITIES: PaidDeliveryReceiptRepositoryCapabilities = Object.freeze({
  backendClass: "durable-repository",
  durable: true,
  idempotentByJob: true,
});

export class PostgresDeliveryReceiptRepository implements PaidDeliveryReceiptRepository {
  readonly capabilities = POSTGRES_DELIVERY_RECEIPT_CAPABILITIES;

  constructor(private readonly executor: DeliveryReceiptSqlExecutor) {}

  async record(input: Omit<PaidDeliveryReceipt, "receiptId" | "createdAt">): Promise<PaidDeliveryReceipt> {
    validateInput(input);
    const receiptId = `receipt_${randomUUID()}`;
    try {
      const inserted = await this.executor.query<StoredReceipt>(
        `insert into drivable_delivery_receipts
          (receipt_id, job_id, case_id, resource_version, destination_key, provider, provider_reference, accepted_at, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,now())
         on conflict (job_id) do nothing returning *`,
        [receiptId, input.jobId, input.caseId, input.resourceVersion, input.destinationKey,
          input.provider, input.providerReference, input.acceptedAt],
      );
      if (inserted.rows[0]) return mapReceipt(inserted.rows[0]);

      const existing = await this.executor.query<StoredReceipt>(
        "select * from drivable_delivery_receipts where job_id=$1 limit 1",
        [input.jobId],
      );
      if (!existing.rows[0]) throw new DeliveryReceiptRepositoryError("storage_unavailable");
      const receipt = mapReceipt(existing.rows[0]);
      if (!sameReceipt(receipt, input)) throw new DeliveryReceiptRepositoryError("idempotency_conflict");
      return receipt;
    } catch (error) {
      if (error instanceof DeliveryReceiptRepositoryError) throw error;
      throw new DeliveryReceiptRepositoryError("storage_unavailable");
    }
  }

  async getByJobId(jobId: string): Promise<PaidDeliveryReceipt | null> {
    if (!opaque(jobId)) throw new DeliveryReceiptRepositoryError("invalid_input");
    try {
      const result = await this.executor.query<StoredReceipt>(
        "select * from drivable_delivery_receipts where job_id=$1 limit 1",
        [jobId],
      );
      return result.rows[0] ? mapReceipt(result.rows[0]) : null;
    } catch (error) {
      if (error instanceof DeliveryReceiptRepositoryError) throw error;
      throw new DeliveryReceiptRepositoryError("storage_unavailable");
    }
  }
}

function validateInput(input: Omit<PaidDeliveryReceipt, "receiptId" | "createdAt">): void {
  if (![input.jobId, input.caseId, input.resourceVersion, input.destinationKey, input.provider, input.providerReference].every(opaque)
    || !strictIso(input.acceptedAt)) {
    throw new DeliveryReceiptRepositoryError("invalid_input");
  }
}

function mapReceipt(row: StoredReceipt): PaidDeliveryReceipt {
  const receipt: PaidDeliveryReceipt = Object.freeze({
    receiptId: stringValue(row.receipt_id),
    jobId: stringValue(row.job_id),
    caseId: stringValue(row.case_id),
    resourceVersion: stringValue(row.resource_version),
    destinationKey: stringValue(row.destination_key),
    provider: stringValue(row.provider),
    providerReference: stringValue(row.provider_reference),
    acceptedAt: timestamp(row.accepted_at),
    createdAt: timestamp(row.created_at),
  });
  if (![receipt.receiptId, receipt.jobId, receipt.caseId, receipt.resourceVersion, receipt.destinationKey,
    receipt.provider, receipt.providerReference].every(opaque)) {
    throw new DeliveryReceiptRepositoryError("corrupt_record");
  }
  return receipt;
}

function sameReceipt(receipt: PaidDeliveryReceipt, input: Omit<PaidDeliveryReceipt, "receiptId" | "createdAt">): boolean {
  return receipt.jobId === input.jobId && receipt.caseId === input.caseId
    && receipt.resourceVersion === input.resourceVersion && receipt.destinationKey === input.destinationKey
    && receipt.provider === input.provider && receipt.providerReference === input.providerReference
    && receipt.acceptedAt === input.acceptedAt;
}

function opaque(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
}

function strictIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new DeliveryReceiptRepositoryError("corrupt_record");
  return value;
}

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new DeliveryReceiptRepositoryError("corrupt_record");
  return date.toISOString();
}
