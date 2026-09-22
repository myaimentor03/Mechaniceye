import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { registerRoutes } from "./routes.js";
import { randomUUID } from "node:crypto";
import { createSessionToken, type CustomerIdentity } from "./customer-auth.js";

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters-long";
const TEST_BETA_INVITE = "TEST-BETA-INVITE-123";
const TEST_REVIEWER_TOKEN = "test-reviewer-token-12345678901234567890123456789012";
const EVIDENCE_ROOT = path.join(process.cwd(), "uploads", "evidence");

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
    DRIVABLE_REVIEWER_TOKEN: TEST_REVIEWER_TOKEN,
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

function safeCaseSegment(value: string): string {
  if (value === ".." || value.includes("..")) throw new Error("Invalid server case ID");
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,126}[a-zA-Z0-9])?$/.test(value)) throw new Error("Invalid server case ID");
  return value;
}

function validJpegBytes(): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const footer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xd9]);
  return Buffer.concat([header, Buffer.from("test".repeat(64)), footer]);
}

async function createTestAttachment(caseId: string, attachmentId: string, mimeType = "image/jpeg"): Promise<string> {
  const caseRoot = path.join(EVIDENCE_ROOT, safeCaseSegment(caseId));
  await fs.mkdir(caseRoot, { recursive: true });
  const extension = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/png" ? ".png" : ".webp";
  const fileName = `${attachmentId}${extension}`;
  const filePath = path.join(caseRoot, fileName);
  await fs.writeFile(filePath, validJpegBytes());
  const attachment = {
    id: attachmentId,
    caseId,
    kind: "photo",
    originalName: `test${extension}`,
    mimeType,
    byteSize: 1024,
    status: "persisted",
    serverAttachmentId: attachmentId,
    storageKey: path.posix.join("evidence", safeCaseSegment(caseId), fileName),
    createdAt: new Date().toISOString(),
    provenance: "uploaded_media",
    analysisStatus: "uploaded_not_analyzed",
  };
  await fs.writeFile(path.join(caseRoot, "attachments.json"), JSON.stringify([attachment], null, 2), "utf8");
  return filePath;
}

async function cleanupTestCase(caseId: string): Promise<void> {
  const caseRoot = path.join(EVIDENCE_ROOT, safeCaseSegment(caseId));
  try {
    await fs.rm(caseRoot, { recursive: true, force: true });
  } catch {}
}

const TEST_CASE_ID = "test-evidence-retrieval-case";
const TEST_ATTACHMENT_ID = randomUUID();

test("reviewer evidence retrieval requires reviewer token", async () => {
  await withServer({}, async (origin) => {
    const response = await fetch(`${origin}/api/internal/evidence/${TEST_CASE_ID}/${TEST_ATTACHMENT_ID}`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "REVIEWER_AUTH_REQUIRED");
  });
});

test("reviewer evidence retrieval rejects invalid reviewer token", async () => {
  await withServer({}, async (origin) => {
    const response = await fetch(`${origin}/api/internal/evidence/${TEST_CASE_ID}/${TEST_ATTACHMENT_ID}`, {
      headers: { authorization: "Bearer wrong-token" }
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "REVIEWER_AUTH_REQUIRED");
  });
});

test("reviewer evidence retrieval returns 404 for missing case", async () => {
  await withServer({}, async (origin) => {
    const response = await fetch(`${origin}/api/internal/evidence/non-existent-case/${TEST_ATTACHMENT_ID}`, {
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
    });
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "Evidence attachment not found.");
  });
});

test("reviewer evidence retrieval returns 404 for missing attachment in existing case", async () => {
  await createTestAttachment(TEST_CASE_ID, TEST_ATTACHMENT_ID);
  try {
    await withServer({}, async (origin) => {
      const response = await fetch(`${origin}/api/internal/evidence/${TEST_CASE_ID}/missing-attachment`, {
        headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
      });
      assert.equal(response.status, 404);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.error, "Evidence attachment not found.");
    });
  } finally {
    await cleanupTestCase(TEST_CASE_ID);
  }
});

test("reviewer evidence retrieval rejects path traversal in case ID", async () => {
  await withServer({}, async (origin) => {
    const response = await fetch(`${origin}/api/internal/evidence/..%2F..%2Fetc%2Fpasswd/${TEST_ATTACHMENT_ID}`, {
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
    });
    assert.ok(response.status === 400 || response.status === 404 || response.status === 502);
  });
});

test("reviewer evidence retrieval rejects path traversal in attachment ID", async () => {
  await withServer({}, async (origin) => {
    const response = await fetch(`${origin}/api/internal/evidence/${TEST_CASE_ID}/..%2F..%2Fetc%2Fpasswd`, {
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
    });
    assert.ok(response.status === 400 || response.status === 404 || response.status === 502);
  });
});

test("reviewer evidence retrieval returns attachment with correct headers", async () => {
  await createTestAttachment(TEST_CASE_ID, TEST_ATTACHMENT_ID);
  try {
    await withServer({}, async (origin) => {
      const response = await fetch(`${origin}/api/internal/evidence/${TEST_CASE_ID}/${TEST_ATTACHMENT_ID}`, {
        headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      assert.ok(response.headers.get("content-length"));
      assert.ok(response.headers.get("content-disposition")?.includes("inline"));
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      const body = await response.arrayBuffer();
      assert.ok(body.byteLength > 0);
    });
  } finally {
    await cleanupTestCase(TEST_CASE_ID);
  }
});

test("reviewer evidence retrieval returns 400 INVALID_EVIDENCE_ID for traversal in case ID (fail-closed)", async () => {
  await withServer({}, async (origin) => {
    const response = await fetch(`${origin}/api/internal/evidence/..%2F..%2Fetc%2Fpasswd/${TEST_ATTACHMENT_ID}`, {
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "INVALID_EVIDENCE_ID");
    assert.equal(body.error, "Invalid evidence identifier.");
    const text = JSON.stringify(body);
    assert.ok(!text.includes("stack"), "must not leak stack");
    assert.ok(!text.includes("Error"), "must not leak internal error");
  });
});

test("reviewer evidence retrieval returns 400 INVALID_EVIDENCE_ID for traversal in attachment ID (fail-closed)", async () => {
  await withServer({}, async (origin) => {
    const response = await fetch(`${origin}/api/internal/evidence/${TEST_CASE_ID}/..%2F..%2Fetc%2Fpasswd`, {
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "INVALID_EVIDENCE_ID");
    const text = JSON.stringify(body);
    assert.ok(!text.includes("stack"));
  });
});

test("reviewer evidence retrieval returns 400 for blank attachment ID", async () => {
  await withServer({}, async (origin) => {
    const response = await fetch(`${origin}/api/internal/evidence/${TEST_CASE_ID}/%20`, {
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, "INVALID_EVIDENCE_ID");
  });
});

test("reviewer evidence retrieval returns 400 for oversized case ID", async () => {
  await withServer({}, async (origin) => {
    const oversized = "a".repeat(200);
    const response = await fetch(`${origin}/api/internal/evidence/${oversized}/${TEST_ATTACHMENT_ID}`, {
      headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, "INVALID_EVIDENCE_ID");
  });
});

test("reviewer evidence retrieval returns 404 for well-formed but missing attachment (no stack, no PII)", async () => {
  await createTestAttachment(TEST_CASE_ID, TEST_ATTACHMENT_ID);
  try {
    await withServer({}, async (origin) => {
      const missingId = randomUUID();
      const response = await fetch(`${origin}/api/internal/evidence/${TEST_CASE_ID}/${missingId}`, {
        headers: { authorization: `Bearer ${TEST_REVIEWER_TOKEN}` }
      });
      assert.equal(response.status, 404);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.error, "Evidence attachment not found.");
      const text = JSON.stringify(body);
      assert.ok(!text.includes("stack"));
      assert.ok(!text.includes("evidence"));
    });
  } finally {
    await cleanupTestCase(TEST_CASE_ID);
  }
});