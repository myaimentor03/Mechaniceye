import { POSTGRES_PAYMENT_VALIDATION } from "../commerce/paid-release-coordinator.js";
import { PaidResultDeliveryConsumer, type PaidResultDeliveryConsumerResult, type PaidResultDeliveryProvider } from "./paid-result-delivery-consumer.js";
import { PostgresCommerceOrderRepository } from "../commerce/postgres-commerce-order-repository.js";
import { PaidFulfillmentEligibilityService } from "../commerce/paid-fulfillment-eligibility.js";
import { createJourneyPaidCasePersistenceRepository, DurablePaidDeliveryContextResolver } from "./paid-delivery-context.js";
import { createPgJourneyStore } from "../journey-store-pg.js";
import { PostgresReviewReleaseReader } from "../review/postgres-review-release-reader.js";
import { PostgresDeliveryOutboxRepository } from "./postgres-delivery-outbox.js";
import { PostgresDeliveryReceiptRepository } from "./postgres-delivery-receipt.js";
import { PostgresConsentRepository } from "../consent/postgres-consent-repository.js";

export type PaidDeliveryPostgresExecutor = {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
  transaction<T>(work: (executor: PaidDeliveryPostgresExecutor) => Promise<T>): Promise<T>;
};

export type PaidDeliveryWorker = Readonly<{
  enabled: true;
  /** One explicit case at a time; this module never starts a timer or background loop. */
  processCaseOnce(caseId: string): Promise<PaidResultDeliveryConsumerResult>;
}>;

export type PaidDeliveryWorkerComposition = Readonly<{
  enabled: boolean;
  reason?: "disabled_by_default" | "postgres_validation_required";
  worker?: PaidDeliveryWorker;
}>;

/** Opt-in composition gate. Production PostgreSQL validation remains false in this checkout. */
export function composePaidResultDeliveryWorker(
  createConsumer: () => PaidResultDeliveryConsumer,
  options: Readonly<{
    enabled?: string;
    postgresValidated?: boolean;
  }> = {},
): PaidDeliveryWorkerComposition {
  const enabled = options.enabled ?? process.env.DRIVABLE_PAID_RESULT_DELIVERY_ENABLED;
  const postgresValidated = options.postgresValidated ?? POSTGRES_PAYMENT_VALIDATION.verified;
  if (enabled !== "true") return Object.freeze({ enabled: false, reason: "disabled_by_default" });
  if (!postgresValidated) return Object.freeze({ enabled: false, reason: "postgres_validation_required" });
  const consumer = createConsumer();
  return Object.freeze({ enabled: true,
    worker: Object.freeze({ enabled: true as const, processCaseOnce: (caseId: string) => consumer.processNext(caseId) }) });
}

/** Canonical PostgreSQL composition. It remains inert unless both the environment flag
 * and the immutable local validation gate are open; this checkout's gate is closed. */
export function composePostgresPaidResultDeliveryWorker(
  executor: PaidDeliveryPostgresExecutor,
  provider: PaidResultDeliveryProvider,
  env: NodeJS.ProcessEnv = process.env,
): PaidDeliveryWorkerComposition {
  const enabled = env.DRIVABLE_PAID_RESULT_DELIVERY_ENABLED;
  if (enabled !== "true") return Object.freeze({ enabled: false, reason: "disabled_by_default" });
  if (!POSTGRES_PAYMENT_VALIDATION.verified) {
    return Object.freeze({ enabled: false, reason: "postgres_validation_required" });
  }

  const outbox = new PostgresDeliveryOutboxRepository(executor);
  const receipts = new PostgresDeliveryReceiptRepository(executor);
  const cases = createPgJourneyStore(executor);
  const orders = new PostgresCommerceOrderRepository(executor);
  const reviews = new PostgresReviewReleaseReader(executor);
  const consent = new PostgresConsentRepository(executor);
  const contexts = new DurablePaidDeliveryContextResolver({ orders, cases, reviews, consent, outbox }, env);
  const eligibility = new PaidFulfillmentEligibilityService({
    commerceOrders: orders,
    cases: createJourneyPaidCasePersistenceRepository(cases),
    reviews,
    deliveryOutbox: outbox,
  });
  const consumer = new PaidResultDeliveryConsumer(outbox, eligibility, contexts, provider, receipts);
  return Object.freeze({ enabled: true,
    worker: Object.freeze({ enabled: true as const, processCaseOnce: (caseId: string) => consumer.processNext(caseId) }) });
}
