import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  MARKETPLACE_IDEMPOTENCY_MAX_KEYS,
  MarketplaceIdempotencyStore,
  normalizeIdempotencyKey,
} from "./marketplace-idempotency.js";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #7 ClearSale,
 * P0 #1 upload recovery, P0 #4 payment safety).
 *
 * The ClearSale / buyer-interest clients resend a stable `clientRequestId`
 * on mobile timeout retry or double-tap. Before this lock, the server
 * ignored that key: every retry created a new listing request and re-fired
 * the master-intake webhook (duplicate listings, duplicate seller emails).
 *
 * These tests pin the server-side half of the contract:
 * - same key twice -> same id, `duplicate: true`, exactly ONE webhook hit
 * - different keys -> distinct ids
 * - no key / malformed key -> still accepted (backward compatible)
 * - failed validation (400) or failed forward (502) never records the key,
 *   so fixing the form and retrying with the same key forwards exactly once
 * - seller-intake and buyer-interest namespaces never collide
 */

// ---------------------------------------------------------------------------
// Unit: key normalization
// ---------------------------------------------------------------------------

test("normalizeIdempotencyKey accepts client-generated req-style tokens", () => {
  assert.equal(normalizeIdempotencyKey("req-m3abc12-xyz987"), "req-m3abc12-xyz987");
  assert.equal(normalizeIdempotencyKey("  req-abc  "), "req-abc");
  assert.equal(normalizeIdempotencyKey("ord_123.45:ab-cd_ef"), "ord_123.45:ab-cd_ef");
});

test("normalizeIdempotencyKey rejects absent or malformed keys as no-key", () => {
  assert.equal(normalizeIdempotencyKey(undefined), null);
  assert.equal(normalizeIdempotencyKey(null), null);
  assert.equal(normalizeIdempotencyKey(123), null);
  assert.equal(normalizeIdempotencyKey(""), null);
  assert.equal(normalizeIdempotencyKey("   "), null);
  assert.equal(normalizeIdempotencyKey("../../etc/passwd"), null);
  assert.equal(normalizeIdempotencyKey("req with spaces"), null);
  assert.equal(normalizeIdempotencyKey("req;<script>"), null);
  assert.equal(normalizeIdempotencyKey("x".repeat(161)), null);
  assert.equal(normalizeIdempotencyKey("-leading-dash"), null);
});

// ---------------------------------------------------------------------------
// Unit: bounded store
// ---------------------------------------------------------------------------

test("store records and returns the accepted id per namespace", () => {
  const store = new MarketplaceIdempotencyStore();
  assert.equal(store.get("marketplace-seller-intake", "req-1"), null);
  store.record("marketplace-seller-intake", "req-1", "CASE-AAA");
  assert.equal(store.get("marketplace-seller-intake", "req-1")?.id, "CASE-AAA");
});

test("store namespaces seller intake and buyer interest separately", () => {
  const store = new MarketplaceIdempotencyStore();
  store.record("marketplace-seller-intake", "req-shared", "CASE-SELL");
  assert.equal(store.get("marketplace-buyer-interest", "req-shared"), null);
  store.record("marketplace-buyer-interest", "req-shared", "CASE-BUY");
  assert.equal(store.get("marketplace-seller-intake", "req-shared")?.id, "CASE-SELL");
  assert.equal(store.get("marketplace-buyer-interest", "req-shared")?.id, "CASE-BUY");
});

test("store evicts oldest entries past the cap", () => {
  const store = new MarketplaceIdempotencyStore(3);
  store.record("marketplace-seller-intake", "req-a", "CASE-A");
  store.record("marketplace-seller-intake", "req-b", "CASE-B");
  store.record("marketplace-seller-intake", "req-c", "CASE-C");
  assert.equal(store.size, 3);
  store.record("marketplace-seller-intake", "req-d", "CASE-D");
  assert.equal(store.size, 3);
  assert.equal(store.get("marketplace-seller-intake", "req-a"), null);
  assert.equal(store.get("marketplace-seller-intake", "req-d")?.id, "CASE-D");
});

test("default cap matches the exported production bound", () => {
  assert.equal(new MarketplaceIdempotencyStore().size, 0);
  assert.ok(MARKETPLACE_IDEMPOTENCY_MAX_KEYS >= 100, "cap must hold a realistic retry window");
});

// ---------------------------------------------------------------------------
// HTTP: end-to-end dedupe against the real routes
// ---------------------------------------------------------------------------

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

function validSellerIntake(overrides: Record<string, unknown> = {}) {
  return {
    sellerName: "Casey Seller",
    sellerEmail: "seller@example.com",
    sellerPhone: "(415) 555-0100",
    city: "San Francisco",
    state: "CA",
    zip: "94103",
    vehicleYear: "2015",
    make: "Toyota",
    model: "Corolla",
    mileage: "85000",
    askingPrice: "12000",
    titleStatus: "clean",
    runsAndDrives: "yes",
    knownIssues: "None significant",
    listingType: "private",
    acknowledgments: {
      ownerAuthorized: true,
      platformOnly: true,
      sellerResponsibilities: true,
      noGuarantee: true,
    },
    ...overrides,
  };
}

function validBuyerInterest(overrides: Record<string, unknown> = {}) {
  return {
    buyerName: "Robin Buyer",
    buyerEmail: "buyer@example.com",
    buyerPhone: "(415) 555-0100",
    preferredContactMethod: "Email",
    listingTitle: "2015 Toyota Camry LE",
    listingUrl: "https://drivablestaging.example.test/listings/sample",
    message: "Is this vehicle still available for a Buyer Check review?",
    timeline: "This weekend",
    acknowledgments: {
      platformOnly: true,
      buyerResponsibilities: true,
      noGuarantee: true,
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

test("ClearSale retry with the same clientRequestId returns the same id without re-firing the webhook", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const key = "req-qa-seller-dedupe-001";
      const first = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: key }));
      assert.equal(first.status, 200);
      assert.equal(first.body.ok, true);
      assert.equal(first.body.duplicate, false);
      assert.ok(typeof first.body.id === "string" && (first.body.id as string).length > 0);

      const second = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: key }));
      assert.equal(second.status, 200);
      assert.equal(second.body.ok, true);
      assert.equal(second.body.duplicate, true);
      assert.equal(second.body.id, first.body.id, "duplicate retry must return the ORIGINAL id");

      assert.equal(webhook.hits.length, 1, "retry must not re-fire the listing webhook");
    });
  } finally {
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    await webhook.close();
  }
});

test("ClearSale distinct clientRequestIds create distinct listings", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const first = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: "req-qa-seller-distinct-a" }));
      const second = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: "req-qa-seller-distinct-b" }));
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.notEqual(second.body.id, first.body.id);
      assert.equal(webhook.hits.length, 2);
    });
  } finally {
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    await webhook.close();
  }
});

test("buyer-interest retry with the same clientRequestId is deduped without re-firing the webhook", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const key = "req-qa-buyer-dedupe-001";
      const first = await postJson(origin, "/api/marketplace/buyer-interest", validBuyerInterest({ clientRequestId: key }));
      assert.equal(first.status, 200);
      assert.equal(first.body.duplicate, false);
      const second = await postJson(origin, "/api/marketplace/buyer-interest", validBuyerInterest({ clientRequestId: key }));
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

test("seller and buyer namespaces do not collide on the same key", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const key = "req-qa-shared-namespace-001";
      const seller = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: key }));
      const buyer = await postJson(origin, "/api/marketplace/buyer-interest", validBuyerInterest({ clientRequestId: key }));
      assert.equal(seller.status, 200);
      assert.equal(buyer.status, 200);
      assert.equal(seller.body.duplicate, false);
      assert.equal(buyer.body.duplicate, false);
      assert.notEqual(buyer.body.id, seller.body.id);
      assert.equal(webhook.hits.length, 2);
    });
  } finally {
    if (priorWebhook === undefined) delete process.env.MASTER_INTAKE_WEBHOOK_URL;
    else process.env.MASTER_INTAKE_WEBHOOK_URL = priorWebhook;
    await webhook.close();
  }
});

test("intakes without a key stay backward compatible (no duplicate flag on first write)", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const first = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake());
      assert.equal(first.status, 200);
      assert.equal(first.body.ok, true);
      assert.equal(first.body.duplicate, false);
      const malformed = await postJson(
        origin,
        "/api/marketplace/seller-intake",
        validSellerIntake({ clientRequestId: "../../evil key!" }),
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

test("failed validation never records the key, so fixing the form and retrying forwards exactly once", async () => {
  const webhook = await startWebhookStub();
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
  try {
    await withServer(async (origin) => {
      const key = "req-qa-seller-fix-and-retry-001";
      const invalid = await postJson(
        origin,
        "/api/marketplace/seller-intake",
        validSellerIntake({ clientRequestId: key, sellerEmail: "not-an-email" }),
      );
      assert.equal(invalid.status, 400);
      const fixed = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: key }));
      assert.equal(fixed.status, 200);
      assert.equal(fixed.body.duplicate, false, "first VALID submit must not be flagged duplicate");
      const retry = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: key }));
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

test("failed webhook forward (502) never records the key, so retry still delivers", async () => {
  const priorWebhook = process.env.MASTER_INTAKE_WEBHOOK_URL;
  delete process.env.MASTER_INTAKE_WEBHOOK_URL;
  const webhook = await startWebhookStub();
  try {
    await withServer(async (origin) => {
      const key = "req-qa-seller-502-retry-001";
      const failed = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: key }));
      assert.equal(failed.status, 502);
      process.env.MASTER_INTAKE_WEBHOOK_URL = webhook.url;
      const retry = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: key }));
      assert.equal(retry.status, 200);
      assert.equal(retry.body.duplicate, false, "retry after 502 must be treated as the first delivery");
      const again = await postJson(origin, "/api/marketplace/seller-intake", validSellerIntake({ clientRequestId: key }));
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
