import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

const S3_VARS = [
  "DRIVABLE_EVIDENCE_S3_BUCKET",
  "DRIVABLE_EVIDENCE_S3_REGION",
  "DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID",
  "DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY",
  "DRIVABLE_EVIDENCE_S3_ENDPOINT",
  "MASTER_INTAKE_WEBHOOK_URL",
] as const;

const REVIEWER_TOKEN = "reviewer-write-limit-test-token-1234567890";
const REVIEWER_WRITE_LIMIT = 120;

async function withServer(work: (origin: string) => Promise<void>) {
  const priorToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  for (const key of S3_VARS) delete process.env[key];
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
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
    if (priorToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = priorToken;
  }
}

const REVIEWER_WRITE_ROUTES = [
  "/api/diagnoses/CASE-1/export-chat",
  "/api/diagnoses/CASE-1/send-to-mechanic",
  "/api/consultations",
  "/api/internal-review",
  "/api/consultations/c-1/feedback",
];

for (const route of REVIEWER_WRITE_ROUTES) {
  test(`reviewer write route ${route} is rate limited`, async () => {
    await withServer(async (origin) => {
      let limited = false;
      for (let i = 0; i < REVIEWER_WRITE_LIMIT + 5; i += 1) {
        const response = await fetch(`${origin}${route}`, {
          method: "POST",
          headers: { authorization: `Bearer ${REVIEWER_TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ diagnosisId: "CASE-1", mechanicId: "m-1", userId: "u-1" }),
        });
        if (response.status === 429) {
          limited = true;
          const body = await response.json();
          assert.equal(body.code, "RATE_LIMITED");
          assert.equal(response.headers.get("retry-after") !== null, true);
          break;
        }
      }
      assert.equal(limited, true, `${route} never returned 429`);
    });
  });
}

test("rate-limited reviewer routes still reject unauthenticated callers first", async () => {
  await withServer(async (origin) => {
    for (const route of REVIEWER_WRITE_ROUTES) {
      const response = await fetch(`${origin}${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal([401, 403, 503].includes(response.status), true, `${route} returned ${response.status}`);
    }
  });
});
