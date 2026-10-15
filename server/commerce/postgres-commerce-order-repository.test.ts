import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import Stripe from "stripe";
import { PgLaunchControlExecutor } from "../review/postgres-adapter.js";
import { CommerceOrderService, type CommitCommerceEventInput } from "./order-contract.js";
import { PostgresCommerceOrderRepository } from "./postgres-commerce-order-repository.js";
import { StripeTestPaymentAdapter } from "./stripe-test-payment-adapter.js";
import { mutationTargetGuard, verifyConnectedDatabaseTarget } from "../../scripts/lib/db-target-safe.mjs";

const candidateTestUrl = process.env.DRIVABLE_ALLOW_COMMERCE_TEST_SCHEMA_SETUP === "true"
  ? process.env.DRIVABLE_COMMERCE_TEST_DATABASE_URL : undefined;
const testUrl = candidateTestUrl && mutationTargetGuard(candidateTestUrl).ok ? candidateTestUrl : undefined;
// Explicitly opted-in, independently fingerprinted test target only; never fall back to DATABASE_URL.
test("Postgres: signed payment survives pool/service restart, duplicates and conflicts are atomic", {
  skip: !testUrl ? "Explicit disposable Postgres URL and schema-setup opt-in are unavailable" : false,
}, async () => {
  const schema = `commerce_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: testUrl });
  let pool: pg.Pool | undefined;
  try {
    await verifyConnectedDatabaseTarget(admin);
    await admin.query(`create schema ${schema}`);
    const open = () => new pg.Pool({ connectionString: testUrl, options: `-c search_path=${schema}` });
    pool = open();
    await verifyConnectedDatabaseTarget(pool);
    await pool.query(await readFile(new URL("../../migrations/0004_drivable_delivery_outbox.sql", import.meta.url), "utf8"));
    await pool.query(await readFile(new URL("../../migrations/0008_drivable_delivery_outbox_runtime.sql", import.meta.url), "utf8"));
    await pool.query(await readFile(new URL("../../migrations/0007_drivable_commerce_orders.sql", import.meta.url), "utf8"));
    let repository = new PostgresCommerceOrderRepository(new PgLaunchControlExecutor(pool));
    assert.equal(await repository.verifyStorage(), true);
    let service = new CommerceOrderService(repository, { now: () => new Date(Date.now() - 2000) });
    const order = await service.createPendingOrder({ caseId: "case_test", offer: {
      offerId: "buyer_check", offerVersion: "v1", label: "Buyer Check", amountMinor: 4900, currency: "USD" } });
    assert.equal(await repository.hasVerifiedPayment(order.orderId), false);
    service = new CommerceOrderService(repository);
    const secret = "whsec_repository_test_only_secret";
    const stripe = new Stripe("sk_test_local_only");
    const rawBody = Buffer.from(JSON.stringify({ id: "evt_restart", type: "payment_intent.succeeded", livemode: false,
      created: Math.floor(Date.now()/1000), data: { object: { object: "payment_intent", id: "pi_restart", livemode: false,
        status: "succeeded", amount: 4900, amount_received: 4900, currency: "usd", metadata: { drivableOrderId: order.orderId } } } }));
    const payload = { rawBody, signature: stripe.webhooks.generateTestHeaderString({ payload: rawBody.toString(), secret }) };
    const adapter = new StripeTestPaymentAdapter(secret, reference => repository.getOrderIdForProvider(reference));
    const concurrent = await Promise.all([service.applyProviderPayload(adapter, payload), service.applyProviderPayload(adapter, payload)]);
    assert.deepEqual(concurrent.map(result => result.status).sort(), ["applied", "duplicate"]);
    await pool.end(); pool = open();
    repository = new PostgresCommerceOrderRepository(new PgLaunchControlExecutor(pool));
    service = new CommerceOrderService(repository);
    assert.equal((await service.getOrder(order.orderId))?.state, "verified");
    assert.equal(await repository.hasVerifiedPayment(order.orderId), true);
    const duplicates = await Promise.all(Array.from({ length: 4 }, () => service.applyProviderPayload(adapter, payload)));
    assert.ok(duplicates.every(result => result.status === "duplicate"));
    assert.equal((await repository.get(order.orderId))?.eventCount, 1);
    assert.equal((await pool.query("select count(*)::integer as count from drivable_delivery_outbox")).rows[0].count, 1);
    assert.equal(typeof (await repository.get(order.orderId))?.createdAt, "string");
    const current = (await repository.get(order.orderId))!;
    const input: CommitCommerceEventInput = { orderId: order.orderId, expectedVersion: current.version,
      eventId: "evt_restart", eventFingerprint: "a".repeat(64), nextState: "refunded", provider: current.provider,
      occurredAt: new Date().toISOString(), refundReasonCode: null };
    const other = await service.createPendingOrder({ caseId: "case_other", offer: order.offer });
    assert.equal((await repository.commitEvent({ ...input, orderId: other.orderId,
      expectedVersion: 1, nextState: "verified" })).status, "event_conflict");
    // A second event cannot reuse the already-paid provider reference on another order.
    const replayObject = JSON.parse(rawBody.toString());
    replayObject.id = "evt_reference_replay";
    replayObject.data.object.metadata.drivableOrderId = other.orderId;
    const replayRaw = Buffer.from(JSON.stringify(replayObject));
    await assert.rejects(service.applyProviderPayload(adapter, { rawBody: replayRaw,
      signature: stripe.webhooks.generateTestHeaderString({ payload: replayRaw.toString(), secret }) }),
      (error: any) => error.code === "persistence_failed");
    assert.equal(await repository.getEventFingerprint(other.orderId, "evt_reference_replay"), null);
    assert.equal((await repository.get(other.orderId))?.state, "pending");
    assert.equal((await repository.commitEvent(input)).status, "event_conflict");
    assert.equal((await repository.commitEvent({ ...input, eventId: "evt_stale", expectedVersion: 1 })).status, "version_conflict");
    // Fail after event INSERT: the transaction must roll back its event row too.
    await pool.query(`create function reject_test_update() returns trigger language plpgsql as $$
      begin raise exception 'test update failure'; end $$`);
    await pool.query(`create trigger reject_test_update before update on drivable_commerce_orders
      for each row execute function reject_test_update()`);
    await assert.rejects(service.markRefundRequired({ orderId: order.orderId, reasonCode: "rollback_probe" }));
    await pool.query("drop trigger reject_test_update on drivable_commerce_orders");
    assert.equal((await pool.query("select count(*)::integer as count from drivable_commerce_order_events")).rows[0].count, 1);
    assert.equal((await repository.get(order.orderId))?.state, "verified");
    await service.markRefundRequired({ orderId: order.orderId, reasonCode: "test_refund" });
    assert.equal(await repository.hasVerifiedPayment(order.orderId), false);
    const refundRaw = Buffer.from(JSON.stringify({ id: "evt_full_refund",type: "charge.refunded",livemode:false,
      created: Math.floor(Date.now()/1000),data:{object:{object:"charge",id:"ch_test",livemode:false,status:"succeeded",
        paid:true,amount:4900,amount_refunded:4900,refunded:true,payment_intent:"pi_restart",currency:"usd",metadata:{}}} }));
    await service.applyProviderPayload(adapter, { rawBody: refundRaw,
      signature: stripe.webhooks.generateTestHeaderString({payload:refundRaw.toString(),secret}) });
    assert.equal((await repository.get(order.orderId))?.state,"refunded");
  } finally {
    await pool?.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});

test("repository cannot create pre-verified orders", async () => {
  const executor = { async query() { throw new Error("must not query"); },
    async transaction() { throw new Error("must not transact"); } };
  const repository = new PostgresCommerceOrderRepository(executor);
  await assert.rejects(repository.create({ state: "verified" } as never), /Only server-created pending/);
});
