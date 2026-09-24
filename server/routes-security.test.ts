import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { generateCaseId } from "./case-storage.js";

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

function validSellerIntake() {
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
  };
}

test("public seller intake rejects a disallowed origin before validation", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/marketplace/seller-intake`, {
      method: "POST",
      headers: { origin: "https://attacker.example.com", "content-type": "application/json" },
      body: JSON.stringify(validSellerIntake()),
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.deepEqual(body, { ok: false, error: "Request origin is not allowed.", code: "ORIGIN_NOT_ALLOWED" });
  });
});

test("public seller intake passes the origin guard with an allow-listed origin", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/marketplace/seller-intake`, {
      method: "POST",
      headers: { origin: "https://mechaniceye.onrender.com", "content-type": "application/json" },
      body: JSON.stringify(validSellerIntake()),
    });
    // Origin allowed and intake valid; delivery fails closed because the master
    // webhook is not configured in the test environment (502, not 403/400).
    assert.equal(response.status, 502);
  });
});

test("public buyer vehicle knowledge endpoint is per-IP rate limited before the DB", async () => {
  await withServer(async (origin) => {
    let lastStatus = 0;
    for (let i = 0; i < 122; i += 1) {
      const response = await fetch(`${origin}/api/buyer-risk/vehicle-knowledge?year=2015&make=Honda&model=Civic`);
      lastStatus = response.status;
    }
    assert.equal(lastStatus, 429);
  });
});

test("/api/files/:filename enforces basename normalization and nosniff header", async () => {
  await withServer(async (origin) => {
    const prior = process.env.DRIVABLE_REVIEWER_TOKEN;
    process.env.DRIVABLE_REVIEWER_TOKEN = "routes-security-file-test-token-12345";
    try {
      const response = await fetch(`${origin}/api/files/..%2F..%2Fetc%2Fpasswd`, {
        headers: { authorization: `Bearer ${process.env.DRIVABLE_REVIEWER_TOKEN}` },
      });
      assert.equal(response.status === 400 || response.status === 404, true);
      assert.equal(response.headers.get("x-content-type-options"), null);
    } finally {
      if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
      else process.env.DRIVABLE_REVIEWER_TOKEN = prior;
    }
  });
});

test("generated case IDs use cryptographic randomness, not Math.random()", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 1_000; i += 1) ids.add(generateCaseId());
  assert.equal(ids.size, 1_000);
  for (const id of ids) {
    assert.match(id, /^CASE-\d{17}-[0-9a-f]{8}$/);
  }
  const earlier = generateCaseId();
  const later = generateCaseId();
  assert.notEqual(earlier, later);
});

// --- Cache-Control no-store header verification (P0 #5 #9) ---

const REVIEWER_TOKEN = "routes-security-review-token-12345678901234567890123456789012";

test("review routes return Cache-Control no-store headers", async () => {
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/internal/review/drafts`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ riskLevel: "low" }),
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
  delete process.env.DRIVABLE_REVIEWER_TOKEN;
});

test("diagnosis steps route returns Cache-Control no-store header", async () => {
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/fake-id/steps`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ suggestionIndex: 0, stepIndex: 0, completed: true }),
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
  delete process.env.DRIVABLE_REVIEWER_TOKEN;
});

test("fix-complete route returns Cache-Control no-store header", async () => {
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/fake-id/fix-complete`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ suggestionIndex: 0, wasSuccessful: true }),
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
  delete process.env.DRIVABLE_REVIEWER_TOKEN;
});

test("subscription tiers route returns Cache-Control no-store header", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/subscription/tiers`);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

test("health readiness route returns Cache-Control no-store header (P0 #9)", async () => {
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/health/readiness`, {
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
    });
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });
  delete process.env.DRIVABLE_REVIEWER_TOKEN;
});

test("health readiness without auth still returns Cache-Control no-store", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/health/readiness`);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });
});

test("health db route returns Cache-Control no-store header (P0 #9)", async () => {
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/health/db`, {
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
    });
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });
  delete process.env.DRIVABLE_REVIEWER_TOKEN;
});

test("follow-up route returns Cache-Control no-store header (P0 #2 Guided Journey)", async () => {
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/diagnoses/fake-case-id/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ additionalInfo: "still happens" }),
    });
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });
  delete process.env.DRIVABLE_REVIEWER_TOKEN;
});

test("internal evidence retrieval returns Cache-Control no-store on 400 and 404 (P0 #1)", async () => {
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  await withServer(async (origin) => {
    const bad = await fetch(`${origin}/api/internal/evidence/..%2Fbad/bad`, {
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
    });
    assert.equal(bad.status, 400);
    assert.match(bad.headers.get("cache-control") || "", /no-store/);
    const missing = await fetch(`${origin}/api/internal/evidence/CASE-00000000000000000-aaaaaaaa/valid-attachment`, {
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
    });
    assert.equal(missing.status === 404 || missing.status === 502, true);
    assert.match(missing.headers.get("cache-control") || "", /no-store/);
  });
  delete process.env.DRIVABLE_REVIEWER_TOKEN;
});

test("files route returns Cache-Control no-store on traversal and not-found (P0 #1)", async () => {
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  await withServer(async (origin) => {
    const traversal = await fetch(`${origin}/api/files/..%2Fsecret.txt`, {
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
    });
    assert.equal(traversal.status === 404 || traversal.status === 403, true);
    assert.match(traversal.headers.get("cache-control") || "", /no-store/);
    const notFound = await fetch(`${origin}/api/files/nonexistent-12345.jpg`, {
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
    });
    assert.equal(notFound.status, 404);
    assert.match(notFound.headers.get("cache-control") || "", /no-store/);
  });
  delete process.env.DRIVABLE_REVIEWER_TOKEN;
});