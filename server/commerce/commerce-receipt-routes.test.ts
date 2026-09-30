import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createSessionToken } from "../customer-auth.js";
import { getLaunchOffer } from "./commerce-offers.js";
import { InMemoryCommerceOrderRepository } from "./in-memory-commerce-order-repository.js";
import {
  CommerceOrderService,
  type CommerceOrderRepository,
} from "./order-contract.js";

process.env.DRIVABLE_SESSION_SECRET = "test-only-session-secret-with-more-than-32-characters";

function customerCookie(): string {
  const token = createSessionToken({ id: "cust_receipt_1", email: "buyer@example.com" });
  return `drivable_session=${token}`;
}

async function withServer(work: (origin: string) => Promise<void>) {
  const { registerRoutes } = await import("../routes.js");
  const app = express();
  app.use(express.json());
  const repository = new InMemoryCommerceOrderRepository();
  const service = new CommerceOrderService(repository);
  const order = await service.createPendingOrder({
    caseId: "case_receipt_ok",
    offer: getLaunchOffer("buyer_precheck"),
  });
  const server = await registerRoutes(app, { paymentRepository: repository });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${(address as unknown as { port: number }).port}|${order.orderId}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function getReceipt(origin: string, orderId: string, query = "", cookie?: string) {
  const response = await fetch(`${origin}/api/commerce/orders/${orderId}${query}`, {
    headers: cookie ? { cookie } : {},
  });
  const parsed = (await response.json()) as Record<string, unknown>;
  return { response, body: parsed };
}

function splitOrigin(workArg: string): { origin: string; orderId: string } {
  const separator = workArg.lastIndexOf("|");
  return { origin: workArg.slice(0, separator), orderId: workArg.slice(separator + 1) };
}

test("GET /api/commerce/orders/:orderId rejects unauthenticated callers", async () => {
  await withServer(async (workArg) => {
    const { origin, orderId } = splitOrigin(workArg);
    const { response } = await getReceipt(origin, orderId);
    assert.equal(response.status, 401);
  });
});

test("GET /api/commerce/orders/:orderId returns the safe receipt without a case assertion", async () => {
  await withServer(async (workArg) => {
    const { origin, orderId } = splitOrigin(workArg);
    const { response, body } = await getReceipt(origin, orderId, "", customerCookie());
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    const order = body.order as Record<string, unknown>;
    assert.equal(order.orderId, orderId);
    assert.equal(order.caseId, "case_receipt_ok");
    assert.deepEqual(Object.keys(order).sort(), [
      "caseId",
      "createdAt",
      "entitledHint",
      "offer",
      "orderId",
      "providerOrderReference",
      "refundReasonCode",
      "state",
      "updatedAt",
    ]);
  });
});

test("GET /api/commerce/orders/:orderId accepts a matching caseId assertion", async () => {
  await withServer(async (workArg) => {
    const { origin, orderId } = splitOrigin(workArg);
    const { response, body } = await getReceipt(
      origin,
      orderId,
      "?caseId=case_receipt_ok",
      customerCookie(),
    );
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal((body.order as Record<string, unknown>).orderId, orderId);
  });
});

test("GET /api/commerce/orders/:orderId rejects a wrong caseId without revealing the receipt", async () => {
  await withServer(async (workArg) => {
    const { origin, orderId } = splitOrigin(workArg);
    const { response, body } = await getReceipt(
      origin,
      orderId,
      "?caseId=case_wrong",
      customerCookie(),
    );
    assert.equal(response.status, 409);
    assert.equal(body.ok, false);
    assert.equal(body.code, "wrong_case");
    assert.equal("order" in body, false);
  });
});

test("GET /api/commerce/orders/:orderId rejects an empty caseId assertion", async () => {
  await withServer(async (workArg) => {
    const { origin, orderId } = splitOrigin(workArg);
    const { response, body } = await getReceipt(origin, orderId, "?caseId=", customerCookie());
    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.code, "invalid_order_input");
    assert.equal("order" in body, false);
  });
});

test("GET /api/commerce/orders/:orderId returns 404 for unknown orders", async () => {
  await withServer(async (workArg) => {
    const { origin } = splitOrigin(workArg);
    const { response } = await getReceipt(origin, "ord_missing", "", customerCookie());
    assert.equal(response.status, 404);
  });
});
