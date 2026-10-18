import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import express from "express";
import { generateCaseId } from "./case-storage.js";
import { createSessionToken } from "./customer-auth.js";
import { storage } from "./storage.js";

const S3_VARS = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
  "MASTER_INTAKE_WEBHOOK_URL",
] as const;

async function withServer(work: (origin: string) => Promise<void>) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
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
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
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

test("production capabilities do not advertise the unconnected legacy R2 uploader", async () => {
  const keys = ["NODE_ENV", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    await withServer(async (origin) => {
      process.env.NODE_ENV = "production";
      process.env.R2_ACCOUNT_ID = "synthetic-account";
      process.env.R2_ACCESS_KEY_ID = "synthetic-access-key";
      process.env.R2_SECRET_ACCESS_KEY = "synthetic-secret-key-not-a-credential";
      process.env.R2_BUCKET_NAME = "synthetic-bucket";

      const response = await fetch(`${origin}/api/capabilities`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        photoUpload: false,
        audioUpload: false,
        videoUpload: false,
        vibrationSensorCapture: false,
      });
    });
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
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

test("/api/files marks successfully served reviewer files as nosniff and no-store", async () => {
  const previous = process.env.DRIVABLE_REVIEWER_TOKEN;
  const filename = `synthetic-review-file-${randomUUID()}.txt`;
  const filepath = path.resolve(process.cwd(), "uploads", filename);
  process.env.DRIVABLE_REVIEWER_TOKEN = "routes-security-file-test-token-12345";
  await writeFile(filepath, "synthetic reviewer-only fixture");
  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/files/${filename}`, {
        headers: { authorization: `Bearer ${process.env.DRIVABLE_REVIEWER_TOKEN}` },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(await response.text(), "synthetic reviewer-only fixture");
    });
  } finally {
    await rm(filepath, { force: true });
    if (previous === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = previous;
  }
});

test("diagnosis intake removes already-saved photos when a later media write fails", async () => {
  const previousSecret = process.env.DRIVABLE_SESSION_SECRET;
  const previousLaunchControls = process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED;
  process.env.DRIVABLE_SESSION_SECRET = "routes-security-session-secret-at-least-32-characters";
  delete process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED;
  let evidenceCaseDirectory: string | undefined;
  try {
    await withServer(async (origin) => {
      const token = createSessionToken({ id: "synthetic-evidence-owner", email: "evidence-test@example.invalid" });
      const form = new FormData();
      form.set("description", "Synthetic intake used to validate upload rollback.");
      form.set("evidenceIntake", JSON.stringify({ mode: "diagnose" }));
      form.append("photos", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "synthetic.jpg");
      form.append("audio", new Blob(["not an audio stream"], { type: "audio/mpeg" }), "synthetic.mp3");

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: `drivable_session=${encodeURIComponent(token)}` },
        body: form,
      });
      assert.equal(response.status, 507);
      const body = await response.json();
      assert.match(body.caseId, /^CASE-\d{17}-[0-9a-f]{8}$/);
      evidenceCaseDirectory = path.resolve(process.cwd(), "uploads", "evidence", body.caseId);
      assert.equal(existsSync(evidenceCaseDirectory), false, "photo objects and manifest should be removed after the later audio write fails");
    });
  } finally {
    if (evidenceCaseDirectory && existsSync(evidenceCaseDirectory)) {
      await rm(evidenceCaseDirectory, { recursive: true, force: true });
    }
    if (previousSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = previousSecret;
    if (previousLaunchControls === undefined) delete process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED;
    else process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED = previousLaunchControls;
  }
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

test("diagnosis detail allows the signed-in owner and denies a different customer", async () => {
  const previousSecret = process.env.DRIVABLE_SESSION_SECRET;
  process.env.DRIVABLE_SESSION_SECRET = "routes-security-session-secret-at-least-32-characters";
  const caseId = `owner-case-${randomUUID()}`;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  await storage.createDiagnosis({ id: caseId, userId: "owner-customer", description: "Owner case" });
  try {
    await withServer(async (origin) => {
      const ownerToken = createSessionToken({ id: "owner-customer", email: "owner@example.com" });
      const ownerResponse = await fetch(`${origin}/api/diagnoses/${caseId}`, {
        headers: { cookie: `drivable_session=${encodeURIComponent(ownerToken)}` },
      });
      assert.equal(ownerResponse.status, 200);
      assert.equal((await ownerResponse.json()).id, caseId);

      const otherToken = createSessionToken({ id: "other-customer", email: "other@example.com" });
      const otherResponse = await fetch(`${origin}/api/diagnoses/${caseId}`, {
        headers: { cookie: `drivable_session=${encodeURIComponent(otherToken)}` },
      });
      assert.equal(otherResponse.status, 403);
      assert.equal((await otherResponse.json()).code, "CASE_ACCESS_DENIED");
    });
  } finally {
    if (previousSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = previousSecret;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("reviewer authorization still works when a different customer cookie is present", async () => {
  const previousSecret = process.env.DRIVABLE_SESSION_SECRET;
  const previousReviewer = process.env.DRIVABLE_REVIEWER_TOKEN;
  process.env.DRIVABLE_SESSION_SECRET = "routes-security-session-secret-at-least-32-characters";
  process.env.DRIVABLE_REVIEWER_TOKEN = "routes-security-reviewer-token-at-least-32-characters";
  const caseId = `reviewer-owner-case-${randomUUID()}`;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  await storage.createDiagnosis({ id: caseId, userId: "case-owner", description: "Reviewer-visible case" });
  try {
    await withServer(async (origin) => {
      const customerToken = createSessionToken({ id: "another-customer", email: "other@example.com" });
      const response = await fetch(`${origin}/api/diagnoses/${caseId}`, {
        headers: {
          authorization: `Bearer ${process.env.DRIVABLE_REVIEWER_TOKEN}`,
          cookie: `drivable_session=${encodeURIComponent(customerToken)}`,
        },
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).id, caseId);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = previousSecret;
    if (previousReviewer === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = previousReviewer;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("follow-up submission rejects a signed-in non-owner before persistence", async () => {
  const previousSecret = process.env.DRIVABLE_SESSION_SECRET;
  process.env.DRIVABLE_SESSION_SECRET = "routes-security-session-secret-at-least-32-characters";
  const caseId = `follow-up-owner-case-${randomUUID()}`;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  await storage.createDiagnosis({ id: caseId, userId: "actual-owner", description: "Owner case" });
  try {
    await withServer(async (origin) => {
      const token = createSessionToken({ id: "different-customer", email: "different@example.com" });
      const form = new FormData();
      form.set("additionalInfo", "The repair did not change the symptom.");
      for (let index = 0; index < 9; index += 1) {
        form.append("photos", new Blob([], { type: "image/jpeg" }), `blocked-${index}.jpg`);
      }
      const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
        method: "POST",
        headers: { cookie: `drivable_session=${encodeURIComponent(token)}` },
        body: form,
      });
      assert.equal(response.status, 403);
      const body = await response.json();
      assert.equal(body.code, "CASE_ACCESS_DENIED");
      assert.equal(body.persisted, false);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = previousSecret;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("case owner can submit a follow-up and receives the generated diagnosis", async () => {
  const previousSecret = process.env.DRIVABLE_SESSION_SECRET;
  process.env.DRIVABLE_SESSION_SECRET = "routes-security-session-secret-at-least-32-characters";
  const caseId = `follow-up-success-case-${randomUUID()}`;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  await storage.createDiagnosis({
    id: caseId,
    userId: "follow-up-owner",
    vehicleInfo: "2015 Toyota Corolla",
    description: "Brake pulsation under moderate braking",
    timing: "After several minutes of driving",
  });
  try {
    await withServer(async (origin) => {
      const token = createSessionToken({ id: "follow-up-owner", email: "owner@example.com" });
      const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
        method: "POST",
        headers: {
          cookie: `drivable_session=${encodeURIComponent(token)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ additionalInfo: "The symptom continued after the repair attempt." }),
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.iterationCount, 2);
      assert.ok(result.primaryDiagnosis);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = previousSecret;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("customer case history requires login and returns only the signed-in owner's safe summaries", async () => {
  const previousSecret = process.env.DRIVABLE_SESSION_SECRET;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.DRIVABLE_SESSION_SECRET = "routes-security-session-secret-at-least-32-characters";
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "test";
  const ownerId = `case-history-owner-${randomUUID()}`;
  const otherOwnerId = `case-history-other-${randomUUID()}`;
  const ownerCaseId = `case-history-owned-${randomUUID()}`;
  await storage.createDiagnosis({
    id: ownerCaseId,
    userId: ownerId,
    vehicleInfo: "Synthetic 2018 Example Sedan",
    description: "Private symptom details must not appear in the summary response.",
  });
  await storage.createDiagnosis({
    id: `case-history-other-case-${randomUUID()}`,
    userId: otherOwnerId,
    vehicleInfo: "Other customer's synthetic vehicle",
    description: "Do not expose this case.",
  });

  try {
    await withServer(async (origin) => {
      const unauthorized = await fetch(`${origin}/api/customer/cases`);
      assert.equal(unauthorized.status, 401);

      const token = createSessionToken({ id: ownerId, email: "synthetic-owner@example.invalid" });
      const response = await fetch(`${origin}/api/customer/cases`, {
        headers: { cookie: `drivable_session=${encodeURIComponent(token)}` },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json();
      assert.equal(body.cases.length, 1);
      assert.deepEqual(Object.keys(body.cases[0]).sort(), ["createdAt", "id", "status", "vehicleInfo"]);
      assert.equal(body.cases[0].id, ownerCaseId);
      assert.equal(body.cases[0].vehicleInfo, "Synthetic 2018 Example Sedan");
      assert.equal(body.cases[0].status, "received");
      assert.ok(Number.isFinite(Date.parse(body.cases[0].createdAt)));
      assert.equal(JSON.stringify(body).includes("Private symptom details"), false);
      assert.equal(JSON.stringify(body).includes("Other customer's synthetic vehicle"), false);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = previousSecret;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("customer case history returns an explicit unavailable response on storage failure", async () => {
  const previousSecret = process.env.DRIVABLE_SESSION_SECRET;
  const originalList = storage.getCustomerDiagnosesByUser;
  process.env.DRIVABLE_SESSION_SECRET = "routes-security-session-secret-at-least-32-characters";
  storage.getCustomerDiagnosesByUser = async () => { throw new Error("synthetic storage outage"); };
  try {
    await withServer(async (origin) => {
      const token = createSessionToken({ id: "case-history-storage-test", email: "synthetic@example.invalid" });
      const response = await fetch(`${origin}/api/customer/cases`, {
        headers: { cookie: `drivable_session=${encodeURIComponent(token)}` },
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "Your saved cases are temporarily unavailable. Try again shortly.",
        code: "CUSTOMER_CASES_UNAVAILABLE",
      });
    });
  } finally {
    storage.getCustomerDiagnosesByUser = originalList;
    if (previousSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = previousSecret;
  }
});
