import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #7 ClearSale).
 *
 * The ClearSale seller intake previously accepted any non-empty string for
 * vehicleYear, sellerEmail, sellerPhone, mileage, askingPrice, and zip, so
 * junk listings (year "abcd", email "not-an-email", negative price) passed
 * validation and were forwarded toward automatic listing/review. These
 * HTTP-level regression tests pin fail-closed server-side validation:
 * malformed seller intakes get 400 with field names only (no PII echo),
 * while a valid intake still passes validation and fails closed with 502
 * when the master webhook is unconfigured.
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

async function postIntake(origin: string, body: unknown) {
  const response = await fetch(`${origin}/api/marketplace/seller-intake`, {
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

test("valid ClearSale intake passes validation and fails closed without webhook (502)", async () => {
  await withServer(async (origin) => {
    const { status } = await postIntake(origin, validSellerIntake());
    assert.equal(status, 502);
  });
});

test("valid ClearSale intake accepts formatted mileage and price", async () => {
  await withServer(async (origin) => {
    const { status } = await postIntake(
      origin,
      validSellerIntake({ mileage: "142,100", askingPrice: "$7,450" }),
    );
    assert.equal(status, 502);
  });
});

test("ClearSale intake rejects non-numeric vehicle year", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validSellerIntake({ vehicleYear: "abcd" }));
    assert.equal(status, 400);
    assert.ok(Array.isArray(body.invalidFields));
    assert.ok((body.invalidFields as string[]).includes("vehicleYear"));
  });
});

test("ClearSale intake rejects out-of-range vehicle year", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validSellerIntake({ vehicleYear: "3000" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("vehicleYear"));
  });
});

test("ClearSale intake rejects malformed seller email", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validSellerIntake({ sellerEmail: "not-an-email" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("sellerEmail"));
  });
});

test("ClearSale intake rejects undiallable seller phone", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validSellerIntake({ sellerPhone: "abc" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("sellerPhone"));
  });
});

test("ClearSale intake rejects negative mileage", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validSellerIntake({ mileage: "-5" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("mileage"));
  });
});

test("ClearSale intake rejects fractional mileage", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validSellerIntake({ mileage: "12.5" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("mileage"));
  });
});

test("ClearSale intake rejects negative asking price", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validSellerIntake({ askingPrice: "-100" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("askingPrice"));
  });
});

test("ClearSale intake rejects malformed zip", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validSellerIntake({ zip: "!!" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("zip"));
  });
});

test("ClearSale intake rejects malformed VIN without echoing it", async () => {
  await withServer(async (origin) => {
    const badVin = "1IOQ1234567890123";
    const { status, body, text } = await postIntake(origin, validSellerIntake({ vin: badVin }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("vin"));
    assert.ok(!text.includes(badVin), "error response must not echo the submitted VIN");
  });
});

test("ClearSale invalid-field errors never echo submitted PII values", async () => {
  await withServer(async (origin) => {
    const marker = "PiiProbeQaXy99@example.test";
    const { status, text } = await postIntake(origin, validSellerIntake({ sellerEmail: marker, vehicleYear: "abcd" }));
    assert.equal(status, 400);
    assert.ok(!text.includes(marker), "error response must list field names, not submitted values");
  });
});

test("ClearSale empty intake still reports missing required fields", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, {});
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Missing required fields/);
  });
});
