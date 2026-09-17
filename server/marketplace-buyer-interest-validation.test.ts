import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #8 Buyer Check).
 *
 * The marketplace buyer-interest intake previously accepted any non-empty
 * string for buyerEmail, buyerPhone, listingUrl, and message, so junk Buyer
 * Check requests (email "not-an-email", phone "abc", listingUrl "not-a-url")
 * passed validation and were forwarded toward review. These HTTP-level
 * regression tests pin fail-closed server-side validation: malformed buyer
 * intakes get 400 with field names only (no PII echo), while a valid intake
 * still passes validation and fails closed with 502 when the master webhook
 * is unconfigured.
 */

const S3_VARS = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
  "MASTER_INTAKE_WEBHOOK_URL",
] as const;

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

async function postIntake(origin: string, body: unknown) {
  const response = await fetch(`${origin}/api/marketplace/buyer-interest`, {
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
  return { status: response.status, body: parsed, text };
}

test("valid Buyer Check interest passes validation and fails closed without webhook (502)", async () => {
  await withServer(async (origin) => {
    const { status } = await postIntake(origin, validBuyerInterest());
    assert.equal(status, 502);
  });
});

test("valid Buyer Check interest without optional listingUrl still passes validation (502)", async () => {
  await withServer(async (origin) => {
    const body = validBuyerInterest() as Record<string, unknown>;
    delete body.listingUrl;
    const { status } = await postIntake(origin, body);
    assert.equal(status, 502);
  });
});

test("Buyer Check interest rejects malformed buyer email", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validBuyerInterest({ buyerEmail: "not-an-email" }));
    assert.equal(status, 400);
    assert.ok(Array.isArray(body.invalidFields));
    assert.ok((body.invalidFields as string[]).includes("buyerEmail"));
  });
});

test("Buyer Check interest rejects undiallable buyer phone", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validBuyerInterest({ buyerPhone: "abc" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("buyerPhone"));
  });
});

test("Buyer Check interest rejects malformed listing URL", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validBuyerInterest({ listingUrl: "not-a-url" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("listingUrl"));
  });
});

test("Buyer Check interest rejects non-http listing URL scheme", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(
      origin,
      validBuyerInterest({ listingUrl: "ftp://files.example.test/listing" }),
    );
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("listingUrl"));
  });
});

test("Buyer Check interest rejects oversized message", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validBuyerInterest({ message: "x".repeat(4001) }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("message"));
  });
});

test("Buyer Check interest rejects oversized buyer name", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validBuyerInterest({ buyerName: "x".repeat(161) }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("buyerName"));
  });
});

test("Buyer Check invalid-field errors never echo submitted PII values", async () => {
  await withServer(async (origin) => {
    const marker = "PiiBuyerProbeQaXy99@example.test";
    const { status, text } = await postIntake(
      origin,
      validBuyerInterest({ buyerEmail: marker, listingUrl: "not-a-url" }),
    );
    assert.equal(status, 400);
    assert.ok(!text.includes(marker), "error response must list field names, not submitted values");
  });
});

test("Buyer Check empty intake still reports missing required fields", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, {});
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Missing required fields/);
  });
});
