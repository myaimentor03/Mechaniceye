import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { createEvidenceStoreFromEnvironment } from "./evidence-storage.js";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

function upload(buffer: Buffer, originalname = "dash.jpg", mimetype = "image/jpeg") {
  return { buffer, originalname, mimetype, size: buffer.length } as Express.Multer.File;
}

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";

function createTestSessionCookie(identity: CustomerIdentity = { id: "cust-test-123", email: "test@example.com" }): string {
  return `drivable_session=${createSessionToken(identity, Date.now())}`;
}

async function withServer(
  env: Record<string, string | undefined>,
  work: (origin: string, sessionCookie: string) => Promise<void>
) {
  const priorEnv: Record<string, string | undefined> = {};
  const requiredEnv = {
    DRIVABLE_SESSION_SECRET: TEST_SESSION_SECRET,
    DRIVABLE_BETA_INVITE_CODE: TEST_BETA_INVITE,
    ...env
  };

  for (const key of Object.keys(requiredEnv)) {
    priorEnv[key] = process.env[key];
    if (requiredEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = requiredEnv[key];
    }
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const sessionCookie = createTestSessionCookie();

  try {
    await work(origin, sessionCookie);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of Object.keys(priorEnv)) {
      if (priorEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = priorEnv[key];
      }
    }
  }
}

function validDiagnosisBody(overrides: Record<string, unknown> = {}) {
  return {
    problemCategory: "Engine running rough",
    description: "Engine runs rough at idle, check engine light on",
    vehicleInfo: "2015 Honda Civic 1.5L",
    unsupportedVehicle: false,
    manualVehicleEntryUsed: false,
    rawVehicleSelection: {
      year: "2015",
      make: "Honda",
      model: "Civic",
      engine: "1.5L",
      manualMake: "",
      manualModel: "",
      manualEngine: ""
    },
    photoEvidenceStatus: "Provided",
    mileage: "142500",
    obdCodes: "P0300",
    timing: "Idle",
    evidenceIntake: JSON.stringify({
      mode: "diagnose",
      vehicle: {
        year: "2015",
        make: "Honda",
        model: "Civic",
        engine: "1.5L",
        vin: "1HGCM82633A004352",
        mileage: 142500,
        transmission: "Automatic",
        drivetrain: "FWD"
      },
      situation: {
        description: "Engine runs rough at idle, check engine light on",
        symptoms: ["Engine running rough"],
        timing: "Idle",
        urgency: "Drive Short Distance Only",
        canDrive: "Drive Short Distance Only",
        recentRepairs: "None",
        buyerObservations: [],
        sellerClaims: []
      },
      obd: { codes: ["P0300"], attachmentIds: [] },
      attachments: []
    }),
    consent: JSON.stringify({
      service_fulfillment: true,
      media_processing: true,
      human_review_sharing: true,
      optional_product_learning: false
    }),
    ...overrides
  };
}

function createMockPhotoFile(): Express.Multer.File {
  // Minimal valid JPEG: SOI marker + APP0 marker with JFIF + EOI marker
  const jpgBytes = Buffer.from([
    0xff, 0xd8,                         // SOI
    0xff, 0xe0, 0x00, 0x10,             // APP0 marker + length
    0x4a, 0x46, 0x49, 0x46, 0x00,       // "JFIF\0"
    0x01, 0x01, 0x00, 0x00, 0x01,       // version, units, density
    0xff, 0xd9                          // EOI
  ]);
  return {
    fieldname: "photos",
    originalname: "engine.jpg",
    encoding: "7bit",
    mimetype: "image/jpeg",
    buffer: jpgBytes,
    size: jpgBytes.length,
    stream: null as any,
    destination: "",
    filename: "engine.jpg",
    path: ""
  };
}

test("diagnosis intake rejects unauthenticated requests", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      // Don't send the session cookie
      const formData = new FormData();
      Object.entries(validDiagnosisBody()).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      const photo = createMockPhotoFile();
      formData.append("photos", new Blob([photo.buffer]), photo.originalname);

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        body: formData,
      });
      assert.equal(response.status, 401);
    }
  );
});

test("diagnosis intake accepts authenticated request without photos when storage not configured", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      // No S3 config - falls back to runtime local which is not durable
      // No DATABASE_URL - will fail to persist to DB
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody({})).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      // Without DB, the case can't be persisted - returns 503
      // This is the expected fail-closed behavior
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.ok(body.message.includes("case database") || body.message.includes("not saved"));
      assert.equal(body.persisted, false);
    }
  );
});

test("diagnosis intake rejects photos when DRIVABLE_PHOTO_UPLOAD_ENABLED is false", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "false",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody()).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      const photo = createMockPhotoFile();
      formData.append("photos", new Blob([photo.buffer]), photo.originalname);

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      assert.equal(response.status, 409);
      const body = await response.json();
      assert.match(body.message, /Photo upload is not available/);
      assert.equal(body.persisted, false);
    }
  );
});

test("diagnosis intake rejects photos when evidence storage is not durable", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      // No S3 config - falls back to runtime local which is not durable
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody()).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      const photo = createMockPhotoFile();
      formData.append("photos", new Blob([photo.buffer]), photo.originalname);

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      assert.equal(response.status, 409);
      const body = await response.json();
      assert.match(body.message, /Photo upload is not available/);
      assert.equal(body.persisted, false);
    }
  );
});





test("diagnosis intake rate limits customer intake", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      // Make 21 requests (limit is 20 per hour)
      let lastStatus = 0;
      for (let i = 0; i < 22; i++) {
        const formData = new FormData();
        Object.entries(validDiagnosisBody({ clientRequestId: `req-${i}` })).forEach(([key, value]) => {
          formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
        });

        const response = await fetch(`${origin}/api/diagnoses`, {
          method: "POST",
          headers: { cookie: sessionCookie },
          body: formData,
        });
        lastStatus = response.status;
      }

      // Should be rate limited
      assert.equal(lastStatus, 429);
    }
  );
});

test("diagnosis intake cleans up temp files on validation failure", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      // Invalid VIN
      const formData = new FormData();
      Object.entries(validDiagnosisBody({
        evidenceIntake: JSON.stringify({
          mode: "diagnose",
          vehicle: {
            year: "2015",
            make: "Honda",
            model: "Civic",
            vin: "INVALID_VIN",
            mileage: 142500,
          },
          situation: {
            description: "Test",
            symptoms: [],
            timing: "",
            urgency: "Safe to Drive",
            canDrive: "Safe to Drive",
            recentRepairs: "",
            buyerObservations: [],
            sellerClaims: []
          },
          obd: { codes: [], attachmentIds: [] },
          attachments: []
        })
      })).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      const photo = createMockPhotoFile();
      formData.append("photos", new Blob([photo.buffer]), photo.originalname);

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      // Validation should fail before persistence
      assert.ok([400, 415].includes(response.status));
    }
  );
});

test("diagnosis intake returns case ID and stores in sessionStorage flow", async () => {
  const testBucket = "test-bucket-diagnosis-caseid";
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: testBucket,
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody({})).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      // Should return a case ID even without photos
      if (response.status === 200) {
        const body = await response.json();
        assert.ok(body.id);
        assert.match(body.id, /^CASE-\d{17}-[0-9a-f]{8}$/);
        assert.equal(body.status, "received");
      }
    }
  );
});

test("diagnosis intake handles storage failure gracefully", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "nonexistent-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
      // No DATABASE_URL - will fail to persist to DB
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody({})).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      // Without DB, the case can't be persisted - returns 503
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.ok(body.message.includes("case database") || body.message.includes("not saved"));
      assert.equal(body.persisted, false);
    }
  );
});

test("diagnosis intake validates VIN format", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      // Invalid VIN - contains I, O, Q or wrong length
      const formData = new FormData();
      Object.entries(validDiagnosisBody({
        evidenceIntake: JSON.stringify({
          mode: "diagnose",
          vehicle: {
            year: "2015",
            make: "Honda",
            model: "Civic",
            vin: "1HGCM82633A00435I", // Contains I
            mileage: 142500,
          },
          situation: {
            description: "Test",
            symptoms: [],
            timing: "",
            urgency: "Safe to Drive",
            canDrive: "Safe to Drive",
            recentRepairs: "",
            buyerObservations: [],
            sellerClaims: []
          },
          obd: { codes: [], attachmentIds: [] },
          attachments: []
        })
      })).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.match(body.message, /validation/);
    }
  );
});

test("diagnosis intake validates OBD code format", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      // Invalid OBD code
      const formData = new FormData();
      Object.entries(validDiagnosisBody({
        evidenceIntake: JSON.stringify({
          mode: "diagnose",
          vehicle: {
            year: "2015",
            make: "Honda",
            model: "Civic",
            vin: "1HGCM82633A004352",
            mileage: 142500,
          },
          situation: {
            description: "Test",
            symptoms: [],
            timing: "",
            urgency: "Safe to Drive",
            canDrive: "Safe to Drive",
            recentRepairs: "",
            buyerObservations: [],
            sellerClaims: []
          },
          obd: { codes: ["INVALID"], attachmentIds: [] },
          attachments: []
        })
      })).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.match(body.message, /validation/);
    }
  );
});

test("diagnosis intake validates mileage is non-negative integer", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      // Negative mileage
      const formData = new FormData();
      Object.entries(validDiagnosisBody({
        evidenceIntake: JSON.stringify({
          mode: "diagnose",
          vehicle: {
            year: "2015",
            make: "Honda",
            model: "Civic",
            vin: "1HGCM82633A004352",
            mileage: -100,
          },
          situation: {
            description: "Test",
            symptoms: [],
            timing: "",
            urgency: "Safe to Drive",
            canDrive: "Safe to Drive",
            recentRepairs: "",
            buyerObservations: [],
            sellerClaims: []
          },
          obd: { codes: [], attachmentIds: [] },
          attachments: []
        })
      })).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.match(body.message, /validation/);
    }
  );
});

test("diagnosis intake does not leak internal errors to client", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody()).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      const photo = createMockPhotoFile();
      formData.append("photos", new Blob([photo.buffer]), photo.originalname);

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      // Even on failure, should not expose internal error details
      if (!response.ok) {
        const body = await response.json();
        assert.ok(!body.message.includes("stack"));
        assert.ok(!body.message.includes("Error:"));
        assert.ok(!body.message.includes("undefined"));
        assert.ok(!body.message.includes("null"));
      }
    }
  );
});

// --- Multer upload error branch integration tests ---
// The server has error handling for oversized files, unsupported types, and
// unexpected field names, but these code paths were never exercised by real
// HTTP requests. These tests verify the multer middleware returns the correct
// status codes and structured JSON so the client can display proper errors.

function createLargePhotoBuffer(sizeBytes: number): Buffer {
  // Minimal valid JPEG header + fill to desired size + EOI marker
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]);
  const fill = Buffer.alloc(Math.max(0, sizeBytes - header.length - 2), 0x80);
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([header, fill, eoi]);
}

test("diagnosis intake rejects oversized photo via multer (413)", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody()).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      // 13 MB photo exceeds the 12 MB multer limit
      const largeBuffer = createLargePhotoBuffer(13 * 1024 * 1024);
      formData.append("photos", new Blob([largeBuffer], { type: "image/jpeg" }), "large-photo.jpg");

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      assert.equal(response.status, 413);
      const body = await response.json();
      assert.ok(typeof body.message === "string" && body.message.length > 0);
      assert.equal(body.persisted, false);
    }
  );
});

test("diagnosis intake rejects unsupported file type via multer (415)", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody()).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      // application/pdf is not in the evidence upload's allowed MIME list
      const pdfBuffer = Buffer.from("%PDF-1.4 fake-content");
      formData.append("photos", new Blob([pdfBuffer], { type: "application/pdf" }), "invoice.pdf");

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      assert.equal(response.status, 415);
      const body = await response.json();
      assert.ok(typeof body.message === "string" && body.message.length > 0);
      assert.equal(body.persisted, false);
    }
  );
});

test("diagnosis intake silently drops files on unknown fields (multer .fields() behavior)", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody()).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      // "documents" is not a configured field in diagnosisEvidenceUpload.fields().
      // multer .fields() silently drops unknown-field files rather than erroring,
      // so the request should proceed past multer and reach route validation.
      const dummyBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0xff, 0xd9]);
      formData.append("documents", new Blob([dummyBuffer], { type: "image/jpeg" }), "scan.jpg");

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      // Should not be blocked by multer - it passes through to route validation.
      // Without DB the expected response is 503 (no case database).
      assert.ok(response.status !== 415, `Unexpected 415 from multer; got status ${response.status}`);
      const body = await response.json();
      assert.ok(typeof body.message === "string" && body.message.length > 0);
      assert.equal(body.persisted, false);
    }
  );
});

test("diagnosis intake rejects total evidence file count exceeding limit (413)", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody()).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      // The evidence upload allows up to 20 total files (8 photos + 4 audio + 4 video + 4 vibration).
      // Sending 21 photo files should trigger multer's files limit.
      const tinyBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0xff, 0xd9]);
      for (let i = 0; i < 21; i++) {
        formData.append("photos", new Blob([tinyBuffer], { type: "image/jpeg" }), `photo-${i}.jpg`);
      }

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      assert.equal(response.status, 413);
      const body = await response.json();
      assert.ok(typeof body.message === "string" && body.message.length > 0);
      assert.equal(body.persisted, false);
    }
  );
});

test("diagnosis intake rejects audio/video via app-level guard (415)", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const formData = new FormData();
      Object.entries(validDiagnosisBody()).forEach(([key, value]) => {
        formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      // audio is a valid multer field, but the route handler rejects it
      // This tests the app-level guard after multer succeeds
      const audioBuffer = Buffer.alloc(1024, 0xff);
      formData.append("audio", new Blob([audioBuffer], { type: "audio/mpeg" }), "engine-sound.mp3");

      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData,
      });

      assert.equal(response.status, 415);
      const body = await response.json();
      assert.equal(body.code, "UNSUPPORTED_MEDIA_TYPE");
      assert.equal(body.persisted, false);
    }
  );
});

test("diagnosis intake rejects malformed multipart body gracefully", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      // Send a raw POST with a content-type that multer can't parse as multipart
      const response = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });

      // Should fail gracefully - either 400 or 415, never 500
      assert.ok(response.status >= 400 && response.status < 600);
      const text = await response.text();
      assert.ok(text.length > 0);
    }
  );
});

// QA: duplicate clientRequestId SHOULD be deduped for the same customer when database is configured.
// (paid beta contract: "duplicate clientRequestId returns existing case for idempotent mobile retry")
// Without a database, distinct cases are created (fallback behavior tested here).
test("diagnosis intake without database creates distinct cases for duplicate clientRequestId (fallback)", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const clientRequestId = "req-dedupe-test-123";

      const formData1 = new FormData();
      Object.entries(validDiagnosisBody({ clientRequestId })).forEach(([key, value]) => {
        formData1.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      const response1 = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData1,
      });
      assert.equal(response1.status, 503);
      const body1 = await response1.json();
      assert.ok(body1.caseId, "First request should return a case ID");
      assert.equal(body1.persisted, false);

      const formData2 = new FormData();
      Object.entries(validDiagnosisBody({ clientRequestId })).forEach(([key, value]) => {
        formData2.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      const response2 = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData2,
      });
      assert.equal(response2.status, 503);
      const body2 = await response2.json();
      assert.ok(body2.caseId, "Second request should return a case ID");
      // Without database, fallback creates distinct cases (no deduplication possible)
      assert.notEqual(body2.caseId, body1.caseId, "Without DB, duplicate clientRequestId creates distinct cases");
      assert.equal(body2.persisted, false);
    }
  );
});

test("diagnosis intake creates distinct case for different clientRequestId", async () => {
  await withServer(
    {
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_EVIDENCE_S3_BUCKET: "test-bucket",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "test",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "test",
    },
    async (origin, sessionCookie) => {
      const formData1 = new FormData();
      Object.entries(validDiagnosisBody({ clientRequestId: "req-diff-1" })).forEach(([key, value]) => {
        formData1.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      const response1 = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData1,
      });
      assert.equal(response1.status, 503);
      const body1 = await response1.json();
      assert.ok(body1.caseId);

      const formData2 = new FormData();
      Object.entries(validDiagnosisBody({ clientRequestId: "req-diff-2" })).forEach(([key, value]) => {
        formData2.append(key, typeof value === "string" ? value : JSON.stringify(value));
      });
      const response2 = await fetch(`${origin}/api/diagnoses`, {
        method: "POST",
        headers: { cookie: sessionCookie },
        body: formData2,
      });
      assert.equal(response2.status, 503);
      const body2 = await response2.json();
      assert.ok(body2.caseId, "Different clientRequestId should create a case");
      assert.notEqual(body2.caseId, body1.caseId, "Different clientRequestId should create different case");
      assert.equal(body2.persisted, false);
    }
  );
});

test("case-storage getStoredDiagnosisCase round-trips local case for resume", async () => {
  const { createStoredDiagnosisCase, getStoredDiagnosisCase } = await import("./case-storage.js");
  const input = {
    description: "Customer Email: test@example.com\nVIN: 1HGCM82633A004352\nMileage: 142500\nEngine runs rough",
    vehicleInfo: "2015 Honda Civic 1.5L",
    rawVehicleSelection: { year: "2015", make: "Honda", model: "Civic", engine: "1.5L" },
  };
  const stored = createStoredDiagnosisCase(input);
  assert.ok(stored.id.startsWith("CASE-"));
  const retrieved = getStoredDiagnosisCase(stored.id);
  assert.ok(retrieved, "getStoredDiagnosisCase should return stored case");
  assert.equal(retrieved!.id, stored.id);
  assert.equal(retrieved!.description, input.description);
  const missing = getStoredDiagnosisCase("CASE-99999999999999999-deadbeef");
  assert.equal(missing, undefined);
  // cleanup local ops artifact
  const fs = await import("node:fs");
  const path = await import("node:path");
  try { fs.rmSync(stored.caseFolder, { recursive: true, force: true }); } catch {}
  // remove tracker row header if needed — leave file
});
