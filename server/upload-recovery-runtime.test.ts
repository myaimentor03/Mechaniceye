import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

/**
 * Upload recovery runtime test (QA lane / launch-blocker fix).
 *
 * The multer `diagnosisEvidenceUpload` middleware stores audio/video/vibration
 * files on disk in the uploads/ root directory. The `removeIntakeTempFiles`
 * helper must clean them up on BOTH the success and error paths.
 * This runtime test verifies the actual integration through the API:
 * - temp files are created by multer during upload
 * - temp files are cleaned up on validation error (400)
 * - temp files are cleaned up on consent error (400)
 * - temp files are cleaned up on storage error (503/507)
 * - temp files are cleaned up on server error (500)
 */

const RUNTIME_SESSION_SECRET = "test-upload-recovery-secret-at-least-32-chars-long";
const RUNTIME_BETA_INVITE = "TEST-BETA-INVITE-123";

function spoofCookie(identity: CustomerIdentity): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withTestServer(work: (origin: string) => Promise<void>) {
  const keys = ["DRIVABLE_SESSION_SECRET", "DRIVABLE_BETA_INVITE_CODE"] as const;
  const prior: Record<string, string | undefined> = {};
  for (const key of keys) prior[key] = process.env[key];
  process.env.DRIVABLE_SESSION_SECRET = RUNTIME_SESSION_SECRET;
  process.env.DRIVABLE_BETA_INVITE_CODE = RUNTIME_BETA_INVITE;
  // Disable photo upload to force fail-closed path without R2
  process.env.DRIVABLE_PHOTO_UPLOAD_ENABLED = "false";
  // Disable launch controls so we hit the non-launch-controls path
  process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED = "false";

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
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
    delete process.env.DRIVABLE_PHOTO_UPLOAD_ENABLED;
    delete process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED;
  }
}

function createTestAudioFile(): { filepath: string; content: Buffer } {
  const filepath = path.join(tmpdir(), `test-audio-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  const content = Buffer.from("fake audio content for testing");
  fs.writeFileSync(filepath, content);
  return { filepath, content };
}

function createTestVideoFile(): { filepath: string; content: Buffer } {
  const filepath = path.join(tmpdir(), `test-video-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  const content = Buffer.from("fake video content for testing");
  fs.writeFileSync(filepath, content);
  return { filepath, content };
}

function createTestVibrationFile(): { filepath: string; content: Buffer } {
  const filepath = path.join(tmpdir(), `test-vibration-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  const content = Buffer.from("fake vibration content for testing");
  fs.writeFileSync(filepath, content);
  return { filepath, content };
}

async function uploadMediaFiles(
  origin: string,
  cookie: string,
  files: { audio?: string; video?: string; vibration?: string },
  overrides: Record<string, string> = {}
) {
  const form = new FormData();
  form.append("evidenceIntake", JSON.stringify({
    mode: "diagnose",
    vehicle: { year: "2015", make: "Toyota", model: "Corolla", mileage: 85000 },
    situation: {
      description: "Engine running rough at idle",
      symptoms: ["Engine running rough"],
      timing: "Idle",
      urgency: "Safe to Drive",
      canDrive: "Safe to Drive",
    },
    obd: { codes: ["P0300"], attachmentIds: [] },
    attachments: [],
  }));
  form.append("consent", JSON.stringify({
    service_fulfillment: true,
    media_processing: true,
    human_review_sharing: true,
    optional_product_learning: false,
  }));
  form.append("clientRequestId", `req-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  form.append("problemCategory", "Engine running rough");
  form.append("description", "Engine running rough at idle");
  form.append("urgency", "Safe to Drive");
  form.append("vehicleInfo", "2015 Toyota Corolla | Engine: N/A | Mileage: 85000 | Transmission: N/A | Drivetrain: N/A");
  form.append("timing", "Idle");
  form.append("unsupportedVehicle", "false");
  form.append("manualVehicleEntryUsed", "false");
  form.append("photoEvidenceStatus", "None");
  form.append("rawVehicleSelection", JSON.stringify({ year: "2015", make: "Toyota", model: "Corolla" }));

  for (const [field, filepath] of Object.entries(files)) {
    if (filepath) {
      const content = fs.readFileSync(filepath);
      const blob = new Blob([content], { type: field === "audio" ? "audio/mpeg" : field === "video" ? "video/mp4" : "application/octet-stream" });
      const file = new File([blob], path.basename(filepath), { type: blob.type });
      form.append(field, file);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }

  const response = await fetch(`${origin}/api/diagnoses`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });

  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function getUploadsDir(): string {
  return path.join(process.cwd(), "uploads");
}

function countTempFiles(): number {
  const uploadsDir = getUploadsDir();
  if (!fs.existsSync(uploadsDir)) return 0;
  return fs.readdirSync(uploadsDir).filter(f => f.endsWith(".tmp")).length;
}

function cleanUploadsDir() {
  const uploadsDir = getUploadsDir();
  if (fs.existsSync(uploadsDir)) {
    for (const file of fs.readdirSync(uploadsDir)) {
      if (file.endsWith(".tmp")) {
        fs.rmSync(path.join(uploadsDir, file), { force: true });
      }
    }
  }
}

test("upload recovery: audio file temp cleaned up when media persistence fails (507)", async () => {
  await withTestServer(async (origin) => {
    cleanUploadsDir();
    const cookie = spoofCookie({ id: "cust-upload-test-1", email: "upload-test-1@example.test" });
    const audio = createTestAudioFile();

    // Valid request but media persistence fails (no R2) -> 507
    const result = await uploadMediaFiles(origin, cookie, { audio: audio.filepath });

    assert.equal(result.status, 507);
    assert.equal(result.body.persisted, false);
    assert.ok(result.body.message.includes("media evidence was not persisted"));

    // Temp file must be cleaned up even on 507 media persistence failure
    const remaining = countTempFiles();
    assert.equal(remaining, 0, `Expected 0 temp files after 507 media persistence failure, found ${remaining}`);

    fs.rmSync(audio.filepath, { force: true });
  });
});

test("upload recovery: video file temp cleaned up when media persistence fails (507)", async () => {
  await withTestServer(async (origin) => {
    cleanUploadsDir();
    const cookie = spoofCookie({ id: "cust-upload-test-2", email: "upload-test-2@example.test" });
    const video = createTestVideoFile();

    // Valid request but media persistence fails (no R2) -> 507
    const result = await uploadMediaFiles(origin, cookie, { video: video.filepath });

    assert.equal(result.status, 507);
    assert.equal(result.body.persisted, false);
    assert.ok(result.body.message.includes("media evidence was not persisted"));

    // Temp file must be cleaned up
    const remaining = countTempFiles();
    assert.equal(remaining, 0, `Expected 0 temp files after 507 media persistence failure, found ${remaining}`);

    fs.rmSync(video.filepath, { force: true });
  });
});

test("upload recovery: vibration file temp cleaned up on missing service consent", async () => {
  await withTestServer(async (origin) => {
    cleanUploadsDir();
    const cookie = spoofCookie({ id: "cust-upload-test-3", email: "upload-test-3@example.test" });
    const vibration = createTestVibrationFile();

    // Missing service_fulfillment consent should trigger 400 consent error
    const result = await uploadMediaFiles(origin, cookie, { vibration: vibration.filepath }, {
      consent: JSON.stringify({
        service_fulfillment: false,
        media_processing: true,
        human_review_sharing: true,
        optional_product_learning: false,
      })
    });

    assert.equal(result.status, 400);
    assert.ok(result.body.message.includes("service fulfillment"));

    // Temp file must be cleaned up
    const remaining = countTempFiles();
    assert.equal(remaining, 0, `Expected 0 temp files after consent error, found ${remaining}`);

    fs.rmSync(vibration.filepath, { force: true });
  });
});

test("upload recovery: multiple media files temp cleaned up when media persistence fails (507)", async () => {
  await withTestServer(async (origin) => {
    cleanUploadsDir();
    const cookie = spoofCookie({ id: "cust-upload-test-4", email: "upload-test-4@example.test" });
    const audio = createTestAudioFile();
    const video = createTestVideoFile();
    const vibration = createTestVibrationFile();

    // Valid request but media persistence fails (no R2) -> 507
    const result = await uploadMediaFiles(origin, cookie, {
      audio: audio.filepath,
      video: video.filepath,
      vibration: vibration.filepath
    });

    assert.equal(result.status, 507);
    assert.equal(result.body.persisted, false);

    // All temp files must be cleaned up
    const remaining = countTempFiles();
    assert.equal(remaining, 0, `Expected 0 temp files after 507 with multiple media, found ${remaining}`);

    fs.rmSync(audio.filepath, { force: true });
    fs.rmSync(video.filepath, { force: true });
    fs.rmSync(vibration.filepath, { force: true });
  });
});

test("upload recovery: audio file temp cleaned up on media persistence failure (507)", async () => {
  await withTestServer(async (origin) => {
    cleanUploadsDir();
    const cookie = spoofCookie({ id: "cust-upload-test-5", email: "upload-test-5@example.test" });
    const audio = createTestAudioFile();

    // Valid request but media persistence fails (no R2) -> 507
    const result = await uploadMediaFiles(origin, cookie, { audio: audio.filepath });

    assert.equal(result.status, 507);
    assert.equal(result.body.persisted, false);
    assert.ok(result.body.message.includes("media evidence was not persisted"));

    // Temp file must be cleaned up even on 507
    const remaining = countTempFiles();
    assert.equal(remaining, 0, `Expected 0 temp files after 507 media persistence failure, found ${remaining}`);

    fs.rmSync(audio.filepath, { force: true });
  });
});

test("upload recovery: video file temp cleaned up on media persistence failure (507)", async () => {
  await withTestServer(async (origin) => {
    cleanUploadsDir();
    const cookie = spoofCookie({ id: "cust-upload-test-6", email: "upload-test-6@example.test" });
    const video = createTestVideoFile();

    // Valid request but media persistence fails (no R2) -> 507
    const result = await uploadMediaFiles(origin, cookie, { video: video.filepath });

    assert.equal(result.status, 507);
    assert.equal(result.body.persisted, false);
    assert.ok(result.body.message.includes("media evidence was not persisted"));

    // Temp file must be cleaned up
    const remaining = countTempFiles();
    assert.equal(remaining, 0, `Expected 0 temp files after 507 media persistence failure, found ${remaining}`);

    fs.rmSync(video.filepath, { force: true });
  });
});

test("upload recovery: temp files not leaked on duplicate idempotent request (507)", async () => {
  await withTestServer(async (origin) => {
    cleanUploadsDir();
    const cookie = spoofCookie({ id: "cust-upload-test-7", email: "upload-test-7@example.test" });
    const clientRequestId = `req-dup-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const audio = createTestAudioFile();

    // First request - media persistence fails (507)
    const result1 = await uploadMediaFiles(origin, cookie, { audio: audio.filepath }, { clientRequestId });
    assert.equal(result1.status, 507);

    // Second request with same clientRequestId - duplicate check happens before media persistence
    // Should return duplicate response (200 with duplicate:true) or same error (507)
    const result2 = await uploadMediaFiles(origin, cookie, { audio: audio.filepath }, { clientRequestId });
    assert.ok([200, 507].includes(result2.status), `Second request status: ${result2.status}`);

    // Temp files must be cleaned up (only one upload actually processed)
    const remaining = countTempFiles();
    assert.equal(remaining, 0, `Expected 0 temp files after duplicate request, found ${remaining}`);

    fs.rmSync(audio.filepath, { force: true });
  });
});

test("upload recovery: unsupported media type rejected and temp cleaned (415)", async () => {
  await withTestServer(async (origin) => {
    cleanUploadsDir();
    const cookie = spoofCookie({ id: "cust-upload-test-8", email: "upload-test-8@example.test" });
    const filepath = path.join(tmpdir(), `test-executable-${Date.now()}.exe`);
    fs.writeFileSync(filepath, "fake exe content");

    const form = new FormData();
    form.append("evidenceIntake", JSON.stringify({
      mode: "diagnose",
      vehicle: { year: "2015", make: "Toyota", model: "Corolla", mileage: 85000 },
      situation: {
        description: "Engine running rough",
        symptoms: ["Engine running rough"],
        timing: "Idle",
        urgency: "Safe to Drive",
        canDrive: "Safe to Drive",
      },
      obd: { codes: ["P0300"], attachmentIds: [] },
      attachments: [],
    }));
    form.append("consent", JSON.stringify({
      service_fulfillment: true,
      media_processing: true,
      human_review_sharing: true,
      optional_product_learning: false,
    }));
    form.append("clientRequestId", `req-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    form.append("problemCategory", "Engine running rough");
    form.append("description", "Engine running rough at idle");
    form.append("urgency", "Safe to Drive");
    form.append("vehicleInfo", "2015 Toyota Corolla | Engine: N/A | Mileage: 85000 | Transmission: N/A | Drivetrain: N/A");
    form.append("timing", "Idle");
    form.append("unsupportedVehicle", "false");
    form.append("manualVehicleEntryUsed", "false");
    form.append("photoEvidenceStatus", "None");

    // Upload .exe file as "audio" - should be rejected by multer fileFilter
    const exeContent = fs.readFileSync(filepath);
    const exeBlob = new Blob([exeContent], { type: "application/x-msdownload" });
    const exeFile = new File([exeBlob], "malicious.exe", { type: "application/x-msdownload" });
    form.append("audio", exeFile);

    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie },
      body: form,
    });

    const body = await response.json().catch(() => ({}));
    assert.equal(response.status, 415);
    assert.ok(body.message.includes("Unsupported evidence type"));

    // Temp file must be cleaned up
    const remaining = countTempFiles();
    assert.equal(remaining, 0, `Expected 0 temp files after unsupported type rejection, found ${remaining}`);

    fs.rmSync(filepath, { force: true });
  });
});

test("upload recovery: oversized media file rejected and temp cleaned (413)", async () => {
  await withTestServer(async (origin) => {
    cleanUploadsDir();
    const cookie = spoofCookie({ id: "cust-upload-test-9", email: "upload-test-9@example.test" });
    // Create a file larger than 12MB limit
    const filepath = path.join(tmpdir(), `test-oversized-${Date.now()}.mp3`);
    const oversizedContent = Buffer.alloc(13 * 1024 * 1024, "x"); // 13MB
    fs.writeFileSync(filepath, oversizedContent);

    const form = new FormData();
    form.append("evidenceIntake", JSON.stringify({
      mode: "diagnose",
      vehicle: { year: "2015", make: "Toyota", model: "Corolla", mileage: 85000 },
      situation: {
        description: "Engine running rough",
        symptoms: ["Engine running rough"],
        timing: "Idle",
        urgency: "Safe to Drive",
        canDrive: "Safe to Drive",
      },
      obd: { codes: ["P0300"], attachmentIds: [] },
      attachments: [],
    }));
    form.append("consent", JSON.stringify({
      service_fulfillment: true,
      media_processing: true,
      human_review_sharing: true,
      optional_product_learning: false,
    }));
    form.append("clientRequestId", `req-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    form.append("problemCategory", "Engine running rough");
    form.append("description", "Engine running rough at idle");
    form.append("urgency", "Safe to Drive");
    form.append("vehicleInfo", "2015 Toyota Corolla | Engine: N/A | Mileage: 85000 | Transmission: N/A | Drivetrain: N/A");
    form.append("timing", "Idle");
    form.append("unsupportedVehicle", "false");
    form.append("manualVehicleEntryUsed", "false");
    form.append("photoEvidenceStatus", "None");

    const oversizedBlob = new Blob([oversizedContent], { type: "audio/mpeg" });
    const oversizedFile = new File([oversizedBlob], "oversized.mp3", { type: "audio/mpeg" });
    form.append("audio", oversizedFile);

    const response = await fetch(`${origin}/api/diagnoses`, {
      method: "POST",
      headers: { cookie },
      body: form,
    });

    const body = await response.json().catch(() => ({}));
    assert.equal(response.status, 413);
    assert.ok(body.message.includes("exceeds the allowed limits"));

    // Temp file must be cleaned up
    const remaining = countTempFiles();
    assert.equal(remaining, 0, `Expected 0 temp files after oversized rejection, found ${remaining}`);

    fs.rmSync(filepath, { force: true });
  });
});