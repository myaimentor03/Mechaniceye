import express, { type Express } from "express";
import { CommerceContractError } from "./order-contract.js";
import { getTestPaymentRuntime } from "./payment-runtime.js";

export const TEST_PAYMENT_WEBHOOK_PATH = "/api/commerce/stripe-test/webhook";

/** Register before express.json(): signature verification requires original bytes. */
export function registerTestPaymentWebhook(app: Express) {
  app.post(TEST_PAYMENT_WEBHOOK_PATH, express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
    let runtime;
    try { runtime = getTestPaymentRuntime(); }
    catch { res.status(503).json({ code: "TEST_PAYMENT_GATE_UNAVAILABLE" }); return; }
    try {
      if (!await runtime.repository.verifyStorage()) {
        res.status(503).json({ code: "TEST_PAYMENT_STORAGE_UNAVAILABLE" }); return;
      }
      const result = await runtime.service.applyProviderPayload(runtime.adapter, {
        rawBody: req.body, signature: req.headers["stripe-signature"],
      });
      res.json({ received: true, status: result.status });
    } catch (error) {
      const retry = !(error instanceof CommerceContractError)
        || error.code === "persistence_failed" || error.code === "version_conflict";
      res.status(retry ? 503 : 400).json({ code: retry ? "PAYMENT_PERSISTENCE_UNAVAILABLE" : "PAYMENT_EVENT_REJECTED" });
    }
  });
}
