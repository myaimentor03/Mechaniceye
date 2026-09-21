import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { registerJourneyRoutes } from "./journey-routes.js";
import { createSessionToken } from "./customer-auth.js";
import { clearJourneyStoreForTests } from "./journey-store.js";
import { clearJourneyEventsForTests } from "./journey-case-events.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";

// Avoid cross-test throttling in the shared limiter instance
FixedWindowRateLimiter.prototype.consume = function (_key: string, _now?: number) {
  return { allowed: true, remaining: 9999, resetAt: Date.now() + 3600000 };
};

function makeCustomerHeader(): Record<string, string> {
  const identity = { id: "test-customer-timeline-1", email: "timeline-test@example.com" };
  const session = createSessionToken(identity);
  return {
    cookie: `drivable_session=${encodeURIComponent(session)}`,
    "content-type": "application/json",
  };
}

async function withJourneyServer(work: (origin: string) => Promise<void>) {
  const priorSessionSecret = process.env.DRIVABLE_SESSION_SECRET;
  process.env.DRIVABLE_SESSION_SECRET = "test-session-secret-that-is-at-least-32-chars-long-for-timeline-test!";
  clearJourneyStoreForTests();
  clearJourneyEventsForTests();

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
    clearJourneyEventsForTests();
  }
}

async function jsonOf(res: Response) {
  return res.json() as Promise<any>;
}

async function advance(origin: string, caseId: string, transition: string, body?: Record<string, unknown>) {
  const res = await fetch(`${origin}/api/journey/${caseId}/advance`, {
    method: "POST",
    headers: makeCustomerHeader(),
    body: JSON.stringify({ transition, ...(body || {}) }),
  });
  assert.equal(res.status, 200, `transition ${transition} should succeed`);
  return jsonOf(res);
}

async function fetchEvents(origin: string, caseId: string) {
  const res = await fetch(`${origin}/api/journey/${caseId}/events`, {
    headers: makeCustomerHeader(),
  });
  assert.equal(res.status, 200);
  const data = await jsonOf(res);
  assert.ok(data.ok);
  assert.ok(Array.isArray(data.events));
  return data.events as any[];
}

test("timeline records truthful from→to on every advance", async () => {
  await withJourneyServer(async (origin) => {
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
    const started = await jsonOf(startRes);
    const caseId = started.id;

    await advance(origin, caseId, "submit_intake");

    const events = await fetchEvents(origin, caseId);
    const hop = events.find(
      (e) => (e.eventType === "state_transition" || e.eventType === "safety_escalated") &&
        e.fromState === "intake" && e.toState === "triage"
    );
    assert.ok(hop, `expected a truthful intake→triage hop, got: ${JSON.stringify(events.map((e) => [e.eventType, e.fromState, e.toState]))}`);
    assert.equal(hop.transition, "submit_intake");
  });
});

test("timeline records case_resolved with the outcome on resolve", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST",
      headers: makeCustomerHeader(),
      body: JSON.stringify({
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light is on, car runs rough at idle, started last week",
        timing: "Idle",
        urgency: "Safe to Drive",
        canDrive: "Yes",
      }),
    });
    assert.equal(startRes.status, 201);
    const started = await jsonOf(startRes);
    const caseId = started.id;

    for (const t of ["submit_intake", "acknowledge_triage", "finish_evidence", "evaluate", "ready_diagnosis"]) {
      await advance(origin, caseId, t);
    }
    const resolved = await advance(origin, caseId, "resolve");
    assert.equal(resolved.state, "resolved");
    assert.ok(resolved.outcome);

    const events = await fetchEvents(origin, caseId);
    const resolvedEvent = events.find((e) => e.eventType === "case_resolved");
    assert.ok(resolvedEvent, `expected a case_resolved event, got: ${JSON.stringify(events.map((e) => e.eventType))}`);
    assert.equal(resolvedEvent.toState, "resolved");
    assert.equal(resolvedEvent.fromState, "diagnosis_ready");
    assert.equal(resolvedEvent.outcome, resolved.outcome);
  });
});

test("timeline records review_requested when the customer uses the safety valve", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST",
      headers: makeCustomerHeader(),
      body: JSON.stringify({
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light is on, car runs rough at idle, started last week",
        timing: "Idle",
        urgency: "Safe to Drive",
        canDrive: "Yes",
      }),
    });
    assert.equal(startRes.status, 201);
    const started = await jsonOf(startRes);
    const caseId = started.id;

    for (const t of ["submit_intake", "acknowledge_triage", "finish_evidence", "evaluate", "ready_diagnosis"]) {
      await advance(origin, caseId, t);
    }
    const inReview = await advance(origin, caseId, "request_human_review");
    assert.equal(inReview.state, "human_review");

    const events = await fetchEvents(origin, caseId);
    const requested = events.find((e) => e.eventType === "review_requested");
    assert.ok(requested, `expected a review_requested event, got: ${JSON.stringify(events.map((e) => e.eventType))}`);
    const hop = events.find(
      (e) => (e.eventType === "state_transition" || e.eventType === "safety_escalated") &&
        e.fromState === "diagnosis_ready" && e.toState === "human_review"
    );
    assert.ok(hop, "expected a truthful diagnosis_ready→human_review hop");
  });
});
