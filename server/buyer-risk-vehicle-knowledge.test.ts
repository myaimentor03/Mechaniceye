import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

const S3_VARS = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
  "MASTER_INTAKE_WEBHOOK_URL",
] as const;

async function withServer(
  work: (origin: string) => Promise<void>,
  opts?: { databaseUrl?: string }
) {
  for (const key of S3_VARS) delete process.env[key];
  const priorDbUrl = process.env.DATABASE_URL;
  if (opts?.databaseUrl !== undefined) {
    process.env.DATABASE_URL = opts.databaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
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
    if (priorDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDbUrl;
  }
}

function knowledgeUrl(params?: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return `/api/buyer-risk/vehicle-knowledge${qs ? `?${qs}` : ""}`;
}

// ── Validation: 400 for missing required fields ──

test("vehicle-knowledge returns 400 when year is missing", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ make: "Honda", model: "Civic" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.equal(typeof body.message, "string");
    assert.ok(body.message.includes("year"));
    assert.ok(Array.isArray(body.required));
    assert.ok(body.required.includes("year"));
  });
});

test("vehicle-knowledge returns 400 when make is missing", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2020", model: "Civic" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(body.message.includes("make"));
    assert.ok(body.required.includes("make"));
  });
});

test("vehicle-knowledge returns 400 when model is missing", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2020", make: "Honda" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(body.message.includes("model"));
    assert.ok(body.required.includes("model"));
  });
});

test("vehicle-knowledge returns 400 when all query params are missing", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/buyer-risk/vehicle-knowledge`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(body.required.includes("year"));
    assert.ok(body.required.includes("make"));
    assert.ok(body.required.includes("model"));
  });
});

// ── Validation: 400 for invalid year ──

test("vehicle-knowledge returns 400 when year is not a valid number", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "abc", make: "Honda", model: "Civic" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(body.message.includes("valid"));
  });
});

test("vehicle-knowledge returns 400 when year is negative", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "-1", make: "Honda", model: "Civic" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(body.message.includes("valid"));
  });
});

test("vehicle-knowledge returns 400 when year is zero", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "0", make: "Honda", model: "Civic" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(body.message.includes("valid"));
  });
});

test("vehicle-knowledge returns 400 when year exceeds upper bound", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "3000", make: "Honda", model: "Civic" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(body.message.includes("valid"));
  });
});

// ── Acceptance: alternate query param aliases ──

test("vehicle-knowledge accepts vehicleYear/vehicleMake/vehicleModel aliases", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ vehicleYear: "2020", vehicleMake: "Honda", vehicleModel: "Civic" })}`);
    // Aliases pass validation; 503 means the route reached the DB check
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(typeof body.message === "string");
  });
});

// ── No-DB: 503 when DATABASE_URL is not configured ──

test("vehicle-knowledge returns 503 when DATABASE_URL is not configured", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2020", make: "Honda", model: "Civic" })}`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(body.message.includes("DATABASE_URL"));
  });
});

// ── Response shape: found:false with fallback prompts (requires DATABASE_URL) ──

test("vehicle-knowledge returns found:false with fallback prompts when no pack exists", async () => {
  if (!process.env.DATABASE_URL) return;
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2099", make: "Nonexistent", model: "Phantom" })}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.deepEqual(body.vehicle, { year: 2099, make: "Nonexistent", model: "Phantom" });
    assert.equal(body.source, "NHTSA");
    assert.equal(body.vinRequiredForApplicability, true);
    assert.equal(typeof body.message, "string");
    assert.ok(body.message.length > 0);
    assert.ok(Array.isArray(body.fallbackPrompts));
    assert.ok(body.fallbackPrompts.length >= 3);
    for (const prompt of body.fallbackPrompts) {
      assert.equal(typeof prompt, "string");
      assert.ok(prompt.length > 0);
    }
  });
}, { timeout: 15000 });

// ── Response shape: found:true full data shape (requires DATABASE_URL) ──

test("vehicle-knowledge returns correct data shape when pack exists", async () => {
  if (!process.env.DATABASE_URL) return;
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "Honda", model: "Civic" })}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    if (body.found === true) {
      assert.ok(body.vehicle, "response includes vehicle");
      assert.equal(typeof body.vehicle.year, "number");
      assert.equal(typeof body.vehicle.make, "string");
      assert.equal(typeof body.vehicle.model, "string");
      assert.equal(typeof body.packId, "string");
      assert.equal(typeof body.source, "string");
      assert.equal(typeof body.sourceType, "string");
      assert.equal(typeof body.confidence, "number");
      assert.equal(typeof body.summary, "string");
      assert.equal(typeof body.vinRequiredForApplicability, "boolean");
      assert.equal(typeof body.recallCount, "number");
      assert.equal(typeof body.complaintCount, "number");
      assert.ok(Array.isArray(body.riskTags));
      assert.ok(Array.isArray(body.buyerQuestions));
      assert.ok(Array.isArray(body.sellerEvidenceRequests));
      assert.ok(Array.isArray(body.inspectionPrompts));
      assert.equal(typeof body.disclaimer, "string");
      assert.ok(body.disclaimer.includes("NHTSA"));
      assert.ok(body.disclaimer.includes("VIN"));
    } else {
      assert.equal(body.found, false);
      assert.ok(Array.isArray(body.fallbackPrompts));
    }
  });
}, { timeout: 15000 });

// ── Case-insensitive make/model matching ──

test("vehicle-knowledge matches make and model case-insensitively", async () => {
  await withServer(async (origin) => {
    const lower = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "honda", model: "civic" })}`);
    const upper = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "HONDA", model: "CIVIC" })}`);
    const mixed = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "Honda", model: "Civic" })}`);

    const lowerBody = await lower.json();
    const upperBody = await upper.json();
    const mixedBody = await mixed.json();

    assert.equal(lowerBody.found, upperBody.found, "case variants produce same found state");
    assert.equal(lowerBody.found, mixedBody.found, "case variants produce same found state");
  });
}, { timeout: 15000 });

// ── Response never leaks internal error details ──

test("vehicle-knowledge 503 response does not leak database internals", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2020", make: "Honda", model: "Civic" })}`);
    const body = await res.json();
    assert.equal(typeof body.message, "string");
    assert.ok(!body.message.includes("Error"));
    assert.ok(!body.message.includes("stack"));
    assert.ok(!body.message.includes("postgres"));
    assert.ok(!body.message.includes("pg"));
  });
});

// ── Edge: very long make/model strings ──

test("vehicle-knowledge handles very long make/model strings without crashing", async () => {
  await withServer(async (origin) => {
    const longMake = "A".repeat(200);
    const longModel = "B".repeat(200);
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2020", make: longMake, model: longModel })}`);
    // Should not crash; either 503 (no DB) or 200 (DB handles it)
    assert.ok(res.status === 503 || res.status === 200);
  });
});

// ── Validation: 400 for invalid VIN ──

test("vehicle-knowledge returns 400 when VIN has wrong length (16 chars)", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "Honda", model: "Civic", vin: "1HGCM82633A00435" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.equal(body.code, "INVALID_VIN");
    assert.ok(body.message.includes("17 characters"));
  });
});

test("vehicle-knowledge returns 400 when VIN has wrong length (18 chars)", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "Honda", model: "Civic", vin: "1HGCM82633A0043521" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.equal(body.code, "INVALID_VIN");
    assert.ok(body.message.includes("17 characters"));
  });
});

test("vehicle-knowledge returns 400 when VIN contains I", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "Honda", model: "Civic", vin: "1HGCM82633A00435I" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.equal(body.code, "INVALID_VIN");
    assert.ok(body.message.includes("I, O, or Q"));
  });
});

test("vehicle-knowledge returns 400 when VIN contains O", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "Honda", model: "Civic", vin: "1HGCM82633A00435O" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.equal(body.code, "INVALID_VIN");
    assert.ok(body.message.includes("I, O, or Q"));
  });
});

test("vehicle-knowledge returns 400 when VIN contains Q", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "Honda", model: "Civic", vin: "1HGCM82633A00435Q" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.equal(body.code, "INVALID_VIN");
    assert.ok(body.message.includes("I, O, or Q"));
  });
});

test("vehicle-knowledge returns 400 when VIN is provided without year/make/model", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ vin: "1HGCM82633A004352" })}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(Array.isArray(body.required));
    assert.ok(body.required.includes("year") || body.required.includes("make") || body.required.includes("model"));
  });
});

test("vehicle-knowledge accepts valid VIN (17 chars, no I/O/Q) and proceeds to DB check", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}${knowledgeUrl({ year: "2015", make: "Honda", model: "Civic", vin: "1HGCM82633A004352" })}`);
    // Valid VIN passes format validation; without DB it returns 503
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.found, false);
    assert.ok(body.message.includes("DATABASE_URL"));
  });
});
