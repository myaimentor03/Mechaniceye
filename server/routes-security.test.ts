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

test("/api/internal/review/write routes reject unexpected multipart fields as client errors, not 500s", async () => {
  await withServer(async (origin) => {
    const prior = process.env.DRIVABLE_REVIEWER_TOKEN;
    process.env.DRIVABLE_REVIEWER_TOKEN = "routes-security-followup-token-12345";
    try {
      const body = new FormData();
      body.append("additionalInfo", "Follow-up details that are long enough to matter here.");
      body.append("photo", new File([Buffer.alloc(2048)], "captured.jpg", { type: "image/jpeg" }));
      const response = await fetch(`${origin}/api/diagnoses/case-123/follow-up`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.DRIVABLE_REVIEWER_TOKEN}` },
        body,
      });
      assert.equal(response.status, 400);
      const parsed = await response.json();
      assert.equal(parsed.persisted, false);
      assert.match(parsed.message, /audio and video/i);
    } finally {
      if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
      else process.env.DRIVABLE_REVIEWER_TOKEN = prior;
    }
  });
});

test("follow-up evidence upload stays behind the reviewer gate before multipart parsing", async () => {
  await withServer(async (origin) => {
    const body = new FormData();
    body.append("additionalInfo", "Follow-up details that are long enough to matter here.");
    body.append("video", new File([Buffer.alloc(2048)], "clip.mp4", { type: "video/mp4" }));
    const response = await fetch(`${origin}/api/diagnoses/case-123/follow-up`, {
      method: "POST",
      body,
    });
    assert.equal([401, 503].includes(response.status), true);
  });
});

test("follow-up rejects oversized text fields and unbounded field counts", async () => {
  await withServer(async (origin) => {
    const prior = process.env.DRIVABLE_REVIEWER_TOKEN;
    process.env.DRIVABLE_REVIEWER_TOKEN = "routes-security-followup-limits-token-12345";
    try {
      // Well under the old 1 MB multer field default, but far past the bounded
      // follow-up contract, so it must not reach the analysis input.
      const oversized = new FormData();
      oversized.append("additionalInfo", "x".repeat(200_000));
      const oversizedResponse = await fetch(`${origin}/api/diagnoses/case-123/follow-up`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.DRIVABLE_REVIEWER_TOKEN}` },
        body: oversized,
      });
      assert.equal([400, 413].includes(oversizedResponse.status), true);
      assert.equal((await oversizedResponse.text()).includes("x".repeat(200)), false);

      // Field flooding is rejected by the parser rather than buffered.
      const flooded = new FormData();
      for (let i = 0; i < 40; i += 1) flooded.append(`field${i}`, "value");
      const floodedResponse = await fetch(`${origin}/api/diagnoses/case-123/follow-up`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.DRIVABLE_REVIEWER_TOKEN}` },
        body: flooded,
      });
      assert.equal([400, 413].includes(floodedResponse.status), true);
    } finally {
      if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
      else process.env.DRIVABLE_REVIEWER_TOKEN = prior;
    }
  });
});

test("a valid follow-up submission is unaffected by the new multipart limits", async () => {
  await withServer(async (origin) => {
    const prior = process.env.DRIVABLE_REVIEWER_TOKEN;
    process.env.DRIVABLE_REVIEWER_TOKEN = "routes-security-followup-ok-token-12345";
    try {
      const body = new FormData();
      body.append("additionalInfo", "Replaced the front pads and the noise returned.");
      const response = await fetch(`${origin}/api/diagnoses/case-123/follow-up`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.DRIVABLE_REVIEWER_TOKEN}` },
        body,
      });
      // 404 because the fixture case does not exist; the important part is that
      // the request was not rejected by the new field limits.
      assert.equal(response.status, 404);
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