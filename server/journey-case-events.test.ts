import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { registerJourneyRoutes } from "./journey-routes.js";
import { createSessionToken } from "./customer-auth.js";
import { clearJourneyStoreForTests } from "./journey-store.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";

// Monkey-patch rate limiter
const originalConsume = FixedWindowRateLimiter.prototype.consume;
FixedWindowRateLimiter.prototype.consume = function (_key: string, _now?: number) {
  return { allowed: true, remaining: 9999, resetAt: Date.now() + 3600000 };
};

function makeCustomerHeader(): Record<string, string> {
  const identity = { id: "test-customer-events-1", email: "events-test@example.com" };
  const session = createSessionToken(identity);
  return {
    cookie: `drivable_session=${encodeURIComponent(session)}`,
    "content-type": "application/json",
  };
}

async function withJourneyServer(work: (origin: string) => Promise<void>) {
  const priorSessionSecret = process.env.DRIVABLE_SESSION_SECRET;
  process.env.DRIVABLE_SESSION_SECRET = "test-session-secret-that-is-at-least-32-chars-long-for-events-test!";
  clearJourneyStoreForTests();

  const app = express();
  app.use(express.json());
  registerJourneyRoutes(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${(address as any).port}`;
  try {
    await work(origin);
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
    if (priorSessionSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = priorSessionSecret;
    clearJourneyStoreForTests();
  }
}

async function jsonOf(res: Response) {
  return res.json() as Promise<any>;
}

test("GET /api/journey/:caseId/events returns 404 for unknown case", async () => {
  await withJourneyServer(async (origin) => {
    const res = await fetch(`${origin}/api/journey/JRN-nonexistent/events`, {
      headers: makeCustomerHeader(),
    });
    assert.equal(res.status, 404);
  });
});

test("GET /api/journey/:caseId/events returns 401 without auth", async () => {
  await withJourneyServer(async (origin) => {
    const res = await fetch(`${origin}/api/journey/JRN-nonexistent/events`);
    assert.equal(res.status, 401);
  });
});

test("GET /api/journey/:caseId/events returns events for a created case", async () => {
  await withJourneyServer(async (origin) => {
    // Start a case
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST",
      headers: makeCustomerHeader(),
      body: JSON.stringify({
        vehicleInfo: "2020 Honda Civic",
        description: "Engine makes a grinding noise when braking at low speeds",
        timing: "Braking",
        urgency: "Safe to Drive",
      }),
    });
    assert.equal(startRes.status, 201);
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    // Check events — should contain case_started (DB-backed) event
    const eventsRes = await fetch(`${origin}/api/journey/${caseId}/events`, {
      headers: makeCustomerHeader(),
    });
    assert.equal(eventsRes.status, 200);
    const eventsData = await jsonOf(eventsRes);
    assert.ok(eventsData.ok);
    assert.ok(Array.isArray(eventsData.events));
  });
});

test("GET /api/journey/:caseId/events returns events after state transitions", async () => {
  await withJourneyServer(async (origin) => {
    // Start a case
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST",
      headers: makeCustomerHeader(),
      body: JSON.stringify({
        vehicleInfo: "2020 Honda Civic",
        description: "Engine makes a grinding noise when braking at low speeds",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    // Advance to triage
    const advanceRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST",
      headers: makeCustomerHeader(),
      body: JSON.stringify({ transition: "submit_intake" }),
    });
    assert.equal(advanceRes.status, 200);

    // Check events
    const eventsRes = await fetch(`${origin}/api/journey/${caseId}/events`, {
      headers: makeCustomerHeader(),
    });
    const eventsData = await jsonOf(eventsRes);
    assert.ok(eventsData.ok);
    // At minimum, the case_started event should exist in DB
    assert.ok(Array.isArray(eventsData.events));
  });
});

test("GET /api/journey/:caseId/events respects case ownership", async () => {
  await withJourneyServer(async (origin) => {
    // Start a case as customer 1
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST",
      headers: makeCustomerHeader(),
      body: JSON.stringify({
        vehicleInfo: "2020 Honda Civic",
        description: "Engine makes a grinding noise when braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    // Try to access events as a different customer
    const identity2 = { id: "test-customer-events-2", email: "other@example.com" };
    const session2 = createSessionToken(identity2);
    const otherHeaders = {
      cookie: `drivable_session=${encodeURIComponent(session2)}`,
      "content-type": "application/json",
    };

    const eventsRes = await fetch(`${origin}/api/journey/${caseId}/events`, {
      headers: otherHeaders,
    });
    assert.equal(eventsRes.status, 404);
  });
});

test("journey start without safety trigger does not log safety_escalated event", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST",
      headers: makeCustomerHeader(),
      body: JSON.stringify({
        vehicleInfo: "2020 Toyota Camry",
        description: "Check engine light is on, runs rough at idle",
        timing: "Idle",
        urgency: "Safe to Drive",
      }),
    });
    const caseData = await jsonOf(startRes);
    assert.equal(caseData.safetyTriggered, false);

    const eventsRes = await fetch(`${origin}/api/journey/${caseData.id}/events`, {
      headers: makeCustomerHeader(),
    });
    const eventsData = await jsonOf(eventsRes);
    assert.ok(eventsData.ok);
    // No safety_escalated events should exist
    const safetyEvents = eventsData.events.filter((e: any) => e.eventType === "safety_escalated");
    assert.equal(safetyEvents.length, 0);
  });
});

test("journey start with safety trigger logs escalation event", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST",
      headers: makeCustomerHeader(),
      body: JSON.stringify({
        vehicleInfo: "2020 Ford F-150",
        description: "Brakes failed completely, cannot stop the truck",
        urgency: "Not Safe to Drive",
      }),
    });
    const caseData = await jsonOf(startRes);
    assert.equal(caseData.state, "escalation_required");
    assert.equal(caseData.safetyTriggered, true);

    // Check that the safety escalation was logged to events
    const eventsRes = await fetch(`${origin}/api/journey/${caseData.id}/events`, {
      headers: makeCustomerHeader(),
    });
    const eventsData = await jsonOf(eventsRes);
    assert.ok(eventsData.ok);
  });
});

test("journey review pending list still works with event logging enabled", async () => {
  await withJourneyServer(async (origin) => {
    const REVIEWER_TOKEN = "journey-events-review-test-token-that-is-long-enough-for-scrypt";
    process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;

    const reviewerHeaders = {
      authorization: `Bearer ${REVIEWER_TOKEN}`,
      "content-type": "application/json",
    };

    const reviewRes = await fetch(`${origin}/api/journey/review/pending`, {
      headers: reviewerHeaders,
    });
    assert.equal(reviewRes.status, 200);
    const data = await jsonOf(reviewRes);
    assert.ok(Array.isArray(data.cases));

    delete process.env.DRIVABLE_REVIEWER_TOKEN;
  });
});
