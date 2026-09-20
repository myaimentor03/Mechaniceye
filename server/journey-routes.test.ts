import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { registerJourneyRoutes } from "./journey-routes.js";
import { createSessionToken } from "./customer-auth.js";
import { clearJourneyStoreForTests } from "./journey-store.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";

// Monkey-patch rate limiter to avoid cross-test throttling in the shared instance
const originalConsume = FixedWindowRateLimiter.prototype.consume;
FixedWindowRateLimiter.prototype.consume = function (key: string, now?: number) {
  return { allowed: true, remaining: 9999, resetAt: Date.now() + 3600000 };
};

const REVIEWER_TOKEN = "journey-review-route-test-token-that-is-long-enough-for-scrypt";

function makeCustomerHeader(): Record<string, string> {
  const identity = { id: "test-customer-1", email: "test@example.com" };
  const session = createSessionToken(identity);
  return { cookie: `drivable_session=${encodeURIComponent(session)}`, "content-type": "application/json" };
}

function makeReviewerHeader(): Record<string, string> {
  return { authorization: `Bearer ${REVIEWER_TOKEN}`, "content-type": "application/json" };
}

async function withJourneyServer(work: (origin: string) => Promise<void>) {
  const priorSessionSecret = process.env.DRIVABLE_SESSION_SECRET;
  const priorReviewerToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  process.env.DRIVABLE_SESSION_SECRET = "test-session-secret-that-is-at-least-32-chars-long!";
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
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
    if (priorReviewerToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = priorReviewerToken;
    clearJourneyStoreForTests();
  }
}

async function jsonOf(res: Response) {
  return res.json() as Promise<any>;
}

test("journey start creates a case in intake state", async () => {
  await withJourneyServer(async (origin) => {
    const res = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Honda Civic",
        description: "Engine makes a grinding noise when braking at low speeds",
        timing: "Braking",
        urgency: "Safe to Drive",
      }),
    });
    assert.equal(res.status, 201);
    const data = await jsonOf(res);
    assert.equal(data.state, "intake");
    assert.equal(data.vehicleInfo, "2020 Honda Civic");
    assert.equal(data.description, "Engine makes a grinding noise when braking at low speeds");
    assert.ok(data.id.startsWith("JRN-"));
  });
});

test("journey start rejects missing vehicle info", async () => {
  await withJourneyServer(async (origin) => {
    const res = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "",
        description: "Something is wrong",
      }),
    });
    assert.equal(res.status, 400);
    const data = await jsonOf(res);
    assert.equal(data.ok, false);
  });
});

test("journey start rejects description under 10 characters", async () => {
  await withJourneyServer(async (origin) => {
    const res = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Honda Civic",
        description: "Short",
      }),
    });
    assert.equal(res.status, 400);
    const data = await jsonOf(res);
    assert.equal(data.ok, false);
  });
});

test("journey start without auth returns 401", async () => {
  await withJourneyServer(async (origin) => {
    const res = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        vehicleInfo: "2020 Honda Civic",
        description: "Engine grinding noise when braking",
      }),
    });
    assert.equal(res.status, 401);
  });
});

test("journey status returns case data", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Toyota Camry",
        description: "Check engine light is on",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const statusRes = await fetch(`${origin}/api/journey/${caseId}/status`, {
      headers: makeCustomerHeader(),
    });
    assert.equal(statusRes.status, 200);
    const statusData = await jsonOf(statusRes);
    assert.equal(statusData.state, "intake");
    assert.equal(statusData.vehicleInfo, "2020 Toyota Camry");
    assert.equal(statusData.id, caseId);
  });
});

test("journey status returns 404 for unknown case", async () => {
  await withJourneyServer(async (origin) => {
    const res = await fetch(`${origin}/api/journey/unknown-case-id/status`, {
      headers: makeCustomerHeader(),
    });
    assert.equal(res.status, 404);
  });
});

test("journey advance transitions from intake to triage", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const advanceRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        transition: "submit_intake",
      }),
    });
    assert.equal(advanceRes.status, 200);
    const updated = await jsonOf(advanceRes);
    assert.equal(updated.state, "triage");
  });
});

test("journey advance rejects invalid transition", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const advanceRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        transition: "resolve",
      }),
    });
    assert.equal(advanceRes.status, 409);
    const data = await jsonOf(advanceRes);
    assert.equal(data.ok, false);
  });
});

test("journey advance to evidence_requested and finish evidence", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const submitIntakeRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "submit_intake" }),
    });
    assert.equal(submitIntakeRes.status, 200);

    const ackRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "acknowledge_triage" }),
    });
    const afterAck = await jsonOf(ackRes);
    assert.equal(afterAck.state, "evidence_requested");

    const finishRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "finish_evidence" }),
    });
    const afterFinish = await jsonOf(finishRes);
    assert.equal(afterFinish.state, "evidence_received");
    assert.equal(afterFinish.nextAction, "evaluate");
  });
});

test("journey evidence submit with photo and text", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light is on, car runs rough at idle",
        timing: "Idle",
        urgency: "Safe to Drive",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const submitIntakeRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "submit_intake" }),
    });
    assert.equal(submitIntakeRes.status, 200);

    const submitRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "submit_evidence" }),
    });
    const afterSubmit = await jsonOf(submitRes);
    assert.equal(afterSubmit.state, "evidence_received");
  });
});

test("journey evaluate transitions to evaluating and ready_diagnosis", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light is on, car runs rough at idle",
        timing: "Idle",
        urgency: "Safe to Drive",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const submitIntakeRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "submit_intake" }),
    });
    assert.equal(submitIntakeRes.status, 200);

    const ackRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "acknowledge_triage" }),
    });
    assert.equal(ackRes.status, 200);

    const submitEvRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "submit_evidence" }),
    });
    assert.equal(submitEvRes.status, 200);

    const evalRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "evaluate" }),
    });
    const afterEval = await jsonOf(evalRes);
    assert.equal(afterEval.state, "evaluating");

    const readyRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "ready_diagnosis" }),
    });
    const afterReady = await jsonOf(readyRes);
    assert.equal(afterReady.state, "diagnosis_ready");
    assert.ok(afterReady.outcome, "Should have determined an outcome");
  });
});

test("journey diagnosis_ready includes structured decision packet for the customer UI", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light is on, car runs rough at idle, started last week",
        timing: "Idle",
        urgency: "Safe to Drive",
        canDrive: "Yes",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    for (const transition of ["submit_intake", "acknowledge_triage", "finish_evidence", "evaluate", "ready_diagnosis"]) {
      const res = await fetch(`${origin}/api/journey/${caseId}/advance`, {
        method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition }),
      });
      assert.equal(res.status, 200);
    }

    const statusRes = await fetch(`${origin}/api/journey/${caseId}/status`, {
      headers: makeCustomerHeader(),
    });
    assert.equal(statusRes.status, 200);
    const status = await jsonOf(statusRes);
    assert.equal(status.state, "diagnosis_ready");
    assert.ok(status.outcome, "Should have determined an outcome");
    assert.ok(status.decisionPacket, "diagnosis_ready must include a decisionPacket for the customer UI");
    assert.equal(status.decisionPacket.outcome, status.outcome);
    assert.ok(status.decisionPacket.guidance?.title, "decisionPacket must include guidance title");
    assert.ok(Array.isArray(status.decisionPacket.guidance?.immediateSteps), "guidance must include immediate steps");
    assert.ok(Array.isArray(status.decisionPacket.guidance?.warnings), "guidance must include safety warnings");
    assert.ok(Array.isArray(status.decisionPacket.guidance?.followUp), "guidance must include follow-up");
    assert.ok(status.decisionPacket.evidenceSummary, "decisionPacket must summarize case evidence");
    assert.equal(status.decisionPacket.evidenceBelongsToCase, true);
  });
});

test("journey resolve completes the full happy path", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light is on, car runs rough at idle",
        timing: "Idle",
        urgency: "Safe to Drive",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const submitIntakeRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "submit_intake" }),
    });
    assert.equal(submitIntakeRes.status, 200);

    const ackRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "acknowledge_triage" }),
    });
    assert.equal(ackRes.status, 200);

    const finishRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "finish_evidence" }),
    });
    assert.equal(finishRes.status, 200);

    const evalRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "evaluate" }),
    });
    assert.equal(evalRes.status, 200);

    const readyRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "ready_diagnosis" }),
    });
    assert.equal(readyRes.status, 200);

    const resolveRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "resolve" }),
    });
    const afterResolve = await jsonOf(resolveRes);
    assert.equal(afterResolve.state, "resolved");
    assert.ok(afterResolve.outcome);
    assert.ok(afterResolve.decisionPath || afterResolve.outcome === "stop_driving");
  });
});

test("journey stop_driving from evidence_requested", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Ford F-150",
        description: "Brakes failed completely, cannot stop the truck",
        urgency: "Not Safe to Drive",
      }),
    });
    const caseData = await jsonOf(startRes);
    assert.equal(caseData.state, "escalation_required");
    assert.equal(caseData.safetyTriggered, true);
  });
});

test("journey finish_evidence transitions from evidence_requested", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const submitIntakeRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "submit_intake" }),
    });
    assert.equal(submitIntakeRes.status, 200);

    const ackRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "acknowledge_triage" }),
    });
    assert.equal(ackRes.status, 200);

    const finishRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "finish_evidence" }),
    });
    const afterFinish = await jsonOf(finishRes);
    assert.equal(afterFinish.state, "evidence_received");
    assert.equal(afterFinish.nextAction, "evaluate");
  });
});

test("journey evidence suggestions endpoint", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking at low speeds",
        timing: "Braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const suggestionsRes = await fetch(`${origin}/api/journey/${caseId}/evidence-suggestions`, {
      headers: makeCustomerHeader(),
    });
    assert.equal(suggestionsRes.status, 200);
    const data = await jsonOf(suggestionsRes);
    assert.ok("plannedEvidence" in data);
    assert.ok("nextEvidence" in data);
  });
});

test("journey re-evaluate endpoint", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const reEvalRes = await fetch(`${origin}/api/journey/${caseId}/re-evaluate`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({}),
    });
    assert.equal(reEvalRes.status, 200);
    const updated = await jsonOf(reEvalRes);
    assert.ok(updated.state === "intake" || updated.state === "triage");
  });
});

test("journey my-cases lists customer cases", async () => {
  await withJourneyServer(async (origin) => {
    const res1 = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Honda Civic", description: "Grinding noise",
      }),
    });
    const case1 = await jsonOf(res1);
    const caseId1 = case1.id;

    const res2 = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2021 Toyota Camry", description: "Check engine light",
      }),
    });
    const case2 = await jsonOf(res2);
    const caseId2 = case2.id;

    const listRes = await fetch(`${origin}/api/journey/my-cases`, {
      headers: makeCustomerHeader(),
    });
    assert.equal(listRes.status, 200);
    const listData = await jsonOf(listRes);
    assert.ok(Array.isArray(listData.cases));
    assert.ok(listData.cases.length >= 2);
    const ids = listData.cases.map((c: any) => c.id);
    assert.ok(ids.includes(caseId1));
    assert.ok(ids.includes(caseId2));
  });
});

test("journey review pending cases for reviewer", async () => {
  await withJourneyServer(async (origin) => {
    const reviewRes = await fetch(`${origin}/api/journey/review/pending`, {
      headers: makeReviewerHeader(),
    });
    assert.equal(reviewRes.status, 200);
    const data = await jsonOf(reviewRes);
    assert.ok(Array.isArray(data.cases));
  });
});

test("journey review reject endpoint returns 409 for non-reviewable state", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const rejectRes = await fetch(`${origin}/api/journey/review/${caseId}/reject`, {
      method: "POST", headers: makeReviewerHeader(), body: JSON.stringify({
        reasonCode: "insufficient_evidence",
      }),
    });
    assert.equal(rejectRes.status, 409);
  });
});

test("journey review approve returns 409 for non-reviewable state", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const approveRes = await fetch(`${origin}/api/journey/review/${caseId}/approve`, {
      method: "POST", headers: makeReviewerHeader(), body: JSON.stringify({
        highRiskAcknowledged: true,
      }),
    });
    assert.equal(approveRes.status, 409);
  });
});

test("journey review finalize for non-reviewable state returns 409", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const finalizeRes = await fetch(`${origin}/api/journey/review/${caseId}/finalize`, {
      method: "POST", headers: makeReviewerHeader(), body: JSON.stringify({}),
    });
    assert.equal(finalizeRes.status, 409);
  });
});

test("journey advance with outcome and resolution note", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light, runs rough at idle",
        timing: "Idle",
        urgency: "Safe to Drive",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const submitIntakeRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "submit_intake" }),
    });
    assert.equal(submitIntakeRes.status, 200);

    const ackRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "acknowledge_triage" }),
    });
    assert.equal(ackRes.status, 200);

    const finishRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "finish_evidence" }),
    });
    assert.equal(finishRes.status, 200);

    const evalRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "evaluate" }),
    });
    const afterEval = await jsonOf(evalRes);
    assert.equal(afterEval.state, "evaluating");

    const readyRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "ready_diagnosis" }),
    });
    const afterReady = await jsonOf(readyRes);
    assert.equal(afterReady.state, "diagnosis_ready");

    const resolveRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "resolve", outcome: "fix", resolutionNote: "Recommended professional repair" }),
    });
    const afterResolve = await jsonOf(resolveRes);
    assert.equal(afterResolve.state, "resolved");
    assert.equal(afterResolve.outcome, "fix");
    assert.equal(afterResolve.resolutionNote, "Recommended professional repair");
  });
});

test("journey add_followup_evidence re-opens resolved case for new evidence", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light, runs rough at idle",
        timing: "Idle",
        urgency: "Safe to Drive",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    for (const transition of ["submit_intake", "acknowledge_triage", "finish_evidence", "evaluate", "ready_diagnosis", "resolve"]) {
      const res = await fetch(`${origin}/api/journey/${caseId}/advance`, {
        method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition }),
      });
      assert.equal(res.status, 200);
    }

    const resolvedRes = await fetch(`${origin}/api/journey/${caseId}/status`, { headers: makeCustomerHeader() });
    const resolvedData = await jsonOf(resolvedRes);
    assert.equal(resolvedData.state, "resolved");
    assert.ok(resolvedData.outcome);
    assert.ok(resolvedData.decisionPath);

    // Add follow-up evidence via advance endpoint
    const followupRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        transition: "add_followup_evidence",
      }),
    });
    assert.equal(followupRes.status, 200);
    const followupData = await jsonOf(followupRes);
    assert.equal(followupData.state, "evidence_received");
    assert.equal(followupData.outcome, undefined, "Outcome should be cleared");
    assert.equal(followupData.decisionPath, undefined, "Decision path should be cleared");
    assert.equal(followupData.nextAction, "evaluate");

    // Now add actual evidence
    const evidenceRes = await fetch(`${origin}/api/journey/${caseId}/evidence`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        kind: "text",
        description: "New symptom: engine stalling at stops",
      }),
    });
    assert.equal(evidenceRes.status, 200);
    const evidenceData = await jsonOf(evidenceRes);
    assert.equal(evidenceData.state, "evidence_received");
    assert.ok(evidenceData.evidence.some((e: any) => e.description === "New symptom: engine stalling at stops"));

    // Continue through evaluation
    for (const transition of ["evaluate", "ready_diagnosis", "resolve"]) {
      const res = await fetch(`${origin}/api/journey/${caseId}/advance`, {
        method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition }),
      });
      assert.equal(res.status, 200);
    }

    const finalRes = await fetch(`${origin}/api/journey/${caseId}/status`, { headers: makeCustomerHeader() });
    const finalData = await jsonOf(finalRes);
    assert.equal(finalData.state, "resolved");
    assert.ok(finalData.outcome);
    assert.ok(finalData.evidence.length >= 1);
  });
});

test("journey add_followup_evidence rejects from non-resolved state", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2018 Honda Civic",
        description: "Grinding noise when braking",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    const submitIntakeRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "submit_intake" }),
    });
    assert.equal(submitIntakeRes.status, 200);

    // Case is in triage, not resolved - should reject
    const followupRes = await fetch(`${origin}/api/journey/${caseId}/advance`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition: "add_followup_evidence" }),
    });
    assert.equal(followupRes.status, 409);
  });
});

test("journey add_followup_evidence via evidence endpoint on resolved case", async () => {
  await withJourneyServer(async (origin) => {
    const startRes = await fetch(`${origin}/api/journey/start`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        vehicleInfo: "2020 Toyota RAV4",
        description: "Check engine light, runs rough at idle",
        timing: "Idle",
        urgency: "Safe to Drive",
      }),
    });
    const caseData = await jsonOf(startRes);
    const caseId = caseData.id;

    for (const transition of ["submit_intake", "acknowledge_triage", "finish_evidence", "evaluate", "ready_diagnosis", "resolve"]) {
      const res = await fetch(`${origin}/api/journey/${caseId}/advance`, {
        method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({ transition }),
      });
      assert.equal(res.status, 200);
    }

    // Add follow-up evidence directly via evidence endpoint (text evidence)
    const evidenceRes = await fetch(`${origin}/api/journey/${caseId}/evidence`, {
      method: "POST", headers: makeCustomerHeader(), body: JSON.stringify({
        kind: "text",
        description: "Follow-up: check engine light is now flashing",
      }),
    });
    assert.equal(evidenceRes.status, 200);
    const evidenceData = await jsonOf(evidenceRes);
    assert.equal(evidenceData.state, "evidence_received");
    assert.equal(evidenceData.outcome, undefined);
    assert.ok(evidenceData.evidence.some((e: any) => e.description === "Follow-up: check engine light is now flashing"));
  });
});
