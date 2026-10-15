import assert from "node:assert/strict";
import test from "node:test";
import { createCommerceHandlers } from "./commerce-routes.js";

function response() { return { statusCode: 200, body: undefined as any,
  status(code:number){this.statusCode=code;return this;},json(body:any){this.body=body;return this;} }; }
function fixture(owner="customer_fixture") {
  const order={orderId:"ord_fixture",caseId:"case_fixture",offer:{offerId:"buyer_check_full",offerVersion:"v1",label:"Buyer Check",amountMinor:3900,currency:"USD"},state:"pending",provider:null,version:1,eventCount:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),refundReasonCode:null};
  let created:any, bound:any, charged:any;
  const runtime={repository:{async verifyStorage(){return true;},async get(){return order;},async hasVerifiedPayment(){return false;},async bindCheckout(id:string,session:string){bound={id,session};}},
    service:{async createPendingOrder(input:any){created=input;return {...order,offer:input.offer};}},
    executor:{async query(){return {rows:[{customer_id:owner}]};}}};
  const env={DRIVABLE_PUBLIC_ORIGIN:"https://getdrivable.com",DRIVABLE_STRIPE_TEST_SECRET_KEY:"sk_test_fixture"};
  const handlers=createCommerceHandlers(()=>runtime as any,env,async(...args:any[])=>{charged=args;return {id:"cs_test_fixture",livemode:false,url:"https://checkout.stripe.com/test"} as any;});
  const req={params:{orderId:"ord_fixture"},body:{caseId:"case_fixture",offerId:"buyer_check_full"},drivableCustomer:{id:"customer_fixture",email:"buyer@example.com"}};
  return {handlers,req,order,state:()=>({created,bound,charged})};
}

test("customer order snapshots are server priced; client amounts rejected before persistence",async()=>{
  const f=fixture(),res=response(); await f.handlers.create(f.req as any,res as any);
  assert.equal(res.statusCode,201);assert.equal(f.state().created.offer.amountMinor,3900);
  const bad=response();await f.handlers.create({...f.req,body:{...f.req.body,amountMinor:1}} as any,bad as any);
  assert.equal(bad.statusCode,400);
});
test("wrong customer cannot create, read or check out another customer's case",async()=>{
  const f=fixture("other_customer");
  for(const handler of [f.handlers.create,f.handlers.status,f.handlers.beginCheckout]) {
    const res=response();await handler(f.req as any,res as any);assert.equal(res.statusCode,404);
  }
  assert.equal(f.state().charged,undefined);assert.equal(f.state().created,undefined);
});
test("Checkout uses stored order and server origin, persists the Session before response",async()=>{
  const f=fixture(),res=response();await f.handlers.beginCheckout({...f.req,body:{successUrl:"https://attacker.example"}} as any,res as any);
  assert.equal(res.statusCode,200);assert.equal(f.state().charged[2],"https://getdrivable.com");
  assert.deepEqual(f.state().bound,{id:"ord_fixture",session:"cs_test_fixture"});
});
test("payment receipt never asserts approval/release and database failures remain closed",async()=>{
  const f=fixture(),res=response();await f.handlers.status(f.req as any,res as any);
  assert.equal(res.body.paymentEntitled,false);assert.equal(res.body.releaseAllowed,false);
  const handlers=createCommerceHandlers(()=>{throw new Error("database unavailable");});
  const failure=response();await handlers.beginCheckout(f.req as any,failure as any);assert.equal(failure.statusCode,503);
});
