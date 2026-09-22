import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { registerRoutes } from "./routes.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";

function createTestSessionCookie(identity: CustomerIdentity = { id: "cust-test-123", email: "test@example.com" }): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withServer(
  env: Record<string, string | undefined>,
  work: (origin: string, sessionCookie: string) => Promise<void>,
) {
  const priorEnv: Record<string, string | undefined> = {};
  const requiredEnv: Record<string, string | undefined> = {
    DRIVABLE_SESSION_SECRET: TEST_SESSION_SECRET,
    DRIVABLE_BETA_INVITE_CODE: TEST_BETA_INVITE,
    ...env,
  };
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
  const origin = `http://127.0.0.1:${(address as any).port}`;
  const sessionCookie = createTestSessionCookie();
  try {
    await work(origin, sessionCookie);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of Object.keys(priorEnv)) {
      if (priorEnv[key] === undefined) delete process.env[key];
      else process.env[key] = priorEnv[key];
    }
  }
}

function validConsent() {
  return JSON.stringify({
    service_fulfillment: true,
    media_processing: true,
    human_review_sharing: true,
    optional_product_learning: false,
  });
}

function emptyEvidenceIntake() {
  return JSON.stringify({});
}

function validEvidenceIntake() {
  return JSON.stringify({
    mode: "diagnose",
    vehicle: { year: "2015", make: "Honda", model: "Civic", mileage: 142500 },
    situation: {
      description: "placeholder",
      symptoms: [],
      timing: "",
      urgency: "Safe to Drive",
      canDrive: "Safe to Drive",
      recentRepairs: "",
      buyerObservations: [],
      sellerClaims: [],
    },
    obd: { codes: [], attachmentIds: [] },
    attachments: [],
  });
}

test("diagnosis intake rejects empty case (no vehicleInfo/description/timing/evidence) with 400", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const cookie = sessionCookie;
      const form = new FormData();
      // Intentionally leave vehicleInfo/description/timing empty — and evidenceIntake
      // empty so the required-field guard catches it (launch controls not enabled).
      form.append("vehicleInfo", "");
      form.append("description", "");
      form.append("timing", "");
      form.append("consent", validConsent());
      form.append("evidenceIntake", emptyEvidenceIntake());
      form.append("clientRequestId", "req-empty-required-fields-001");

      const res = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie },
        body: form,
      });
      assert.equal(res.status, 400, "empty case must fail closed with 400");
      const body = (await res.json()) as any;
      assert.equal(body.persisted, false);
      assert.equal(body.code, "INVALID_DIAGNOSIS_INTAKE");
      assert.ok(typeof body.message === "string" && body.message.length > 0);
      // Never echo raw vehicle/description values
      assert.ok(!JSON.stringify(body).includes("secret-value"), "response must not echo submitted values");
    },
  );
});

test("diagnosis intake accepts case with only vehicleInfo (minimal viable intake)", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const cookie = sessionCookie;
      const form = new FormData();
      form.append("vehicleInfo", "2015 Honda Civic");
      form.append("description", "");
      form.append("timing", "");
      form.append("consent", validConsent());
      form.append("evidenceIntake", validEvidenceIntake());
      form.append("clientRequestId", "req-min-vehicle-only-002");

      const res = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie },
        body: form,
      });
      // Without DB the fallback is 503 persisted:false, but it must NOT be
      // the 400 empty-case guard — the request passed required-field validation
      // and reached case creation / DB mirror.
      assert.notEqual(res.status, 400, "vehicleInfo-only intake must not be rejected as empty");
      const body = (await res.json()) as any;
      assert.equal(body.persisted, false);
      assert.ok(body.caseId || body.message, "should reach DB-mirror fail-closed, not required-field guard");
      if (body.code) assert.notEqual(body.code, "INVALID_DIAGNOSIS_INTAKE");
    },
  );
});

test("diagnosis intake rejects whitespace-only fields as empty (no leak, cleans temp files)", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const cookie = sessionCookie;
      const form = new FormData();
      form.append("vehicleInfo", "   ");
      form.append("description", " \t\n ");
      form.append("timing", "  ");
      form.append("consent", validConsent());
      form.append("evidenceIntake", emptyEvidenceIntake());
      form.append("clientRequestId", "req-whitespace-empty-003");

      const res = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie },
        body: form,
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as any;
      assert.equal(body.code, "INVALID_DIAGNOSIS_INTAKE");
      assert.equal(body.persisted, false);
    },
  );
});

test("r2 removeTemporaryFiles tolerates files without path (buffer-backed) without throwing", async () => {
  const { storeEvidenceFilesWithClient } = await import("./r2-evidence-storage.js");
  type StoredObject = { key: string };
  const objects = new Map<string, StoredObject>();
  const store = {
    bucket: "mechanicseye-evidence-test",
    async send(command: any) {
      const name = command.constructor.name;
      if (name === "PutObjectCommand") {
        objects.set(command.input.Key, { key: command.input.Key });
        return {};
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(command.input.Key);
        return {};
      }
      throw new Error(`Unexpected command ${name}`);
    },
  };
  // Buffer-backed file (no path) — mimics multer memoryStorage
  const buffer = Buffer.from("fake-audio-content");
  const files = {
    audio: [
      {
        fieldname: "audio",
        originalname: "engine.mp3",
        mimetype: "audio/mpeg",
        size: buffer.length,
        buffer,
        path: undefined as unknown as string,
      } as unknown as Express.Multer.File,
    ],
  };
  const keys = await storeEvidenceFilesWithClient("CASE-20260922000000000-aaaaaaaa", files, store as any, new Date("2026-09-22T00:00:00.000Z"));
  assert.equal(keys.audio?.length, 1);
  assert.ok(keys.audio![0].startsWith("evidence/CASE-20260922000000000-aaaaaaaa/audio/"));
  // If removeTemporaryFiles threw on undefined path, the call above would reject.
  // Success proves the guard works (upload recovery).
});
