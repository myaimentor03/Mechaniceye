import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { storage } from "./storage.js";
import { generateCaseId } from "./case-storage.js";

// QA lane (Nov 2 paid beta): the POST /api/diagnoses/:id/follow-up route
// previously accepted any value for additionalInfo without validation.
// When additionalInfo was undefined (field omitted), the new diagnosis
// description became "Follow-up #N: undefined" — a customer-visible bug.
// These tests pin the validation contract so a regression cannot reintroduce
// the undefined-description defect.

const REVIEWER_TOKEN = "qa-test-reviewer-token-for-followup-validation-abc123";

async function withServer(work: (origin: string) => Promise<void>) {
  const priorToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
  try {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    const server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      await work(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    if (priorToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = priorToken;
  }
}

async function createCase(): Promise<string> {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: "qa-followup-test-user",
    vehicleInfo: "2015 Honda Civic",
    description: "Engine runs rough at highway speed",
    timing: "Highway Speed",
  });
  return caseId;
}

test("follow-up rejects missing additionalInfo with 400", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form,
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.message.includes("additionalInfo"), "error message must mention additionalInfo");
  });
});

test("follow-up rejects empty-string additionalInfo with 400", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "");
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form,
    });
    assert.equal(response.status, 400);
  });
});

test("follow-up rejects whitespace-only additionalInfo with 400", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "   \t\n  ");
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form,
    });
    assert.equal(response.status, 400);
  });
});

test("follow-up rejects oversized additionalInfo (>4000 chars) with 400", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "x".repeat(4001));
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form,
    });
    assert.equal(response.status, 400);
  });
});

test("follow-up requires reviewer authentication (401 without token)", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair");
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      body: form,
    });
    assert.equal(response.status, 401);
  });
});

test("follow-up returns 404 for missing case even with valid additionalInfo", async () => {
  await withServer(async (origin) => {
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair");
    const response = await fetch(`${origin}/api/diagnoses/${generateCaseId()}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form,
    });
    assert.equal(response.status, 404);
  });
});
