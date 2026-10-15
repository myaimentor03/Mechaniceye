import { getPool } from "../db.js";
import { PgLaunchControlExecutor } from "../review/postgres-adapter.js";
import { CommerceOrderService } from "./order-contract.js";
import { PostgresCommerceOrderRepository } from "./postgres-commerce-order-repository.js";
import { StripeTestPaymentAdapter } from "./stripe-test-payment-adapter.js";

export function getTestPaymentRuntime(env: NodeJS.ProcessEnv = process.env) {
  // This implementation cannot be enabled for production paid access.
  if (env.DRIVABLE_TEST_PAYMENTS_ENABLED !== "true" || env.NODE_ENV === "production") {
    throw new Error("Test payment gate is disabled");
  }
  const repository = new PostgresCommerceOrderRepository(new PgLaunchControlExecutor(getPool()));
  const adapter = new StripeTestPaymentAdapter(env.DRIVABLE_STRIPE_TEST_WEBHOOK_SECRET, reference => repository.getOrderIdForProvider(reference));
  if (!adapter.capabilities.configured) throw new Error("Test payment signing is unavailable");
  const executor = new PgLaunchControlExecutor(getPool());

  return { adapter, repository, service: new CommerceOrderService(repository), executor };
}

type PaymentReadinessRuntime = {
  repository: Pick<PostgresCommerceOrderRepository, "verifyStorage" | "hasVerifiedPayment">;
  executor: Pick<PgLaunchControlExecutor, "query">;
};
export async function verifyTestPaymentReadiness(runtimeFactory: () => PaymentReadinessRuntime = getTestPaymentRuntime) {
  try {
    const runtime = runtimeFactory();
    if (!await runtime.repository.verifyStorage()) return false;
    const records = await runtime.executor.query<{ order_id: string }>(
      `select o.order_id from drivable_commerce_orders o where o.snapshot->>'state'='verified'
       and o.snapshot->'provider'->>'adapterId'='stripe_test_v1'
       and exists(select 1 from drivable_commerce_order_events e where e.order_id=o.order_id and e.next_state='verified') limit 1`);
    for (const row of records.rows) {
      if (await runtime.repository.hasVerifiedPayment(row.order_id)) return true;
    }
  } catch { /* Missing configuration/schema/database/verified receipt stays closed. */ }
  return false;
}
