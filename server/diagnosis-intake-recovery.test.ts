import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RuntimeFileEvidenceStore, S3PrivateEvidenceStore } from "./evidence-storage.js";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";

function upload(buffer: Buffer, originalname = "dash.jpg", mimetype = "image/jpeg") {
  return { buffer, originalname, mimetype, size: buffer.length } as Express.Multer.File;
}

function jpegBytes(text = "synthetic jpeg") {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const footer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xd9]);
  return Buffer.concat([header, Buffer.from(text.repeat(64)), footer]);
}

function pngBytes() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
}

// ---------------------------------------------------------------------------
// Unit: RuntimeFileEvidenceStore multi-photo atomicity (P0 #1 mobile/upload recovery)
// A mobile user picking 2 photos where the second is corrupt/empty must not
// leave the first photo as an orphan. The whole batch must roll back.
// ---------------------------------------------------------------------------

test("runtime store rolls back multi-photo batch when second photo has MIME mismatch (no orphan)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-recovery-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const good = upload(jpegBytes("good-one"));
    const badMime = upload(pngBytes(), "bad.jpg", "image/jpeg"); // png bytes but claimed jpeg
    await assert.rejects(() => store.savePhotos("CASE-MULTI-MISMATCH", [good, badMime]), /does not match|supported image/);
    // No manifest and no orphan file must remain
    const caseRoot = path.join(root, "CASE-MULTI-MISMATCH");
    await assert.rejects(() => readFile(path.join(caseRoot, "attachments.json")), /ENOENT/);
    let entries: string[] = [];
    try { entries = await readdir(caseRoot); } catch (e: any) { if (e?.code !== "ENOENT") throw e; }
    assert.equal(entries.length, 0, "case directory must be empty or removed after rollback");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store rolls back multi-photo batch when second photo is empty (mobile picker cancel)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-recovery-empty-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const good = upload(jpegBytes("good-one"));
    const empty = upload(Buffer.alloc(0), "empty.jpg", "image/jpeg") as Express.Multer.File;
    // Override size to 0 to simulate 0-byte file from cancelled picker
    (empty as any).size = 0;
    await assert.rejects(() => store.savePhotos("CASE-MULTI-EMPTY", [good, empty]), /Empty photo|readable content/);
    const caseRoot = path.join(root, "CASE-MULTI-EMPTY");
    await assert.rejects(() => readFile(path.join(caseRoot, "attachments.json")), /ENOENT/);
    let entries: string[] = [];
    try { entries = await readdir(caseRoot); } catch (e: any) { if (e?.code !== "ENOENT") throw e; }
    assert.equal(entries.length, 0, "case directory must be cleaned after empty-file batch rollback");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store rolls back multi-photo batch when first photo is invalid (no partial write)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-recovery-first-bad-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const bad = upload(Buffer.from("MZ executable"), "fake.jpg", "image/jpeg");
    const good = upload(jpegBytes("good-two"));
    await assert.rejects(() => store.savePhotos("CASE-FIRST-BAD", [bad, good]), /supported image/);
    const caseRoot = path.join(root, "CASE-FIRST-BAD");
    await assert.rejects(() => readFile(path.join(caseRoot, "attachments.json")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Unit: S3PrivateEvidenceStore multi-photo atomicity (parity with runtime)
// ---------------------------------------------------------------------------

test("S3 store rolls back multi-photo batch when second photo has MIME mismatch (no orphan objects)", async () => {
  const written = new Set<string>();
  const client = {
    async send(command: any) {
      const name = command.constructor.name;
      const key = command.input.Key as string;
      if (name === "PutObjectCommand") { written.add(key); return {}; }
      if (name === "DeleteObjectCommand") { written.delete(key); return {}; }
      throw new Error(`Unexpected ${name}`);
    },
  };
  const store = new S3PrivateEvidenceStore({ bucket: "test", region: "test-1" }, client);
  const good = upload(jpegBytes("good-s3"));
  const badMime = upload(pngBytes(), "bad.jpg", "image/jpeg");
  await assert.rejects(() => store.savePhotos("CASE-S3-MULTI-MISMATCH", [good, badMime]), /does not match|supported image/);
  assert.equal(written.size, 0, "S3 batch must be fully rolled back after MIME mismatch");
});

test("S3 store rolls back multi-photo batch when second photo is empty (no orphan objects)", async () => {
  const written = new Set<string>();
  const client = {
    async send(command: any) {
      const name = command.constructor.name;
      const key = command.input.Key as string;
      if (name === "PutObjectCommand") { written.add(key); return {}; }
      if (name === "DeleteObjectCommand") { written.delete(key); return {}; }
      throw new Error(`Unexpected ${name}`);
    },
  };
  const store = new S3PrivateEvidenceStore({ bucket: "test", region: "test-1" }, client);
  const good = upload(jpegBytes("good-s3-2"));
  // Empty buffer with no readable path triggers the same empty-file branch as a 0-byte cancelled picker.
  // S3PrivateEvidenceStore reads from file.path when buffer is empty; give it a valid empty buffer and size 0
  // but also ensure the rejection message matches Empty photo. The store checks file.size before reading
  // when buffer is present, so we use a buffer with one byte but size 0 to hit the Empty check after read.
  const empty = { buffer: Buffer.from([0x00]), originalname: "empty.jpg", mimetype: "image/jpeg", size: 0 } as Express.Multer.File;
  await assert.rejects(() => store.savePhotos("CASE-S3-MULTI-EMPTY", [good, empty]), /Empty photo|readable content/);
  assert.equal(written.size, 0, "S3 batch must be fully rolled back after empty-file");
});

// ---------------------------------------------------------------------------
// HTTP: consent + evidence atomicity (P0 #1) — photo evidence never persisted
// when consent is missing, regardless of launch controls.
// ---------------------------------------------------------------------------

function cookieFor(identity: CustomerIdentity): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withServer(
  env: Record<string, string | undefined>,
  work: (origin: string) => Promise<void>
) {
  const priorEnv: Record<string, string | undefined> = {};
  const requiredEnv = { DRIVABLE_SESSION_SECRET: TEST_SESSION_SECRET, DRIVABLE_BETA_INVITE_CODE: TEST_BETA_INVITE, ...env };
  for (const key of Object.keys(requiredEnv)) {
    priorEnv[key] = process.env[key];
    if (requiredEnv[key] === undefined) delete process.env[key];
    else process.env[key] = requiredEnv[key];
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
    for (const key of Object.keys(priorEnv)) {
      if (priorEnv[key] === undefined) delete process.env[key];
      else process.env[key] = priorEnv[key];
    }
  }
}

function intakeFormWithPhotos(consent: Record<string, unknown>, withPhotos: boolean) {
  const form = new FormData();
  const evidenceIntake = {
    mode: "diagnose",
    vehicle: { year: "2015", make: "Toyota", model: "Corolla", mileage: 85000 },
    situation: { description: "Engine running rough at idle", symptoms: ["Engine running rough"], timing: "Idle", urgency: "Safe to Drive", canDrive: "Safe to Drive" },
    obd: { codes: ["P0300"], attachmentIds: [] },
    attachments: [],
  };
  form.append("evidenceIntake", JSON.stringify(evidenceIntake));
  form.append("consent", JSON.stringify(consent));
  if (withPhotos) {
    const bytes = jpegBytes("photo-for-consent-test");
    form.append("photos", new Blob([bytes], { type: "image/jpeg" }), "a.jpg");
  }
  form.append("evidenceIntake", JSON.stringify(evidenceIntake)); // ensure required field present (duplicate is ok, last wins)
  // Re-append consent correctly (FormData last value wins for our server's parseJsonField, but server reads consent field)
  // Actually need to ensure single entries: recreate form correctly
  return form;
}

function buildForm(consent: Record<string, unknown>, withPhoto: boolean) {
  const form = new FormData();
  const evidenceIntake = {
    mode: "diagnose",
    vehicle: { year: "2015", make: "Toyota", model: "Corolla", mileage: 85000 },
    situation: { description: "Engine running rough at idle", symptoms: ["Engine running rough"], timing: "Idle", urgency: "Safe to Drive", canDrive: "Safe to Drive" },
    obd: { codes: ["P0300"], attachmentIds: [] },
  };
  form.append("evidenceIntake", JSON.stringify(evidenceIntake));
  form.append("consent", JSON.stringify(consent));
  if (withPhoto) {
    const bytes = jpegBytes("photo-for-consent-gate");
    form.append("photos", new Blob([bytes], { type: "image/jpeg" }), "a.jpg");
  }
  return form;
}

test("HTTP intake with photos but missing media_processing consent -> 400 and no evidence persisted", async () => {
  await withServer({}, async (origin) => {
    const cookie = cookieFor({ id: "cust-recovery-1", email: "recovery1@example.test" });
    const consentMissingMedia = { service_fulfillment: true, human_review_sharing: true, optional_product_learning: false }; // media_processing absent
    const form = buildForm(consentMissingMedia, true);
    const res = await fetch(`${origin}/api/diagnoses`, { method: "POST", headers: { cookie }, body: form });
    assert.equal(res.status, 400, "must reject with 400 when media_processing consent missing and photos present");
    const body = await res.json();
    assert.match(body.message, /Consent/i);
    assert.equal(body.persisted, undefined, "400 consent rejection must not claim persisted status");
  });
});

test("HTTP intake without photos and missing media_processing consent -> passes consent gate (may be 503, not 400 consent)", async () => {
  await withServer({}, async (origin) => {
    const cookie = cookieFor({ id: "cust-recovery-2", email: "recovery2@example.test" });
    const consentMissingMedia = { service_fulfillment: true, human_review_sharing: true, optional_product_learning: false };
    const form = buildForm(consentMissingMedia, false); // no photo, media consent not required
    const res = await fetch(`${origin}/api/diagnoses`, { method: "POST", headers: { cookie }, body: form });
    // Without media, the consent gate requires only service + human_review. This must NOT be 400 consent.
    if (res.status === 400) {
      const body = await res.json().catch(() => ({} as any));
      assert.ok(!String(body.message || "").includes("Consent is required"), "without photos, missing media_processing must not trigger consent 400");
    } else {
      assert.ok([200, 503, 409].includes(res.status), `expected non-consent status, got ${res.status}`);
    }
  });
});

test("HTTP intake missing service_fulfillment -> 400 even when launch controls disabled", async () => {
  await withServer({}, async (origin) => {
    const cookie = cookieFor({ id: "cust-recovery-3", email: "recovery3@example.test" });
    const consentMissingService = { media_processing: true, human_review_sharing: true };
    const form = buildForm(consentMissingService, false);
    const res = await fetch(`${origin}/api/diagnoses`, { method: "POST", headers: { cookie }, body: form });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /Consent/i);
  });
});

test("HTTP intake missing human_review_sharing -> 400 even with photos and valid service/media", async () => {
  await withServer({}, async (origin) => {
    const cookie = cookieFor({ id: "cust-recovery-4", email: "recovery4@example.test" });
    const consentMissingHuman = { service_fulfillment: true, media_processing: true };
    const form = buildForm(consentMissingHuman, true);
    const res = await fetch(`${origin}/api/diagnoses`, { method: "POST", headers: { cookie }, body: form });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /Consent/i);
  });
});
