import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { MarketplaceIdempotencyStore } from "./marketplace-idempotency.js";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #10 Mechanic
 * routing, P0 Guided Journey support, P0 #1 upload recovery).
 *
 * Mechanic Match (FIX routing) and support concierge previously had no
 * server-side idempotency: a mobile timeout retry or double-tap created a
 * second request and re-fired the master-intake webhook (duplicate mechanic
 * dispatches / duplicate support tickets and emails). ClearSale and
 * buyer-interest already had this lock; this file pins the same contract
 * for the remaining two webhook-forwarded public forms:
 * - same key twice -> same id, `duplicate: true`, exactly ONE webhook hit
 * - different keys -> distinct ids
 * - no key / malformed key -> still accepted (backward compatible)
 * - failed validation (400) or failed forward (502) never records the key,
 *   so fixing the form and retrying with the same key forwards exactly once
 * - mechanic-match and concierge namespaces never collide
 */

test("store namespaces mechanic-match and concierge separately", () => {
  const store = new MarketplaceIdempotencyStore();
  store.record("mechanic-match-request", "req-shared", "CASE-MECH");
  assert.equal(store.get("support-concierge-request", "req-shared"), null);
  store.record("support-concierge-request", "req-shared", "CASE-CONC");
  assert.equal(store.get("mechanic-match-request", "req-shared")?.id, "CASE-MECH");
  assert.equal(store.get("support-concierge-request", "req-shared")?.id, "CASE-CONC");
});

const S3_VARS = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
] as const;

async function startWebhookStub(): Promise<{ url: string; hits: unknown[]; close: () => Promise<void> }> {
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

async function withServer(work: (origin: string) => Promise<void>) {
  for (const key of S3_VARS) delete process.env[key];
  const { registerRoutes } = await import("./routes.js");
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function validMechanicMatch(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Alex Driver",
    customerEmail: "alex@example.com",
    customerPhone: "(415) 555-0100",
    city: "San Francisco",
    state: "CA",
    zip: "94103",
    vehicleYear: "2015",
    make: "Toyota",
    model: "Corolla",
    mileage: "85000",
    problemCategory: "Engine running rough",
    symptoms: "Rough idle and hesitation on acceleration, worse when cold.",
    canDrive: "Short distance only",
    urgency: "This week",
    preferredHelpType: "Repair shop",
    budgetRange: "$300-$750",
    photosOrVideoAvailable: "Can provide if requested",
    existingDiagnosisCaseId: "",
    drivableCheckUsed: "Yes",
    permissionToShareCase: "Yes",
    acknowledgments: {
      platformOnly: true,
      noGuarantee: true,
      customerResponsible: true,
    },
    ...overrides,
  };
}

function validConcierge(overrides: Record<string, unknown> = {}) {
  return {
    guideRequested: "Guided diagnosis help",
    helpTopic: "Stuck on photo upload",
    customerName: "Alex Driver",
    customerEmail: "alex@example.com",
    customerPhone: "(415) 555-0100",
    relatedCaseId: "",
    relatedListingId: "",
    currentPage: "/diagnosis",
    urgency: "Today",
    preferredContactMethod: "Email",
    message: "I am stuck uploading engine photos on mobile Safari. Please help.",
    stuckStep: "photo-upload",
    wantsHumanReview: "Yes",
    scenario: "fix_my_car",
    reportType: "diagnosis",
    topic: "photo-upload",
    sourceContext: {
      page: "/diagnosis",
      selectedScenario: null,
      selectedReportType: null,
      topic: null,
      queryParams: {},
    },
    acknowledgments: {
      aiAssistedGuide: true,
      finalVerification: true,
    },
    ...overrides,
  };
}

async function postJson(origin: string, route: string, body: unknown) {
  const response = await fetch(`${origin}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

test("Mechanic Match retry with the same clientRequestId returns the same id without re-firing the webhook", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const key = "req-qa-mech-dedupe-001";
      const first = await postJson(origin, "/api/mechanic-match/request", validMechanicMatch({ clientRequestId: key }));
      assert.equal(first.status, 200);
      assert.equal(first.body.ok, true);
      assert.equal(first.body.duplicate, false);
      assert.ok(typeof first.body.id === "string" && (first.body.id as string).length > 0);

      const second = await postJson(origin, "/api/mechanic-match/request", validMechanicMatch({ clientRequestId: key }));
      assert.equal(second.status, 200);
      assert.equal(second.body.ok, true);
      assert.equal(second.body.duplicate, true);
      assert.equal(second.body.id, first.body.id, "duplicate retry must return the ORIGINAL id");

      assert.equal(webhook.hits.length, 1, "retry must not re-fire the webhook");
    });
  } finally {
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    await webhook.close();
  }
});

test("concierge retry with the same clientRequestId is deduped without re-firing the webhook", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const key = "req-qa-conc-dedupe-001";
      const first = await postJson(origin, "/api/support/concierge-request", validConcierge({ clientRequestId: key }));
      assert.equal(first.status, 200);
      assert.equal(first.body.duplicate, false);
      const second = await postJson(origin, "/api/support/concierge-request", validConcierge({ clientRequestId: key }));
      assert.equal(second.status, 200);
      assert.equal(second.body.duplicate, true);
      assert.equal(second.body.id, first.body.id);
      assert.equal(webhook.hits.length, 1);
    });
  } finally {
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    await webhook.close();
  }
});

test("mechanic and concierge namespaces do not collide on the same key", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const key = "req-qa-mech-conc-shared-001";
      const mech = await postJson(origin, "/api/mechanic-match/request", validMechanicMatch({ clientRequestId: key }));
      const conc = await postJson(origin, "/api/support/concierge-request", validConcierge({ clientRequestId: key }));
      assert.equal(mech.status, 200);
      assert.equal(conc.status, 200);
      assert.equal(mech.body.duplicate, false);
      assert.equal(conc.body.duplicate, false);
      assert.notEqual(conc.body.id, mech.body.id);
      assert.equal(webhook.hits.length, 2);
    });
  } finally {
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    await webhook.close();
  }
});

test("mechanic intakes without a key stay backward compatible", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const first = await postJson(origin, "/api/mechanic-match/request", validMechanicMatch());
      assert.equal(first.status, 200);
      assert.equal(first.body.ok, true);
      assert.equal(first.body.duplicate, false);
      const malformed = await postJson(
        origin,
        "/api/mechanic-match/request",
        validMechanicMatch({ clientRequestId: "../../evil key!" }),
      );
      assert.equal(malformed.status, 200, "malformed key must be treated as absent, not rejected");
      assert.equal(malformed.body.duplicate, false);
      assert.equal(webhook.hits.length, 2);
    });
  } finally {
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    await webhook.close();
  }
});

test("mechanic failed validation never records the key, so fixing the form and retrying forwards exactly once", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const key = "req-qa-mech-fix-and-retry-001";
      const invalid = await postJson(
        origin,
        "/api/mechanic-match/request",
        validMechanicMatch({ clientRequestId: key, customerEmail: "not-an-email" }),
      );
      assert.equal(invalid.status, 400);
      const fixed = await postJson(origin, "/api/mechanic-match/request", validMechanicMatch({ clientRequestId: key }));
      assert.equal(fixed.status, 200);
      assert.equal(fixed.body.duplicate, false, "first VALID submit must not be flagged duplicate");
      const retry = await postJson(origin, "/api/mechanic-match/request", validMechanicMatch({ clientRequestId: key }));
      assert.equal(retry.status, 200);
      assert.equal(retry.body.duplicate, true);
      assert.equal(retry.body.id, fixed.body.id);
      assert.equal(webhook.hits.length, 1, "only the valid submit may fire the webhook");
    });
  } finally {
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    await webhook.close();
  }
});

test("concierge failed webhook forward (502) never records the key, so retry still delivers", async () => {
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  delete process.env.MASTER_INTAKE_WEBHOOK_URL;
  const webhook = await startWebhookStub();
  try {
    await withServer(async (origin) => {
      const key = "req-qa-conc-502-retry-001";
      const failed = await postJson(origin, "/api/support/concierge-request", validConcierge({ clientRequestId: key }));
      assert.equal(failed.status, 502);
      process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
      const retry = await postJson(origin, "/api/support/concierge-request", validConcierge({ clientRequestId: key }));
      assert.equal(retry.status, 200);
      assert.equal(retry.body.duplicate, false, "retry after 502 must be treated as the first delivery");
      const again = await postJson(origin, "/api/support/concierge-request", validConcierge({ clientRequestId: key }));
      assert.equal(again.body.duplicate, true);
      assert.equal(again.body.id, retry.body.id);
      assert.equal(webhook.hits.length, 1);
    });
  } finally {
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    await webhook.close();
  }
});
