import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

async function withServer(work: (origin: string) => Promise<void>) {
  const { registerRoutes } = await import("../routes.js");
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${(address as any).port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("GET /api/commerce/offers exposes the server-priced launch catalog without auth", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/commerce/offers`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = (await response.json()) as {
      ok: boolean;
      offers: Array<{
        offerId: string;
        offerVersion: string;
        label: string;
        amountMinor: number;
        currency: string;
      }>;
    };
    assert.equal(body.ok, true);
    assert.equal(body.offers.length, 5);

    const byId = new Map(body.offers.map((offer) => [offer.offerId, offer]));
    assert.equal(byId.get("buyer_precheck")?.amountMinor, 1900);
    assert.equal(byId.get("buyer_check_full")?.amountMinor, 3900);
    assert.equal(byId.get("clearsale_evidence_pack")?.amountMinor, 1900);
    assert.equal(byId.get("featured_clearsale_listing")?.amountMinor, 1500);
    assert.equal(byId.get("human_pro_review")?.amountMinor, 9900);

    for (const offer of body.offers) {
      assert.ok(offer.amountMinor > 0);
      assert.match(offer.currency, /^[A-Z]{3}$/);
      assert.deepEqual(Object.keys(offer).sort(), [
        "amountMinor",
        "currency",
        "label",
        "offerId",
        "offerVersion",
      ]);
    }
  });
});

test("GET /api/commerce/offers catalog matches order-creation pricing", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/commerce/offers`);
    const body = (await response.json()) as {
      offers: Array<{ offerId: string; amountMinor: number; currency: string }>;
    };
    const precheck = body.offers.find((offer) => offer.offerId === "buyer_precheck");
    assert.ok(precheck);
    // Client-priced or free concepts must never appear in the catalog:
    // a zero-amount offer can never become a commerce order.
    assert.ok(!body.offers.some((offer) => offer.offerId === "free_tier"));
    assert.equal(precheck!.amountMinor, 1900);
    assert.equal(precheck!.currency, "USD");
  });
});
