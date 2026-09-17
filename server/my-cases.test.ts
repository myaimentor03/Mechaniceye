import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";
import { generateCaseId } from "./case-storage.js";
import { storage, LocalStorage } from "./storage.js";
import { setStorageImpl } from "./storage.js";

// QA lane (Nov 2 paid beta): customer resume/status for mobile recovery and the
// Copy Case ID flow. The client restores a caseId from sessionStorage, but
// GET /api/diagnoses/:id is reviewer-only, so customers had no server-side way
// to verify their own case. GET /api/my-cases/:id closes that gap: customer
// session required, strict caseId shape validation, ownership enforcement, and
// enumeration-safe 404s so one customer can never read or probe another's case.

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";

const OWNER: CustomerIdentity = { id: "cust-resume-owner-1", email: "owner@example.com" };
const STRANGER: CustomerIdentity = { id: "cust-resume-stranger-1", email: "stranger@example.com" };

// Failing storage impl for testing 500 error paths
class FailingStorage extends LocalStorage {
  constructor() {
    super();
  }
  async createDiagnosis(_data: any) { throw new Error("storage unavailable"); }
  async getDiagnosis(_id: string) { throw new Error("storage unavailable"); }
  async getRecentDiagnoses() { throw new Error("storage unavailable"); }
  async getDiagnosesByOwner(_ownerId: string) { throw new Error("storage unavailable"); }
  async createFollowUp(_data: any) { throw new Error("storage unavailable"); }
  async createConsultation(_data: any) { throw new Error("storage unavailable"); }
  async getFixHistory(_id: string) { throw new Error("storage unavailable"); }
  async updateStepCompletion(_caseId: string, _step: number, _completed: boolean) { throw new Error("storage unavailable"); }
  async markFixComplete(_id: string) { throw new Error("storage unavailable"); }
  async getDiagnosesByUser() { throw new Error("storage unavailable"); }
}

function cookieFor(identity: CustomerIdentity): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withServer(
  work: (origin: string, close: () => Promise<void>) => Promise<void>
) {
  const priorSessionSecret = process.env.DRIVABLE_SESSION_SECRET;
  const priorBetaInvite = process.env.DRIVABLE_BETA_INVITE_CODE;
  process.env.DRIVABLE_SESSION_SECRET = TEST_SESSION_SECRET;
  process.env.DRIVABLE_BETA_INVITE_CODE = TEST_BETA_INVITE;

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let closed = false;
  const closeServer = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  try {
    await work(origin, closeServer);
  } finally {
    await closeServer();
    if (priorSessionSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = priorSessionSecret;
    if (priorBetaInvite === undefined) delete process.env.DRIVABLE_BETA_INVITE_CODE;
    else process.env.DRIVABLE_BETA_INVITE_CODE = priorBetaInvite;
  }
}

test("customer resume requires a customer session (401 CUSTOMER_AUTH_REQUIRED)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${generateCaseId()}`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, "CUSTOMER_AUTH_REQUIRED");
  });
});

test("customer resume rejects a reviewer bearer token (customer session required)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${generateCaseId()}`, {
      headers: { authorization: "Bearer qa-reviewer-token" },
    });
    assert.equal(response.status, 401);
  });
});

test("customer resume rejects malformed case IDs with 400 INVALID_CASE_ID", async () => {
  await withServer(async (origin) => {
    const cookie = cookieFor(OWNER);
    for (const badId of [
      "not-a-case",
      "..%2F..%2Fetc%2Fpasswd",
      "CASE-short",
      `CASE-${"9".repeat(17)}-ZZZZZZZZ`,
      `CASE-${"9".repeat(17)}-abcdefg!`,
      "x".repeat(200),
    ]) {
      const response = await fetch(`${origin}/api/my-cases/${badId}`, {
        headers: { cookie },
      });
      assert.equal(response.status, 400, `expected 400 for ${badId.slice(0, 40)}`);
      const body = await response.json();
      assert.equal(body.code, "INVALID_CASE_ID");
      assert.equal(body.persisted, false);
    }
  });
});

test("customer resume returns 404 CASE_NOT_FOUND for a well-formed but unknown case", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${generateCaseId()}`, {
      headers: { cookie: cookieFor(OWNER) },
    });
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.code, "CASE_NOT_FOUND");
    assert.equal(body.persisted, false);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });
});

test("customer resume returns own case status with a minimal payload (no description PII)", async () => {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: OWNER.id,
    vehicleInfo: "2015 Honda Civic",
    description: "Customer Email: owner@example.com\nEngine runs rough",
    timing: "Idle",
  });

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${caseId}`, {
      headers: { cookie: cookieFor(OWNER) },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.id, caseId);
    assert.ok(typeof body.status === "string" && body.status.length > 0);
    assert.ok(typeof body.createdAt === "string" && body.createdAt.length > 0);
    assert.equal(body.persisted, true);
    // Minimal resume payload: must not echo symptom/description PII.
    assert.ok(!("description" in body), "resume payload must not include description PII");
    assert.ok(!("email" in body) && !("customerEmail" in body), "resume payload must not include email PII");
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });
});

test("customer resume hides another customer's case as 404 (enumeration-safe, no PII leak)", async () => {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: OWNER.id,
    vehicleInfo: "2015 Honda Civic",
    description: "Customer Email: owner@example.com\nEngine runs rough",
  });

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${caseId}`, {
      headers: { cookie: cookieFor(STRANGER) },
    });
    assert.equal(response.status, 404);
    const text = await response.text();
    assert.equal(JSON.parse(text).code, "CASE_NOT_FOUND");
    assert.ok(!text.includes("owner@example.com"), "foreign case must not leak owner PII");
    assert.ok(!text.includes("Engine runs rough"), "foreign case must not leak symptom PII");
  });
});

test("customer resume treats an ownerless legacy case as not found (fail-closed)", async () => {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: "",
    vehicleInfo: "2012 Ford F-150",
    description: "legacy row without recorded owner",
  });

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${caseId}`, {
      headers: { cookie: cookieFor(OWNER) },
    });
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.code, "CASE_NOT_FOUND");
  });
});

test("customer case list requires a customer session (401 CUSTOMER_AUTH_REQUIRED)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, "CUSTOMER_AUTH_REQUIRED");
  });
});

test("customer case list returns an empty list for a customer with no cases", async () => {
  const fresh: CustomerIdentity = { id: "cust-list-fresh-1", email: "fresh-list@example.com" };
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases`, {
      headers: { cookie: cookieFor(fresh) },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.cases, []);
    assert.equal(body.persisted, true);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });
});

test("customer case list returns only own cases with a minimal payload (no PII/evidence leak)", async () => {
  const lister: CustomerIdentity = { id: "cust-list-owner-1", email: "lister@example.com" };
  const other: CustomerIdentity = { id: "cust-list-other-1", email: "other-list@example.com" };
  const mineA = generateCaseId();
  const mineB = generateCaseId();
  const theirs = generateCaseId();
  const legacy = generateCaseId();
  await storage.createDiagnosis({
    id: mineA,
    userId: lister.id,
    vehicleInfo: "2015 Honda Civic",
    description: "Customer Email: lister@example.com\nEngine runs rough",
    timing: "Idle",
  });
  await storage.createDiagnosis({
    id: mineB,
    userId: lister.id,
    vehicleInfo: "2018 Toyota Camry",
    description: "Customer Email: lister@example.com\nBrake squeal with photos",
    attachments: [
      {
        id: "att-list-1",
        caseId: mineB,
        kind: "photo",
        originalName: "brake.jpg",
        mimeType: "image/jpeg",
        byteSize: 2048,
        status: "persisted",
        serverAttachmentId: "srv-list-1",
        storageKey: "evidence/case-list/brake.jpg",
        createdAt: new Date().toISOString(),
        provenance: "customer_observation",
        analysisStatus: "uploaded_not_analyzed",
      },
    ],
  });
  await storage.createDiagnosis({
    id: theirs,
    userId: other.id,
    vehicleInfo: "2020 Ford Escape",
    description: "Customer Email: other-list@example.com\nTransmission slip",
  });
  await storage.createDiagnosis({
    id: legacy,
    userId: "",
    vehicleInfo: "2012 Ford F-150",
    description: "legacy row without recorded owner",
  });

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases`, {
      headers: { cookie: cookieFor(lister) },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.persisted, true);
    assert.ok(Array.isArray(body.cases));
    const ids = body.cases.map((entry: { id: string }) => entry.id);
    assert.ok(ids.includes(mineA), "own case A must be listed");
    assert.ok(ids.includes(mineB), "own case B must be listed");
    assert.ok(!ids.includes(theirs), "another customer's case must never be listed");
    assert.ok(!ids.includes(legacy), "ownerless legacy case must never be listed");
    for (const entry of body.cases) {
      assert.deepEqual(Object.keys(entry).sort(), ["createdAt", "id", "status"]);
    }
    const text = JSON.stringify(body);
    assert.ok(!text.includes("lister@example.com"), "list must not leak owner email PII");
    assert.ok(!text.includes("Engine runs rough"), "list must not leak symptom PII");
    assert.ok(!text.includes("brake.jpg"), "list must not leak evidence metadata");
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });
});
test("customer resume returns minimal payload for case with evidence attachments (no evidence leakage)", async () => {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: OWNER.id,
    vehicleInfo: "2015 Honda Civic",
    description: "Customer Email: owner@example.com\nEngine runs rough with photos",
    timing: "Idle",
    attachments: [
      {
        id: "att-1",
        caseId,
        kind: "photo",
        originalName: "engine.jpg",
        mimeType: "image/jpeg",
        byteSize: 1024,
        status: "persisted",
        serverAttachmentId: "srv-1",
        storageKey: "evidence/case-1/engine.jpg",
        createdAt: new Date().toISOString(),
        provenance: "customer_observation",
        analysisStatus: "uploaded_not_analyzed",
      },
    ],
  });

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${caseId}`, {
      headers: { cookie: cookieFor(OWNER) },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.id, caseId);
    assert.ok(typeof body.status === "string" && body.status.length > 0);
    assert.ok(typeof body.createdAt === "string" && body.createdAt.length > 0);
    assert.equal(body.persisted, true);
    // Must not leak evidence metadata in resume payload
    assert.ok(!("attachments" in body), "resume payload must not include attachments");
    assert.ok(!("evidence" in body), "resume payload must not include evidence");
    assert.ok(!("photos" in body), "resume payload must not include photos");
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  });
});

test("customer resume returns 500 CASE_STATUS_UNAVAILABLE when storage fails", async () => {
  await withServer(
    async (origin) => {
      setStorageImpl(new FailingStorage());
      try {
        const response = await fetch(`${origin}/api/my-cases/${generateCaseId()}`, {
          headers: { cookie: cookieFor(OWNER) },
        });
        assert.equal(response.status, 500);
        const body = await response.json();
        assert.equal(body.ok, false);
        assert.equal(body.code, "CASE_STATUS_UNAVAILABLE");
        assert.equal(body.persisted, false);
        assert.match(response.headers.get("cache-control") || "", /no-store/);
      } finally {
        setStorageImpl(storage);
      }
    }
  );
});

test("customer case list returns 500 CASE_LIST_UNAVAILABLE when storage fails", async () => {
  await withServer(
    async (origin) => {
      setStorageImpl(new FailingStorage());
      try {
        const response = await fetch(`${origin}/api/my-cases`, {
          headers: { cookie: cookieFor(OWNER) },
        });
        assert.equal(response.status, 500);
        const body = await response.json();
        assert.equal(body.ok, false);
        assert.equal(body.code, "CASE_LIST_UNAVAILABLE");
        assert.equal(body.persisted, false);
        assert.match(response.headers.get("cache-control") || "", /no-store/);
      } finally {
        setStorageImpl(storage);
      }
    }
  );
});
