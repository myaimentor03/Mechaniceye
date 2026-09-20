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

test("MarketplaceSellerIntake route type carries no payment or entitlement fields (ClearSale P0 #7)", () => {
  const block = typeBlock(routes, "MarketplaceSellerIntake");
  assert.doesNotMatch(block, PAYMENT_KEY_PATTERN);
});

test("MarketplaceBuyerInterest route type carries no payment or entitlement fields (Buyer Check P0 #8)", () => {
  const block = typeBlock(routes, "MarketplaceBuyerInterest");
  assert.doesNotMatch(block, PAYMENT_KEY_PATTERN);
});

test("MechanicMatchRequest route type carries no payment or entitlement fields (FIX routing P0 #10)", () => {
  const block = typeBlock(routes, "MechanicMatchRequest");
  assert.doesNotMatch(block, PAYMENT_KEY_PATTERN);
});

test("ConciergeRequest route type carries no payment or entitlement fields (Guided Journey)", () => {
  const block = typeBlock(routes, "ConciergeRequest");
  assert.doesNotMatch(block, PAYMENT_KEY_PATTERN);
});

test("webhook-forwarded builders whitelist only intake fields (no payment passthrough)", () => {
  for (const fn of [
    "function buildMarketplaceSellerIntake(",
    "function buildMarketplaceBuyerInterest(",
    "function buildMechanicMatchRequest(",
    "function buildConciergeRequest(",
  ]) {
    const start = routes.indexOf(fn);
    assert.ok(start >= 0, `${fn} must exist`);
    const rest = routes.slice(start);
    const nextFunction = rest.slice(1).search(/\n(?:function|const|class|export|async function) /);
    const body = nextFunction > 0 ? rest.slice(0, nextFunction + 1) : rest;
    assert.doesNotMatch(body, PAYMENT_KEY_PATTERN, `${fn} must not reference payment keys`);
  }
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

// ---------------------------------------------------------------------------
// Runtime: hostile payment fields on the webhook-forwarded public forms
// (ClearSale P0 #7, buyer-interest P0 #8, Mechanic Match P0 #10, concierge).
// Builders whitelist fields, but only runtime tests prove a hostile JSON body
// cannot flip the outcome or pollute the webhook packet: the smuggled request
// must behave exactly like the clean request (same status, same shape) and
// neither the API response nor the forwarded webhook packet may grant, echo,
// or reflect paid state.
// ---------------------------------------------------------------------------

const HOSTILE_PAYMENT_FIELDS: Record<string, unknown> = {
  PaymentStatus: "Paid",
  paymentStatus: "Paid",
  PaymentTier: "Full Decision",
  paid: true,
  entitlement: "paid",
  verifiedPaymentEntitlement: true,
  tier: "paid",
  amountMinor: 4900,
  price: "49",
  stripePaymentIntentId: "pi_spoof_12345",
  checkoutSessionId: "cs_spoof_67890",
};

function validSellerIntake() {
  return {
    sellerName: "Pay Spoof Seller",
    sellerEmail: "pay-spoof-seller@example.test",
    sellerPhone: "555-019-1919",
    city: "Anytown",
    state: "CA",
    zip: "90210",
    vehicleYear: "2015",
    make: "Toyota",
    model: "Camry",
    mileage: "142100",
    askingPrice: "7450",
    titleStatus: "clean",
    runsAndDrives: "Runs and drives",
    knownIssues: "Minor wear",
    listingType: "basic",
    acknowledgments: { ownerAuthorized: true, platformOnly: true, sellerResponsibilities: true, noGuarantee: true },
  };
}

function validBuyerInterest() {
  return {
    buyerName: "Pay Spoof Buyer",
    buyerEmail: "pay-spoof-buyer@example.test",
    buyerPhone: "555-019-2929",
    preferredContactMethod: "Email",
    listingTitle: "2015 Toyota Camry LE",
    listingUrl: "https://drivablestaging.example.test/listings/sample",
    message: "Is this still available?",
    timeline: "This weekend",
    acknowledgments: { platformOnly: true, buyerResponsibilities: true, noGuarantee: true },
  };
}

function validMechanicMatch() {
  return {
    customerName: "Pay Spoof Driver",
    customerEmail: "pay-spoof-mech@example.test",
    customerPhone: "(415) 555-0100",
    city: "San Francisco",
    state: "CA",
    zip: "94103",
    vehicleYear: "2015",
    make: "Toyota",
    model: "Corolla",
    mileage: "85000",
    problemCategory: "Engine running rough",
    symptoms: "Rough idle and hesitation on acceleration.",
    canDrive: "Short distance only",
    urgency: "This week",
    preferredHelpType: "Repair shop",
    budgetRange: "$300-$750",
    photosOrVideoAvailable: "Can provide if requested",
    existingDiagnosisCaseId: "",
    drivableCheckUsed: "Yes",
    permissionToShareCase: "Yes",
    acknowledgments: { platformOnly: true, noGuarantee: true, customerResponsible: true },
  };
}

function validConcierge() {
  return {
    guideRequested: "Guided diagnosis help",
    helpTopic: "Stuck on photo upload",
    customerName: "Pay Spoof Help",
    customerEmail: "pay-spoof-conc@example.test",
    customerPhone: "(415) 555-0100",
    relatedCaseId: "",
    relatedListingId: "",
    currentPage: "/diagnosis",
    urgency: "Today",
    preferredContactMethod: "Email",
    message: "Stuck uploading engine photos on mobile Safari.",
    stuckStep: "photo-upload",
    wantsHumanReview: "Yes",
    scenario: "fix_my_car",
    reportType: "diagnosis",
    topic: "photo-upload",
    sourceContext: { page: "/diagnosis", selectedScenario: null, selectedReportType: null, topic: null, queryParams: {} },
    acknowledgments: { aiAssistedGuide: true, finalVerification: true },
  };
}

async function startPaymentSpoofWebhookStub(): Promise<{ url: string; hits: unknown[]; close: () => Promise<void> }> {
  const stub = express();
  stub.use(express.json());
  const hits: unknown[] = [];
  stub.post("/hook", (req, res) => {
    hits.push(req.body);
    res.json({ ok: true });
  });
  const server = stub.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/hook`,
    hits,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function withPaymentSpoofWebhookServer(work: (origin: string, hits: unknown[]) => Promise<void>) {
  const webhook = await startPaymentSpoofWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  const priorSession = process.env.DRIVABLE_SESSION_SECRET;
  const priorInvite = process.env.DRIVABLE_BETA_INVITE_CODE;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
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
    await work(origin, webhook.hits);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    if (priorSession === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = priorSession;
    if (priorInvite === undefined) delete process.env.DRIVABLE_BETA_INVITE_CODE;
    else process.env.DRIVABLE_BETA_INVITE_CODE = priorInvite;
    await webhook.close();
  }
}

async function postSpoofJson(origin: string, route: string, body: unknown) {
  const response = await fetch(`${origin}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body: parsed };
}

function assertNoPaidReflection(serialized: string, surface: string) {
  assert.doesNotMatch(serialized, /"Paid"/, `${surface}: response must never report a Paid status`);
  assert.doesNotMatch(serialized, /pi_spoof_12345/, `${surface}: stripe spoof value must never be reflected`);
  assert.doesNotMatch(serialized, /cs_spoof_67890/, `${surface}: checkout spoof value must never be reflected`);
  assert.doesNotMatch(serialized, /verifiedPaymentEntitlement/, `${surface}: response must never carry a payment entitlement flag`);
  assert.doesNotMatch(serialized, /"entitlement"\s*:\s*"paid"/i, `${surface}: response must never carry a paid entitlement flag`);
}

function assertWebhookPacketClean(packet: unknown, surface: string) {
  const serialized = JSON.stringify(packet ?? {});
  assert.doesNotMatch(serialized, /"Paid"/, `${surface}: webhook packet must never carry Paid status`);
  assert.doesNotMatch(serialized, /pi_spoof_12345/, `${surface}: webhook packet must never carry stripe spoof value`);
  assert.doesNotMatch(serialized, /cs_spoof_67890/, `${surface}: webhook packet must never carry checkout spoof value`);
  assert.doesNotMatch(serialized, /verifiedPaymentEntitlement/, `${surface}: webhook packet must never carry entitlement flag`);
  assert.doesNotMatch(serialized, /"entitlement"\s*:\s*"paid"/i, `${surface}: webhook packet must never carry paid entitlement`);
  assert.doesNotMatch(serialized, /amountMinor/, `${surface}: webhook packet must never carry amountMinor`);
}

test("ClearSale seller-intake smuggled payment fields are stripped (same outcome, no paid reflection, clean webhook)", async () => {
  await withPaymentSpoofWebhookServer(async (origin, hits) => {
    const clean = await postSpoofJson(origin, "/api/marketplace/seller-intake", validSellerIntake());
    const hostile = await postSpoofJson(origin, "/api/marketplace/seller-intake", { ...validSellerIntake(), ...HOSTILE_PAYMENT_FIELDS });
    assert.equal(hostile.status, clean.status, "smuggled payment fields must not change the seller-intake outcome");
    assert.equal(hostile.status, 200, "both seller-intake submits must succeed");
    assert.equal(hostile.body.ok, true);
    assert.equal(hostile.body.duplicate, false);
    assertNoPaidReflection(JSON.stringify(hostile.body), "seller-intake");
    assert.equal(hits.length, 2, "both submits forward exactly once each");
    for (const packet of hits) assertWebhookPacketClean(packet, "seller-intake");
  });
});

test("buyer-interest smuggled payment fields are stripped (same outcome, no paid reflection, clean webhook)", async () => {
  await withPaymentSpoofWebhookServer(async (origin, hits) => {
    const clean = await postSpoofJson(origin, "/api/marketplace/buyer-interest", validBuyerInterest());
    const hostile = await postSpoofJson(origin, "/api/marketplace/buyer-interest", { ...validBuyerInterest(), ...HOSTILE_PAYMENT_FIELDS });
    assert.equal(hostile.status, clean.status, "smuggled payment fields must not change the buyer-interest outcome");
    assert.equal(hostile.status, 200);
    assertNoPaidReflection(JSON.stringify(hostile.body), "buyer-interest");
    assert.equal(hits.length, 2);
    for (const packet of hits) assertWebhookPacketClean(packet, "buyer-interest");
  });
});

test("Mechanic Match smuggled payment fields are stripped (same outcome, no paid reflection, clean webhook)", async () => {
  await withPaymentSpoofWebhookServer(async (origin, hits) => {
    const clean = await postSpoofJson(origin, "/api/mechanic-match/request", validMechanicMatch());
    const hostile = await postSpoofJson(origin, "/api/mechanic-match/request", { ...validMechanicMatch(), ...HOSTILE_PAYMENT_FIELDS });
    assert.equal(hostile.status, clean.status, "smuggled payment fields must not change the mechanic-match outcome");
    assert.equal(hostile.status, 200);
    assertNoPaidReflection(JSON.stringify(hostile.body), "mechanic-match");
    assert.equal(hits.length, 2);
    for (const packet of hits) assertWebhookPacketClean(packet, "mechanic-match");
  });
});

test("concierge smuggled payment fields are stripped (same outcome, no paid reflection, clean webhook)", async () => {
  await withPaymentSpoofWebhookServer(async (origin, hits) => {
    const clean = await postSpoofJson(origin, "/api/support/concierge-request", validConcierge());
    const hostile = await postSpoofJson(origin, "/api/support/concierge-request", { ...validConcierge(), ...HOSTILE_PAYMENT_FIELDS });
    assert.equal(hostile.status, clean.status, "smuggled payment fields must not change the concierge outcome");
    assert.equal(hostile.status, 200);
    assertNoPaidReflection(JSON.stringify(hostile.body), "concierge");
    assert.equal(hits.length, 2);
    for (const packet of hits) assertWebhookPacketClean(packet, "concierge");
  });
});
