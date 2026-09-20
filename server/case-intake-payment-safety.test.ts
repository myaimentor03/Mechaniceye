import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #4 payment chain).
 *
 * Product rule (docs/product/DRIVABLE_FIRST_PAID_OFFERS_V1.md):
 * payment stays `Unverified`/`Pending` until separately confirmed, and an
 * intake submission must never mark a report `Paid`.
 *
 * These contract tests pin the intake-side invariants so a future edit
 * cannot silently promote an intake into a paid entitlement:
 * - intake types carry no client-assertable payment/entitlement fields
 * - the case tracker hardcodes PaymentStatus Unverified / PaymentTier Unknown
 * - launch readiness reports verifiedPaymentEntitlement: false
 */

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function typeBlock(text: string, typeName: string): string {
  const start = text.indexOf(`type ${typeName} = `);
  assert.ok(start >= 0, `${typeName} type block must exist`);
  const end = text.indexOf("};", start);
  assert.ok(end > start, `${typeName} type block must terminate`);
  return text.slice(start, end);
}

const caseStorage = source("./case-storage.ts");
const routes = source("./routes.ts");

const PAYMENT_KEY_PATTERN =
  /\b(payment|paid|entitlement|tier|price|amountMinor|stripe|checkout|refund)\b/i;

test("IncomingDiagnosisCase carries no client-assertable payment fields", () => {
  const block = typeBlock(caseStorage, "IncomingDiagnosisCase");
  assert.doesNotMatch(block, PAYMENT_KEY_PATTERN);
});

test("DiagnosisInput route type carries no payment or entitlement fields", () => {
  const block = typeBlock(routes, "DiagnosisInput");
  assert.doesNotMatch(block, PAYMENT_KEY_PATTERN);
});

test("buildDiagnosisInput constructs no payment or entitlement values", () => {
  const start = routes.indexOf("function buildDiagnosisInput(");
  assert.ok(start >= 0, "buildDiagnosisInput must exist");
  const rest = routes.slice(start);
  const nextFunction = rest.slice(1).search(/\n(?:function|const|class|export) /);
  const body = nextFunction > 0 ? rest.slice(0, nextFunction + 1) : rest;
  assert.doesNotMatch(body, PAYMENT_KEY_PATTERN);
});

test("case tracker defaults new intakes to PaymentStatus Unverified", () => {
  assert.match(caseStorage, /PaymentStatus:\s*"Unverified"/);
});

test("case tracker defaults new intakes to PaymentTier Unknown", () => {
  assert.match(caseStorage, /PaymentTier:\s*"Unknown"/);
});

test("case storage never marks an intake Paid/Pending/Comped/Refunded", () => {
  assert.doesNotMatch(caseStorage, /PaymentStatus:\s*"(Paid|Pending|Comped|Refunded)"/);
  assert.doesNotMatch(caseStorage, /PaymentTier:\s*"(Paid|First Look|Full Decision)"/);
});

test("new intake tracker rows stay NEW and never claim a paid tier", () => {
  assert.match(caseStorage, /CaseStatus:\s*"NEW"/);
  assert.doesNotMatch(caseStorage, /CaseStatus:\s*"PAID"/);
});

test("launch readiness grants no payment entitlement from intake", () => {
  assert.match(routes, /verifiedPaymentEntitlement:\s*false/);
  assert.doesNotMatch(routes, /verifiedPaymentEntitlement:\s*true/);
});

// ---------------------------------------------------------------------------
// Runtime: hostile client must not smuggle paid state through POST
// /api/diagnoses (P0 #4 payment chain, mobile/upload recovery).
//
// buildDiagnosisInput whitelists fields, but only a runtime test proves a
// hostile multipart body cannot flip the outcome: the smuggled request must
// behave exactly like the clean request (fail-closed 503 persisted:false
// without DB / launch runtime in this harness) and the response must never
// grant, echo, or reflect paid state.
// ---------------------------------------------------------------------------

const RUNTIME_SESSION_SECRET = "test-payment-spoof-secret-at-least-32-chars-long";
const RUNTIME_BETA_INVITE = "TEST-BETA-INVITE-123";

function spoofCookie(identity: CustomerIdentity): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withSpoofServer(work: (origin: string) => Promise<void>) {
  const keys = ["DRIVABLE_SESSION_SECRET", "DRIVABLE_BETA_INVITE_CODE"] as const;
  const prior: Record<string, string | undefined> = {};
  for (const key of keys) prior[key] = process.env[key];
  process.env.DRIVABLE_SESSION_SECRET = RUNTIME_SESSION_SECRET;
  process.env.DRIVABLE_BETA_INVITE_CODE = RUNTIME_BETA_INVITE;
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await work(origin);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
}

function spoofForm(withHostileFields: boolean): FormData {
  const form = new FormData();
  const evidenceIntake = {
    mode: "diagnose",
    vehicle: { year: "2015", make: "Toyota", model: "Corolla", mileage: 85000 },
    situation: {
      description: "Engine running rough at idle",
      symptoms: ["Engine running rough"],
      timing: "Idle",
      urgency: "Safe to Drive",
      canDrive: "Safe to Drive",
    },
    obd: { codes: ["P0300"], attachmentIds: [] },
    attachments: [],
  };
  form.append("evidenceIntake", JSON.stringify(evidenceIntake));
  form.append("consent", JSON.stringify({
    service_fulfillment: true,
    media_processing: true,
    human_review_sharing: true,
    optional_product_learning: false,
  }));
  if (withHostileFields) {
    // Every field below must be ignored: none of these keys exist on the
    // intake whitelist, and none may reach storage, the response, or webhooks.
    form.append("PaymentStatus", "Paid");
    form.append("paymentStatus", "Paid");
    form.append("PaymentTier", "Full Decision");
    form.append("paid", "true");
    form.append("entitlement", "paid");
    form.append("verifiedPaymentEntitlement", "true");
    form.append("tier", "paid");
    form.append("amountMinor", "4900");
    form.append("price", "49");
    form.append("stripePaymentIntentId", "pi_spoof_12345");
    form.append("checkoutSessionId", "cs_spoof_67890");
  }
  return form;
}

test("hostile payment fields on intake behave exactly like the clean request (never a paid grant)", async () => {
  await withSpoofServer(async (origin) => {
    const cleanRes = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: spoofCookie({ id: "cust-spoof-clean", email: "spoof-clean@example.test" }) },
      body: spoofForm(false),
    });
    const hostileRes = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: spoofCookie({ id: "cust-spoof-hostile", email: "spoof-hostile@example.test" }) },
      body: spoofForm(true),
    });
    const cleanBody = await cleanRes.json();
    const hostileBody = await hostileRes.json();
    assert.equal(hostileRes.status, cleanRes.status, "smuggled payment fields must not change the intake outcome");
    assert.equal(hostileBody.persisted, false, "hostile intake must stay fail-closed persisted:false in this harness");
    assert.equal(hostileBody.duplicate, undefined, "hostile intake must not be mistaken for an idempotent replay");
  });
});

test("hostile payment values are never granted, echoed, or reflected in the intake response", async () => {
  await withSpoofServer(async (origin) => {
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: spoofCookie({ id: "cust-spoof-reflect", email: "spoof-reflect@example.test" }) },
      body: spoofForm(true),
    });
    const body = await res.json();
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /"Paid"/, "response must never report a Paid status");
    assert.doesNotMatch(serialized, /pi_spoof_12345/, "stripe spoof value must never be reflected");
    assert.doesNotMatch(serialized, /cs_spoof_67890/, "checkout spoof value must never be reflected");
    assert.doesNotMatch(serialized, /verifiedPaymentEntitlement":\s*true/, "response must never grant a payment entitlement");
    assert.doesNotMatch(serialized, /"entitlement"\s*:\s*"paid"/i, "response must never carry a paid entitlement flag");
  });
});
