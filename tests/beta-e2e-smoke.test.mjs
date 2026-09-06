import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createS3Stub } from "../scripts/lib/s3-stub.mjs";
import { mintSessionToken, sessionCookieHeader } from "../scripts/lib/session-token.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SMOKE_SCRIPT = path.join(__dirname, "..", "scripts", "beta-e2e-smoke.mjs");
const SECRET = "qa-marathon-session-secret-0902-abcdef-1234567890";

function runSmoke(env = {}) {
  return new Promise((resolve) => {
    execFile("node", [SMOKE_SCRIPT], {
      env: { ...process.env, ...env },
      timeout: 120000,
    }, (error, stdout, stderr) => {
      resolve({ exitCode: error ? error.code ?? 1 : 0, stdout, stderr });
    });
  });
}

test("mintSessionToken produces a cookie the server's HMAC scheme accepts", () => {
  const past = Math.floor(Date.now() / 1000);
  const token = mintSessionToken({ id: "qa-customer-0001", email: "qa@example.test", secret: SECRET, now: past });
  const [payload, signature] = token.split(".");
  assert.ok(payload);
  assert.ok(signature);
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  assert.equal(signature, expected, "signature must match HMAC-SHA256 of payload with the same secret");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(decoded.v, 1);
  assert.equal(decoded.id, "qa-customer-0001");
  assert.equal(typeof decoded.exp, "number");
});

test("sessionCookieHeader encodes a valid drivable_session cookie", () => {
  const header = sessionCookieHeader({ id: "qa-customer-0002", email: "qa2@example.test", secret: SECRET });
  assert.match(header, /^drivable_session=/);
  const token = header.slice("drivable_session=".length);
  const decoded = decodeURIComponent(token);
  assert.match(decoded, /^\S+\.\S+$/);
});

test("beta-e2e smoke script passes end-to-end in auto mode (built server + stubs)", async () => {
  const result = await runSmoke();
  assert.equal(result.exitCode, 0, `Expected exit 0 but got ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /RESULT: PASS/);
  assert.match(result.stdout, /failed: 0(?:\s|$)/);
});

test("S3 stub stores and serves objects with path-style PUT/GET", async () => {
  const stub = createS3Stub();
  const endpoint = await stub.start();
  try {
    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: "k", secretAccessKey: "s" },
    });
    const body = Buffer.from("photo-bytes");
    await client.send(new PutObjectCommand({ Bucket: "qa-evidence", Key: "evidence/case-1/a.jpg", Body: body, ContentType: "image/jpeg" }));
    const got = await client.send(new GetObjectCommand({ Bucket: "qa-evidence", Key: "evidence/case-1/a.jpg" }));
    const bytes = Buffer.from(await got.Body.transformToByteArray());
    assert.deepEqual(bytes, body);
    assert.equal(stub.objectKeys().length, 1);
    assert.equal(stub.objectKeys()[0], "evidence/case-1/a.jpg");
  } finally {
    await stub.close();
  }
});

test("S3 stub honours failPutIndex to reject one object write mid-upload", async () => {
  const stub = createS3Stub();
  const endpoint = await stub.start();
  try {
    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: "k", secretAccessKey: "s" },
      maxAttempts: 1,
    });
    stub.failPutIndex(1);
    let rejected = false;
    try {
      await client.send(new PutObjectCommand({ Bucket: "b", Key: "evidence/c/x.jpg", Body: Buffer.from("x") }));
    } catch (error) {
      rejected = true;
      assert.notEqual(error?.$metadata?.httpStatusCode, 500, "index failure should be a non-retryable 400");
    }
    assert.equal(rejected, true);
  } finally {
    await stub.close();
  }
});

test("S3 stub DELETE removes objects and DELETE is idempotent", async () => {
  const stub = createS3Stub();
  const endpoint = await stub.start();
  try {
    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: "k", secretAccessKey: "s" },
      maxAttempts: 1,
    });
    await client.send(new PutObjectCommand({ Bucket: "b", Key: "evidence/c/a.jpg", Body: Buffer.from("a") }));
    assert.equal(stub.objectKeys().length, 1);
    await client.send(new DeleteObjectCommand({ Bucket: "b", Key: "evidence/c/a.jpg" }));
    assert.equal(stub.objectKeys().length, 0);
    await client.send(new DeleteObjectCommand({ Bucket: "b", Key: "evidence/c/a.jpg" }));
    assert.equal(stub.objectKeys().length, 0, "delete must be idempotent");
  } finally {
    await stub.close();
  }
});