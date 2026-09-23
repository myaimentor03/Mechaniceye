import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";
import { generateCaseId } from "./case-storage.js";
import { storage, LocalStorage, setStorageImpl } from "./storage.js";

// QA lane (Nov 2 paid beta): customer resume/status cache hardening for
// customer identity (P0 #5) and reliability (P0 #9).
//
// GET /api/my-cases and GET /api/my-cases/:id return customer case data used
// by mobile recovery and the Copy Case ID flow. Every branch (200/400/404/
// 500) plus the requireCustomer auth-gate rejections (401/503) must answer
// `Cache-Control: no-store`, set at handler/middleware entry before any
// branching — mirroring the reviewer case-read hardening. Otherwise a shared
// proxy or mobile browser cache could retain one customer's case list/status
// or serve a stale cached 401 and break resume on flaky mobile networks.

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";

const OWNER: CustomerIdentity = { id: "cust-cache-owner-1", email: "owner@cache.test" };

class FailingStorage extends LocalStorage {
  async getDiagnosis(_id: string): Promise<never> { throw new Error("storage unavailable"); }
  async getDiagnosesByOwner(_ownerId: string): Promise<never> { throw new Error("storage unavailable"); }
}

function cookieFor(identity: CustomerIdentity): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withServer(
  work: (origin: string) => Promise<void>,
  env: Record<string, string | undefined> = {},
) {
  const priorSessionSecret = process.env.DRIVABLE_SESSION_SECRET;
  const priorBetaInvite = process.env.DRIVABLE_BETA_INVITE_CODE;
  process.env.DRIVABLE_SESSION_SECRET = TEST_SESSION_SECRET;
  process.env.DRIVABLE_BETA_INVITE_CODE = TEST_BETA_INVITE;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    await work(origin);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (priorSessionSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = priorSessionSecret;
    if (priorBetaInvite === undefined) delete process.env.DRIVABLE_BETA_INVITE_CODE;
    else process.env.DRIVABLE_BETA_INVITE_CODE = priorBetaInvite;
  }
}

function assertNoStore(response: Response, route: string) {
  assert.match(
    response.headers.get("cache-control") || "",
    /no-store/,
    `${route} must answer Cache-Control: no-store`,
  );
}

test("customer case list without a session is never cacheable (401)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases`);
    assert.equal(response.status, 401);
    assertNoStore(response, "GET /api/my-cases 401");
    await response.text();
  });
});

test("customer case resume without a session is never cacheable (401)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${generateCaseId()}`);
    assert.equal(response.status, 401);
    assertNoStore(response, "GET /api/my-cases/:id 401");
    await response.text();
  });
});

test("customer case list is never cacheable (200)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases`, {
      headers: { cookie: cookieFor(OWNER) },
    });
    assert.equal(response.status, 200);
    assertNoStore(response, "GET /api/my-cases 200");
    await response.text();
  });
});

test("customer case resume is never cacheable (400 hostile id)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${"x".repeat(200)}`, {
      headers: { cookie: cookieFor(OWNER) },
    });
    assert.equal(response.status, 400);
    assertNoStore(response, "GET /api/my-cases/:id 400");
    await response.text();
  });
});

test("customer case resume is never cacheable (404 unknown case)", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/my-cases/${generateCaseId()}`, {
      headers: { cookie: cookieFor(OWNER) },
    });
    assert.equal(response.status, 404);
    assertNoStore(response, "GET /api/my-cases/:id 404");
    await response.text();
  });
});

test("customer case list is never cacheable (500 storage failure)", async () => {
  await withServer(async (origin) => {
    setStorageImpl(new FailingStorage());
    try {
      const response = await fetch(`${origin}/api/my-cases`, {
        headers: { cookie: cookieFor(OWNER) },
      });
      assert.equal(response.status, 500);
      assertNoStore(response, "GET /api/my-cases 500");
      await response.text();
    } finally {
      setStorageImpl(storage);
    }
  });
});

test("customer case resume is never cacheable (500 storage failure)", async () => {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: OWNER.id,
    vehicleInfo: "2015 Honda Civic",
    description: "Engine runs rough at idle",
    timing: "Idle",
  });
  await withServer(async (origin) => {
    setStorageImpl(new FailingStorage());
    try {
      const response = await fetch(`${origin}/api/my-cases/${caseId}`, {
        headers: { cookie: cookieFor(OWNER) },
      });
      assert.equal(response.status, 500);
      assertNoStore(response, "GET /api/my-cases/:id 500");
      await response.text();
    } finally {
      setStorageImpl(storage);
    }
  });
});
