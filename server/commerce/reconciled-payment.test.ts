import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { readFile } from "node:fs/promises";
import { CommerceOrderService } from "./order-contract.js";
import { PostgresCommerceOrderRepository } from "./postgres-commerce-order-repository.js";
import { StripeTestPaymentAdapter, createStripeTestCheckout } from "./stripe-test-payment-adapter.js";
import { PaidReleaseCoordinator } from "./paid-release-coordinator.js";
import { getLaunchOffer } from "./commerce-offers.js";
import type { ReviewTransaction } from "../review/postgres-review-writer.js";

const secret = "whsec_reconciled_test_signing_only";
const sdk = new Stripe("sk_test_local_only");
function signed(type: string, object: any, id: string, created = Math.floor(Date.now()/1000)) {
  const rawBody = Buffer.from(JSON.stringify({ id, type, created, livemode: false, data: { object } }));
  return { rawBody, signature: sdk.webhooks.generateTestHeaderString({ payload: rawBody.toString(), secret }) };
}
function payment(orderId: string, status = "succeeded", reference = "pi_reconciled") {
  return { object: "payment_intent", id: reference, livemode: false, status, amount: 4900,
    amount_received: status === "succeeded" ? 4900 : 0, currency: "usd", metadata: { drivableOrderId: orderId } };
}

/** Transactional SQL fixture, not proof of real Postgres durability. */
class SqlFixture {
  orders = new Map<string, any>(); events = new Map<string, any>(); jobs = new Map<string, any>();
  failOutbox = false; commits = 0; rollbacks = 0;
  async transaction<T>(work: (tx: ReviewTransaction) => Promise<T>) {
    const prior = structuredClone({ orders: this.orders, events: this.events, jobs: this.jobs });
    try { const result = await work(this); this.commits++; return result; }
    catch (error) { Object.assign(this, prior); this.rollbacks++; throw error; }
  }
  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<{ rows: Row[] }> {
    const sql = text.toLowerCase().replace(/\s+/g," ").trim(), v = values as any[];
    let rows: any[] = [];
    if (sql.startsWith("insert into drivable_commerce_orders")) {
      if (this.orders.has(v[0])) throw new Error("unique order");
      const snapshot = JSON.parse(v[2]); this.orders.set(v[0], snapshot); rows = [{ snapshot }];
    } else if (sql.startsWith("select snapshot")) {
      const snapshot = this.orders.get(v[0]); rows = snapshot ? [{ snapshot: structuredClone(snapshot) }] : [];
    } else if (sql.startsWith("select order_id,fingerprint")) {
      const e = this.events.get(v[0]); rows = e ? [{ order_id: e.orderId, fingerprint: e.fingerprint }] : [];
    } else if (sql.startsWith("select fingerprint")) {
      const e = this.events.get(v[1]); rows = e?.orderId === v[0] ? [{ fingerprint: e.fingerprint }] : [];
    } else if (sql.startsWith("insert into drivable_commerce_order_events")) {
      if (!this.events.has(v[0])) { this.events.set(v[0], { orderId: v[1], fingerprint: v[2], kind: v[5], reference: v[6], proof: JSON.parse(v[8]) }); rows=[{event_id:v[0]}]; }
    } else if (sql.startsWith("update drivable_commerce_orders set snapshot")) {
      for (const [id, order] of this.orders) if (id !== v[0] && order.provider
        && `${order.provider.provider}:${order.provider.providerOrderReference}` === v[3]) throw new Error("unique provider reference");
      this.orders.set(v[0], JSON.parse(v[1]));
    } else if (sql.startsWith("select o.order_id")) {
      const order = this.orders.get(v[0]);
      if (order?.state === "verified" && !order.refundedAmountMinor && [...this.events.values()].some(e => e.orderId===v[0] && e.kind==="payment_verified")) rows=[{order_id:v[0]}];
    } else if (sql.startsWith("select order_id from drivable_commerce_orders where provider_reference")) {
      for (const [id, o] of this.orders) if (o.provider && `${o.provider.provider}:${o.provider.providerOrderReference}` === v[0]) rows=[{order_id:id}];
    } else if (sql.startsWith("insert into drivable_delivery_outbox")) {
      if (this.failOutbox) throw new Error("outbox unavailable");
      const key = `${v[1]}:${v[2]}`;
      if (!this.jobs.has(key)) { const row = { job_id:v[0],case_id:v[1],deduplication_key:v[2],channel:v[3],resource_kind:v[4],resource_id:v[5],resource_version:v[6],destination_key:v[7],
        max_attempts:v[8],initial_retry_delay_ms:v[9],backoff_multiplier:v[10],max_retry_delay_ms:v[11],lease_duration_ms:v[12],
        state:"pending",attempt_count:0,replay_count:0,available_at:new Date(),created_at:new Date(),updated_at:new Date(),last_replayed_at:null };
        this.jobs.set(key,row); rows=[row]; }
    } else if (sql.startsWith("select * from drivable_delivery_outbox")) { const job=this.jobs.get(`${v[0]}:${v[1]}`); rows=job?[job]:[];
    } else if (sql.startsWith("update drivable_delivery_outbox set state='dead_letter'")) {
      for (const job of this.jobs.values()) if (job.case_id===v[0] && job.deduplication_key.startsWith(v[1].slice(0,-1))) job.state="dead_letter";
    } else throw new Error(`Unexpected fixture SQL: ${sql}`);
    return { rows: structuredClone(rows) as Row[] };
  }
}
async function setup() {
  const sql = new SqlFixture(), repo = new PostgresCommerceOrderRepository(sql);
  const service = new CommerceOrderService(repo, { now: () => new Date(Date.now()-2000) });
  const order = await service.createPendingOrder({ caseId: "case_reconciled", offer: { offerId:"buyer_check",offerVersion:"v1",label:"Buyer Check",amountMinor:4900,currency:"USD" } });
  return { sql, repo, order, service: new CommerceOrderService(repo), adapter: new StripeTestPaymentAdapter(secret, reference => repo.getOrderIdForProvider(reference)) };
}

test("canonical migration refuses legacy layouts and schema exposes one provider/event proof contract", async () => {
  const migration = await readFile(new URL("../../migrations/0007_drivable_commerce_orders.sql",import.meta.url),"utf8");
  assert.match(migration,/RAISE EXCEPTION 'Existing commerce schema/);
  assert.doesNotMatch(migration,/CREATE TABLE IF NOT EXISTS/i);
  assert.match(migration,/event_id text PRIMARY KEY/); assert.match(migration,/contract_version.*2/);
  for (const column of ["snapshot","checkout_session_id","event_kind","provider_occurred_at","proof"]) assert.ok(migration.includes(column));
  const schema = await readFile(new URL("../../shared/schema.ts",import.meta.url),"utf8");
  for (const column of ["checkout_session_id","contract_version","provider_occurred_at","proof"]) assert.ok(schema.includes(`"${column}"`));
  assert.throws(()=>getLaunchOffer("constructor"));
});

test("Checkout uses server price, canonical metadata, fixed origin and stable idempotency; live key rejected", async () => {
  const { order }=await setup(); let params:any, options:any;
  const client = { checkout:{sessions:{ async create(p:any,o:any){params=p;options=o;return {id:"cs_test_fixture"};} } } } as any;
  await createStripeTestCheckout(order,"sk_test_fixture","https://getdrivable.com","buyer@example.com",client);
  assert.equal(params.line_items[0].price_data.unit_amount,4900);
  assert.equal(params.metadata.drivableOrderId,order.orderId);
  assert.deepEqual(params.payment_intent_data.metadata,params.metadata);
  assert.equal(options.idempotencyKey,`drivable-checkout-${order.orderId}`);
  assert.ok(params.success_url.startsWith("https://getdrivable.com/"));
  await assert.rejects(createStripeTestCheckout(order,"sk_live_rejected","https://getdrivable.com","buyer@example.com",client));
});

test("signed failure retry and Checkout/Intent success record once per event and queue one internal reconciliation", async () => {
  const {sql,repo,order,service,adapter}=await setup();
  await service.applyProviderPayload(adapter,signed("payment_intent.payment_failed",payment(order.orderId,"requires_payment_method"),"evt_failure"));
  assert.equal((await repo.get(order.orderId))?.state,"failed"); assert.equal(sql.jobs.size,0);
  const success=signed("payment_intent.succeeded",payment(order.orderId),"evt_success");
  await service.applyProviderPayload(adapter,success);
  assert.equal((await service.applyProviderPayload(adapter,success)).status,"duplicate");
  await service.applyProviderPayload(adapter,signed("checkout.session.completed",{ object:"checkout.session",livemode:false,id:"cs_test_fixture",mode:"payment",status:"complete",payment_status:"paid",payment_intent:"pi_reconciled",amount_total:4900,currency:"usd",metadata:{drivableOrderId:order.orderId} },"evt_checkout"));
  await service.applyProviderPayload(adapter,signed("payment_intent.payment_failed",payment(order.orderId,"requires_payment_method"),"evt_old_failure"));
  assert.equal(await repo.hasVerifiedPayment(order.orderId),true); assert.equal(sql.jobs.size,1);
  assert.equal([...sql.jobs.values()][0].destination_key,"payment-reconcile");
  const restarted = new CommerceOrderService(new PostgresCommerceOrderRepository(sql));
  assert.equal((await restarted.getOrder(order.orderId))?.state,"verified"); // fixture reload only, not real PG proof
});

test("outbox failure rolls back payment and event; exact retry succeeds atomically",async()=>{
  const {sql,repo,order,service,adapter}=await setup();sql.failOutbox=true;
  const event=signed("payment_intent.succeeded",payment(order.orderId),"evt_atomic");
  await assert.rejects(service.applyProviderPayload(adapter,event));
  assert.equal((await repo.get(order.orderId))?.state,"pending");assert.equal(sql.events.size,0);assert.equal(sql.jobs.size,0);
  sql.failOutbox=false;await service.applyProviderPayload(adapter,event);assert.equal(sql.jobs.size,1);assert.equal(sql.events.size,1);
});

test("global event IDs and provider references prevent replay across orders",async()=>{
  const {sql,order,service,adapter}=await setup();
  await service.applyProviderPayload(adapter,signed("payment_intent.succeeded",payment(order.orderId),"evt_shared"));
  const other=await service.createPendingOrder({caseId:"case_other",offer:order.offer});
  await assert.rejects(service.applyProviderPayload(adapter,signed("payment_intent.succeeded",payment(other.orderId,"succeeded","pi_other"),"evt_shared")),/different content/);
  await assert.rejects(service.applyProviderPayload(adapter,signed("payment_intent.succeeded",payment(other.orderId),"evt_other")));
  assert.equal((await service.getOrder(other.orderId))?.state,"pending");assert.equal(sql.events.size,1);
});

test("release validation and human approval are separate; duplicates queue once; refund revokes queued release",async()=>{
  const {sql,repo,order,service,adapter}=await setup();
  await service.applyProviderPayload(adapter,signed("payment_intent.succeeded",payment(order.orderId),"evt_paid"));
  assert.equal((await new PaidReleaseCoordinator(sql).dispatch(order.orderId)).code,"postgres_validation_required");
  assert.equal((await new PaidReleaseCoordinator(sql,()=>true,async()=>null).dispatch(order.orderId)).code,"human_approval_required");
  const release = new PaidReleaseCoordinator(sql,()=>true,async()=>({approvalId:"approval_fixture",versionId:"version_fixture"}));
  const first=await release.dispatch(order.orderId),duplicate=await release.dispatch(order.orderId);
  assert.equal(first.queued,true);assert.equal(duplicate.queued,true);assert.equal(sql.jobs.size,2);
  const charge={object:"charge",livemode:false,id:"ch_fixture",payment_intent:"pi_reconciled",status:"succeeded",paid:true,amount:4900,amount_refunded:1000,refunded:false,currency:"usd",metadata:{}};
  await service.applyProviderPayload(adapter,signed("charge.refunded",charge,"evt_partial"));
  assert.equal((await repo.get(order.orderId))?.state,"partial_refund");assert.equal(await repo.hasVerifiedPayment(order.orderId),false);
  assert.equal([...sql.jobs.values()].find(j=>j.destination_key==="journey-approved-result")?.state,"dead_letter");
  assert.equal((await release.dispatch(order.orderId)).code,"payment_not_verified");
  await service.applyProviderPayload(adapter,signed("charge.refunded",{...charge,amount_refunded:4900,refunded:true},"evt_full"));
  await service.applyProviderPayload(adapter,signed("charge.refunded",charge,"evt_late_partial"));
  const final=await repo.get(order.orderId);assert.equal(final?.state,"refunded");assert.equal(final?.refundedAmountMinor,4900);
});


test("refund before durable binding is retryable and cannot manufacture entitlement",async()=>{
  const {sql,order,service,adapter}=await setup();
  const charge={object:"charge",livemode:false,id:"ch_early",payment_intent:"pi_reconciled",status:"succeeded",paid:true,
    amount:4900,amount_refunded:4900,refunded:true,currency:"usd",metadata:{drivableOrderId:order.orderId}};
  await assert.rejects(service.applyProviderPayload(adapter,signed("charge.refunded",charge,"evt_early_refund")),
    (error:any)=>error.code==="persistence_failed");
  assert.equal(sql.events.size,0);assert.equal(sql.jobs.size,0);
});
