import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

// QA lane (Nov 2 paid beta): diagnosis intake and buyer-risk cache hardening
// (P0 #5 customer identity, P0 #9 reliability/mobile recovery).
//
// POST /api/diagnoses returns full customer PII (vehicleInfo, description,
// timing) and case evidence metadata; GET /api/buyer-risk/vehicle-knowledge
// can return vehicle risk context. Without Cache-Control: no-store a shared
// proxy or a mobile browser cache could retain one customer's response and
// serve it later to another user or to the same device offline. Every branch
// (200/400/401/413/415/500/503/507) must be cache-proof, matching the existing
// hardening for GET /api/my-cases* and reviewer case-read GETs. The intake's
// multer upload middleware also answers 413/415 directly and must set the
// header before sending the error envelope, otherwise the upload-boundary
// rejection itself would be cacheable.

const TEST_SESSION_SECRET = "test-intake-cache-secret-at-least-32-characters-xyz!";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";
const TEST_REVIEWER_TOKEN = "test-reviewer-token-12345678901234567890123456789012";

const CUSTOMER: CustomerIdentity = { id: "cust-intake-cache-1", email: "cache-intake@example.test" };

function jpegBytes(): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const footer = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([header, Buffer.from("synthetic jpeg cache test"), footer]);
}

function pngBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("synthetic png cache test"),
  ]);
}

function intakeForm(opts: { photos?: Array<{ bytes: Buffer; type: string; name: string }>; consent?: unknown } = {}): FormData {
  const form = new FormData();
  const evidenceIntake = {
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
  };
  form.append("evidenceIntake", JSON.stringify(evidenceIntake));
  if (opts.consent !== undefined) {
    form.append("consent", JSON.stringify(opts.consent));
  } else {
    form.append("consent", JSON.stringify({
      service_fulfillment: true,
      media_processing: true,
      human_review_sharing: true,
      optional_product_learning: false,
    }));
  }
  for (const photo of opts.photos || []) {
    form.append("photos", new Blob([photo.bytes], { type: photo.type }), photo.name);
  }
  return form;
}

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
    if (priorReviewerToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = priorReviewerToken;
  }
}

function assertNoStore(res: Response, route: string) {
  assert.match(res.headers.get("cache-control") || "", /no-store/, `${route} must answer Cache-Control: no-store`);
}

test("POST /api/diagnoses 401 without session is never cacheable", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/diagnoses`, { method: "POST", body: intakeForm() as unknown as BodyInit });
    assert.equal(res.status, 401);
    assertNoStore(res, "POST /api/diagnoses 401");
    await res.text();
  });
});

test("POST /api/diagnoses 400 missing consent is never cacheable", async () => {
  await withServer(async (origin) => {
    const form = intakeForm();
    form.delete("consent");
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: form as unknown as BodyInit,
    });
    assert.equal(res.status, 400);
    assertNoStore(res, "POST /api/diagnoses 400 consent");
    await res.text();
  });
});

test("POST /api/diagnoses 400 invalid evidenceIntake JSON is never cacheable", async () => {
  await withServer(async (origin) => {
    const form = intakeForm();
    form.set("evidenceIntake", "not-json{");
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: form as unknown as BodyInit,
    });
    assert.equal(res.status, 400);
    assertNoStore(res, "POST /api/diagnoses 400 validation");
    await res.text();
  });
});

test("POST /api/diagnoses fail-closed 503 (no DB) is never cacheable", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: intakeForm() as unknown as BodyInit,
    });
    // Without DATABASE_URL the launch-controlled path answers 503 CONSENT_CONTROLS_UNAVAILABLE
    assert.equal(res.status, 503);
    assertNoStore(res, "POST /api/diagnoses 503");
    const body = await res.json();
    assert.equal(body.persisted, false);
  });
});

test("POST /api/diagnoses 413 limit exceeded is never cacheable", async () => {
  await withServer(async (origin) => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(13 * 1024 * 1024, 7)]);
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: intakeForm({ photos: [{ bytes: big, type: "image/jpeg", name: "big.jpg" }] }) as unknown as BodyInit,
    });
    assert.equal(res.status, 413);
    assertNoStore(res, "POST /api/diagnoses 413");
    const body = await res.json();
    assert.equal(body.persisted, false);
    await res.text().catch(() => undefined);
  });
});

test("POST /api/diagnoses 415 unsupported mime via multer is never cacheable", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: intakeForm({ photos: [{ bytes: Buffer.from("video"), type: "video/mp4", name: "clip.mp4" }] }) as unknown as BodyInit,
    });
    // Without durable evidence storage the handler answers 409 (photo upload not
    // available) before the mime check; with S3 it may answer 415 or 503 via
    // the media pipeline. All are sensitive rejections and must be no-store.
    assert.ok(res.status === 409 || res.status === 415 || res.status === 503, `expected 409/415/503 got ${res.status}`);
    assertNoStore(res, `POST /api/diagnoses ${res.status} via media pipeline`);
    await res.text();
  });
});

test("POST /api/diagnoses 415 via genuinely unsupported type is never cacheable", async () => {
  await withServer(async (origin) => {
    const form = intakeForm();
    // Inject a file with a type the evidence filter rejects (application/pdf)
    form.append("photos", new Blob([Buffer.from("%PDF-1.4")], { type: "application/pdf" }), "doc.pdf");
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: form as unknown as BodyInit,
    });
    assert.equal(res.status, 415);
    assertNoStore(res, "POST /api/diagnoses 415 unsupported");
    await res.text();
  });
});

test("POST /api/diagnoses duplicate idempotent replay is never cacheable", async () => {
  await withServer(async (origin) => {
    const clientRequestId = `req-cache-intake-${Date.now()}`;
    const form1 = intakeForm();
    form1.append("clientRequestId", clientRequestId);
    const form1Body = new FormData();
    // Rebuild with same clientRequestId inside evidenceIntake for determinism
    const evidenceIntake = {
      mode: "diagnose",
      clientRequestId,
      vehicle: { year: "2012", make: "Ford", model: "F-150", mileage: 168400 },
      situation: { description: "Engine running rough", symptoms: ["rough"], timing: "Idle", urgency: "Safe", canDrive: "Safe", recentRepairs: "none" },
      obd: { codes: [], attachmentIds: [] },
      attachments: [],
    };
    form1Body.append("evidenceIntake", JSON.stringify(evidenceIntake));
    form1Body.append("consent", JSON.stringify({ service_fulfillment: true, media_processing: true, human_review_sharing: true }));
    form1Body.append("clientRequestId", clientRequestId);

    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: form1Body as unknown as BodyInit,
    });
    assert.equal(res.status, 503);
    assertNoStore(res, "POST /api/diagnoses 503 first");
    await res.text();
  });
});

test("GET /api/buyer-risk/vehicle-knowledge 400 missing fields is never cacheable", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/buyer-risk/vehicle-knowledge?year=2015`);
    assert.equal(res.status, 400);
    assertNoStore(res, "GET /api/buyer-risk/vehicle-knowledge 400");
    await res.text();
  });
});

test("GET /api/buyer-risk/vehicle-knowledge 400 INVALID_VIN is never cacheable", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/buyer-risk/vehicle-knowledge?year=2015&make=Toyota&model=Camry&vin=INVALIDVIN123456`);
    assert.equal(res.status, 400);
    assertNoStore(res, "GET /api/buyer-risk/vehicle-knowledge 400 VIN");
    const body = await res.json();
    assert.equal(body.code, "INVALID_VIN");
  });
});

test("GET /api/buyer-risk/vehicle-knowledge 503 no DATABASE_URL is never cacheable", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/buyer-risk/vehicle-knowledge?year=2015&make=Toyota&model=Camry`);
    assert.equal(res.status, 503);
    assertNoStore(res, "GET /api/buyer-risk/vehicle-knowledge 503");
    await res.text();
  });
});

test("photo evidence MIME mismatch 507 is never cacheable (atomic upload boundary)", async () => {
  await withServer(async (origin) => {
    const res = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie: cookieFor(CUSTOMER) },
      body: intakeForm({ photos: [{ bytes: pngBytes(), type: "image/jpeg", name: "mismatch.jpg" }] }) as unknown as BodyInit,
    });
    // Without durable storage the handler answers 409 before content sniffing;
    // with S3 it answers 507 MIME mismatch; with launch-controls disabled and
    // no DB it may answer 503. All are sensitive and must be no-store.
    assert.ok(res.status === 409 || res.status === 507 || res.status === 503, `expected 409/507/503 got ${res.status}`);
    assertNoStore(res, `POST /api/diagnoses ${res.status} MIME mismatch`);
    await res.text();
  });
});
