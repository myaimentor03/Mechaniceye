import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { storage } from "./storage.js";
import { generateCaseId } from "./case-storage.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #1 evidence,
 * P0 #2 follow-up evidence, P0 #9 reliability / mobile recovery).
 *
 * The transport envelope (api-transport-errors) and the outer production
 * fallbacks both answer fail-closed `{ ok: false, code }` JSON so flaky
 * mobile clients can branch on `body.ok` after `response.json()`. The
 * multipart upload middlewares (diagnosis evidence intake, follow-up
 * audio/video) answered bare `{ message, persisted: false }` with no
 * `ok`/`code`, breaking that contract, and the intake 415 path echoed the
 * attacker-controlled mimetype via `error.message`. Statuses are unchanged
 * (413 limit / 415 type-or-field); this pins the additive envelope
 * (`ok:false`, stable `code`, `error` mirroring the safe static `message`,
 * legacy `message`/`persisted:false` preserved), `Cache-Control: no-store`,
 * JSON content-type, and zero error-internals / raw-input echo.
 */

const TEST_SESSION_SECRET = "test-upload-envelope-secret-at-least-32-chars-xyz!";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";
const TEST_REVIEWER_TOKEN = "test-upload-envelope-reviewer-token-12";
const CUSTOMER: CustomerIdentity = { id: "cust-upload-envelope-1", email: "upload-envelope@example.test" };

function cookieFor(identity: CustomerIdentity): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withServer(work: (origin: string) => Promise<void>) {
  const priorSessionSecret = process.env.DRIVABLE_SESSION_SECRET;
  const priorBetaInvite = process.env.DRIVABLE_BETA_INVITE_CODE;
  const priorReviewerToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  process.env.DRIVABLE_SESSION_SECRET = TEST_SESSION_SECRET;
  process.env.DRIVABLE_BETA_INVITE_CODE = TEST_BETA_INVITE;
  process.env.DRIVABLE_REVIEWER_TOKEN = TEST_REVIEWER_TOKEN;
  try {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    const server = await registerRoutes(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      await work(`http://127.0.0.1:${(address as any).port}`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    if (priorSessionSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET;
    else process.env.DRIVABLE_SESSION_SECRET = priorSessionSecret;
    if (priorBetaInvite === undefined) delete process.env.DRIVABLE_BETA_INVITE_CODE;
    else process.env.DRIVABLE_BETA_INVITE_CODE = priorBetaInvite;
    if (priorReviewerToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = priorReviewerToken;
  }
}

function intakeForm(extra?: (form: FormData) => void): FormData {
  const form = new FormData();
  form.append(
    "evidenceIntake",
    JSON.stringify({
      mode: "diagnose",
      vehicle: { year: "2012", make: "Ford", model: "F-150", mileage: 168400 },
      situation: {
        description: "Engine running rough at highway speed",
        symptoms: ["Engine running rough"],
        timing: "Highway Speed",
        urgency: "Safe to Drive",
        canDrive: "Safe to Drive",
        recentRepairs: "New spark plugs",
      },
      obd: { codes: ["P0302"], attachmentIds: [] },
      attachments: [],
    }),
  );
  form.append(
    "consent",
    JSON.stringify({
      service_fulfillment: true,
      media_processing: true,
      human_review_sharing: true,
      optional_product_learning: false,
    }),
  );
  extra?.(form);
  return form;
}

function assertFailClosedEnvelope(
  body: Record<string, unknown>,
  text: string,
  opts: { code: string; route: string },
) {
  assert.equal(body.ok, false, `${opts.route} must answer ok:false`);
  assert.equal(body.code, opts.code, `${opts.route} must answer code ${opts.code}`);
  assert.equal(body.persisted, false, `${opts.route} must stay fail-closed persisted:false`);
  assert.ok(typeof body.message === "string" && body.message.length > 0, `${opts.route} must keep a safe message`);
  assert.ok(typeof body.error === "string" && body.error.length > 0, `${opts.route} must mirror error for envelope parity`);
  assert.ok(!text.includes("<html"), `${opts.route} must not answer HTML`);
  assert.ok(!text.includes("MulterError"), `${opts.route} must not leak multer internals`);
  assert.ok(!text.includes("PayloadTooLargeError"), `${opts.route} must not leak limit error internals`);
  assert.ok(!text.includes("LIMIT_"), `${opts.route} must not leak multer limit codes`);
}

async function createCase(): Promise<string> {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: "qa-upload-envelope-user",
    vehicleInfo: "2015 Honda Civic",
    description: "Engine runs rough at highway speed",
    timing: "Highway Speed",
  });
  return caseId;
}

test("intake evidence 415 unsupported type answers fail-closed envelope with no mimetype echo", async () => {
  await withServer(async (origin) => {
    const marker = "QaEnvelopePdfMarker77";
    const form = intakeForm((f) => {
      f.append("photos", new Blob([Buffer.from("%PDF-1.4")], { type: "application/pdf" }), `${marker}.pdf`);
    });
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: form as unknown as BodyInit,
    });
    const text = await res.text();
    assert.equal(res.status, 415, `expected 415, got ${res.status}: ${text.slice(0, 200)}`);
    assert.match(res.headers.get("content-type") || "", /application\/json/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assertFailClosedEnvelope(JSON.parse(text), text, { code: "UNSUPPORTED_MEDIA_TYPE", route: "intake 415" });
    assert.ok(!text.includes("application/pdf"), "must not echo the attacker-controlled mimetype");
    assert.ok(!text.includes(marker), "must not echo the uploaded filename");
  });
});

test("intake evidence 413 oversized photo answers PAYLOAD_TOO_LARGE envelope", async () => {
  await withServer(async (origin) => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(13 * 1024 * 1024, 7)]);
    const form = intakeForm((f) => {
      f.append("photos", new Blob([big], { type: "image/jpeg" }), "big.jpg");
    });
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: form as unknown as BodyInit,
    });
    const text = await res.text();
    assert.equal(res.status, 413, `expected 413, got ${res.status}: ${text.slice(0, 200)}`);
    assert.match(res.headers.get("content-type") || "", /application\/json/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assertFailClosedEnvelope(JSON.parse(text), text, { code: "PAYLOAD_TOO_LARGE", route: "intake 413" });
  });
});

test("follow-up 415 unexpected field answers UPLOAD_UNEXPECTED_FIELD envelope", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair follow-up check");
    form.append("photos", new Blob(["fake"], { type: "image/jpeg" }), "photo.jpg");
    const res = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` },
      body: form as unknown as BodyInit,
    });
    const text = await res.text();
    assert.equal(res.status, 415, `expected 415, got ${res.status}: ${text.slice(0, 200)}`);
    assert.match(res.headers.get("content-type") || "", /application\/json/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assertFailClosedEnvelope(JSON.parse(text), text, { code: "UPLOAD_UNEXPECTED_FIELD", route: "follow-up 415" });
  });
});

test("follow-up 413 oversized audio answers PAYLOAD_TOO_LARGE envelope", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair follow-up check");
    form.append("audio", new Blob([new Uint8Array(51 * 1024 * 1024)], { type: "audio/mp4" }), "big.m4a");
    const res = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` },
      body: form as unknown as BodyInit,
    });
    const text = await res.text();
    assert.equal(res.status, 413, `expected 413, got ${res.status}: ${text.slice(0, 200)}`);
    assert.match(res.headers.get("content-type") || "", /application\/json/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assertFailClosedEnvelope(JSON.parse(text), text, { code: "PAYLOAD_TOO_LARGE", route: "follow-up 413" });
  });
});
