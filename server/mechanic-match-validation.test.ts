import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #10 Mechanic routing).
 *
 * Mechanic Match intake previously accepted any non-empty string for
 * customerEmail, customerPhone, vehicleYear, zip, and mileage, so junk
 * requests (email "not-an-email", phone "abc", year "abcd", zip "!!",
 * mileage "-5") passed validation and were forwarded. These HTTP-level
 * regression tests pin fail-closed server-side validation: malformed
 * mechanic-match requests get 400 with field names only (no PII echo),
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

async function postIntake(origin: string, body: unknown) {
  const response = await fetch(`${origin}/api/mechanic-match/request`, {
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

test("valid Mechanic Match intake passes validation and fails closed without webhook (502)", async () => {
  await withServer(async (origin) => {
    const { status } = await postIntake(origin, validMechanicMatch());
    assert.equal(status, 502);
  });
});

test("valid Mechanic Match intake accepts formatted mileage", async () => {
  await withServer(async (origin) => {
    const { status } = await postIntake(origin, validMechanicMatch({ mileage: "142,100" }));
    assert.equal(status, 502);
  });
});

test("Mechanic Match rejects malformed customer email", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validMechanicMatch({ customerEmail: "not-an-email" }));
    assert.equal(status, 400);
    assert.ok(Array.isArray(body.invalidFields));
    assert.ok((body.invalidFields as string[]).includes("customerEmail"));
  });
});

test("Mechanic Match rejects undiallable customer phone", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validMechanicMatch({ customerPhone: "abc" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("customerPhone"));
  });
});

test("Mechanic Match rejects non-numeric vehicle year", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validMechanicMatch({ vehicleYear: "abcd" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("vehicleYear"));
  });
});

test("Mechanic Match rejects out-of-range vehicle year", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validMechanicMatch({ vehicleYear: "3000" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("vehicleYear"));
  });
});

test("Mechanic Match rejects malformed zip", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validMechanicMatch({ zip: "!!" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("zip"));
  });
});

test("Mechanic Match rejects negative mileage", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validMechanicMatch({ mileage: "-5" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("mileage"));
  });
});

test("Mechanic Match rejects fractional mileage", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validMechanicMatch({ mileage: "12.5" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("mileage"));
  });
});

test("Mechanic Match rejects oversized symptoms", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validMechanicMatch({ symptoms: "x".repeat(4001) }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("symptoms"));
  });
});

test("Mechanic Match rejects oversized customer name", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validMechanicMatch({ customerName: "x".repeat(161) }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("customerName"));
  });
});

test("Mechanic Match invalid-field errors never echo submitted PII values", async () => {
  await withServer(async (origin) => {
    const marker = "PiiMechanicProbeQaXy99@example.test";
    const { status, text } = await postIntake(origin, validMechanicMatch({ customerEmail: marker, vehicleYear: "abcd" }));
    assert.equal(status, 400);
    assert.ok(!text.includes(marker), "error response must list field names, not submitted values");
  });
});

test("Mechanic Match empty intake still reports missing required fields", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, {});
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Missing required fields/);
  });
});
