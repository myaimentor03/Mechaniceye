import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 Guided Journey support).
 *
 * The support concierge intake previously accepted any non-empty string for
 * customerEmail, customerPhone, and message, so junk requests
 * (email "not-an-email", phone "abc", oversized message/name) passed
 * validation and were forwarded. These HTTP-level regression tests pin
 * fail-closed server-side validation: malformed concierge requests get 400
 * with field names only (no PII echo), while a valid intake still passes
 * validation and fails closed with 502 when the master webhook is
 * unconfigured.
 */

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

function validConcierge(overrides: Record<string, unknown> = {}) {
  return {
    guideRequested: "Guided diagnosis help",
    helpTopic: "Stuck on photo upload",
    customerName: "Alex Driver",
    customerEmail: "alex@example.com",
    customerPhone: "(415) 555-0100",
    relatedCaseId: "",
    relatedListingId: "",
    currentPage: "/diagnosis",
    urgency: "Today",
    preferredContactMethod: "Email",
    message: "I am stuck uploading engine photos on mobile Safari. Please help.",
    stuckStep: "photo-upload",
    wantsHumanReview: "Yes",
    scenario: "fix_my_car",
    reportType: "diagnosis",
    topic: "photo-upload",
    sourceContext: {
      page: "/diagnosis",
      selectedScenario: null,
      selectedReportType: null,
      topic: null,
      queryParams: {},
    },
    acknowledgments: {
      aiAssistedGuide: true,
      finalVerification: true,
    },
    ...overrides,
  };
}

async function postIntake(origin: string, body: unknown) {
  const response = await fetch(`${origin}/api/support/concierge-request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed, text };
}

test("valid concierge request passes validation and fails closed without webhook (502)", async () => {
  await withServer(async (origin) => {
    const { status } = await postIntake(origin, validConcierge());
    assert.equal(status, 502);
  });
});

test("concierge request rejects malformed customer email", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validConcierge({ customerEmail: "not-an-email" }));
    assert.equal(status, 400);
    assert.ok(Array.isArray(body.invalidFields));
    assert.ok((body.invalidFields as string[]).includes("customerEmail"));
  });
});

test("concierge request rejects undiallable customer phone", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validConcierge({ customerPhone: "abc" }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("customerPhone"));
  });
});

test("concierge request accepts empty optional phone", async () => {
  await withServer(async (origin) => {
    const { status } = await postIntake(origin, validConcierge({ customerPhone: "" }));
    assert.equal(status, 502);
  });
});

test("concierge request rejects oversized message", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validConcierge({ message: "x".repeat(4001) }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("message"));
  });
});

test("concierge request rejects oversized customer name", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validConcierge({ customerName: "x".repeat(161) }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("customerName"));
  });
});

test("concierge request rejects oversized help topic", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validConcierge({ helpTopic: "x".repeat(161) }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("helpTopic"));
  });
});

test("concierge request rejects oversized current page", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, validConcierge({ currentPage: "x".repeat(161) }));
    assert.equal(status, 400);
    assert.ok((body.invalidFields as string[]).includes("currentPage"));
  });
});

test("concierge request invalid-field errors never echo submitted PII values", async () => {
  await withServer(async (origin) => {
    const marker = "PiiConciergeProbeQaXy99@example.test";
    const { status, text } = await postIntake(origin, validConcierge({ customerEmail: marker, message: "x".repeat(4001) }));
    assert.equal(status, 400);
    assert.ok(!text.includes(marker), "error response must list field names, not submitted values");
  });
});

test("concierge request empty intake still reports missing required fields", async () => {
  await withServer(async (origin) => {
    const { status, body } = await postIntake(origin, {});
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Missing required fields/);
  });
});
