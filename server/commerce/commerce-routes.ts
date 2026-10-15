import type { Express, Request, Response } from "express";
import { requireCustomer } from "../customer-auth.js";
import { requireReviewer } from "../reviewer-auth.js";
import { getTestPaymentRuntime } from "./payment-runtime.js";
import { getLaunchOffer, listLaunchOffers } from "./commerce-offers.js";
import { createStripeTestCheckout } from "./stripe-test-payment-adapter.js";
import { PaidReleaseCoordinator } from "./paid-release-coordinator.js";

function token(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new Error("Invalid identifier");
  return value;
}
function receipt(order: Awaited<ReturnType<ReturnType<typeof getTestPaymentRuntime>["repository"]["get"]>>) {
  if (!order) return null;
  return { orderId: order.orderId, caseId: order.caseId, offer: order.offer, state: order.state,
    refundedAmountMinor: order.refundedAmountMinor ?? 0, createdAt: order.createdAt, updatedAt: order.updatedAt };
}
function publicOrigin(env: NodeJS.ProcessEnv): string {
  const value = env.DRIVABLE_PUBLIC_ORIGIN?.replace(/\/$/, "");
  const url = new URL(value ?? "");
  if (url.origin !== value || url.username || url.password || (url.protocol !== "https:"
    && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Invalid public origin");
  return url.origin;
}

export function createCommerceHandlers(runtimeFactory = getTestPaymentRuntime, env = process.env,
  checkout = createStripeTestCheckout) {
  async function access(runtime: ReturnType<typeof getTestPaymentRuntime>, req: Request, caseId: string) {
    const result = await runtime.executor.query<{ customer_id: string }>("select customer_id from journey_cases where id=$1", [caseId]);
    return Boolean(req.drivableCustomer?.id && result.rows[0]?.customer_id === req.drivableCustomer.id);
  }
  const safe = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    try { await handler(req, res); }
    catch { res.status(503).json({ ok: false, code: "PAYMENT_GATE_UNAVAILABLE" }); }
  };
  const create = safe(async (req, res) => {
    const body = req.body;
    if (!body || Object.keys(body).some(key => !["caseId","offerId"].includes(key))) {
      res.status(400).json({ code: "INVALID_ORDER_INPUT" }); return;
    }
    const caseId = token(body.caseId), offer = getLaunchOffer(body.offerId);
    const runtime = runtimeFactory();
    if (!await runtime.repository.verifyStorage()) throw new Error("Schema unavailable");
    if (!await access(runtime, req, caseId)) { res.status(404).json({ code: "CASE_NOT_FOUND" }); return; }
    const order = await runtime.service.createPendingOrder({ caseId, offer });
    res.status(201).json({ ok: true, order: receipt(order) });
  });
  const status = safe(async (req, res) => {
    const runtime = runtimeFactory(), order = await runtime.repository.get(token(req.params.orderId));
    if (!order || !await access(runtime, req, order.caseId)) { res.status(404).json({ code: "ORDER_NOT_FOUND" }); return; }
    // Payment entitlement does not imply human approval, queued delivery, or customer release.
    res.json({ ok: true, order: receipt(order), paymentEntitled: await runtime.repository.hasVerifiedPayment(order.orderId),
      releaseAllowed: false });
  });
  const beginCheckout = safe(async (req, res) => {
    const runtime = runtimeFactory(), order = await runtime.repository.get(token(req.params.orderId));
    if (!order || !await access(runtime, req, order.caseId)) { res.status(404).json({ code: "ORDER_NOT_FOUND" }); return; }
    if (!["pending","failed"].includes(order.state)) { res.status(409).json({ code: "ORDER_NOT_PAYABLE" }); return; }
    if (!await runtime.repository.verifyStorage()) throw new Error("Storage unavailable");
    const session = await checkout(order, env.DRIVABLE_STRIPE_TEST_SECRET_KEY, publicOrigin(env), req.drivableCustomer!.email);
    if (session.livemode !== false || !session.url) throw new Error("Invalid test Checkout response");
    await runtime.repository.bindCheckout(order.orderId, session.id);
    res.json({ ok: true, sessionId: session.id, url: session.url });
  });
  const release = safe(async (req, res) => {
    const runtime = runtimeFactory();
    const result = await new PaidReleaseCoordinator(runtime.executor).dispatch(token(req.params.orderId));
    res.status(result.queued ? 202 : 503).json(result);
  });
  return { create, status, beginCheckout, release };
}

export function registerCommerceRoutes(app: Express) {
  const handlers = createCommerceHandlers();
  app.get("/api/commerce/offers", (_req, res) => res.json({ testMode: true, offers: listLaunchOffers() }));
  app.post("/api/commerce/orders", requireCustomer, handlers.create);
  app.get("/api/commerce/orders/:orderId", requireCustomer, handlers.status);
  app.post("/api/commerce/orders/:orderId/checkout", requireCustomer, handlers.beginCheckout);
  app.post("/api/commerce/orders/:orderId/release", requireReviewer, handlers.release);
}
