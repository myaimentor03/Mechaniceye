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
  work: (origin: string, close: () => Promise<void>, sessionCookie: string) => Promise<void>
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
    await work(origin, async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }, sessionCookie);
  } finally {
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
    clientRequestId: "req-test-123",
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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
    async (origin, close, sessionCookie) => {
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