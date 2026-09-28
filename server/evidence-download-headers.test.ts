import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

const REVIEWER_TOKEN = "evidence-download-headers-test-token-12345";

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

test("stored evidence is served as an opaque non-renderable attachment", async () => {
  const uploadDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  // An active-content payload with a renderable extension: without an explicit
  // Content-Type the browser would happily interpret this as a document.
  const storedName = "reviewer-evidence-probe.html";
  const storedPath = path.join(uploadDir, storedName);
  fs.writeFileSync(storedPath, "<script>fetch('/api/health/live')</script>", "utf8");

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/files/${storedName}`, {
        headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/octet-stream");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.match(response.headers.get("content-disposition") || "", /^attachment;/);
      assert.match(response.headers.get("cache-control") || "", /no-store/);
      assert.equal((await response.text()).includes("<script>"), true);
    });
  } finally {
    fs.rmSync(storedPath, { force: true });
  }
});

test("an svg evidence payload is not served as an active document", async () => {
  const uploadDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  const storedName = "reviewer-evidence-probe.svg";
  const storedPath = path.join(uploadDir, storedName);
  fs.writeFileSync(storedPath, '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', "utf8");

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/files/${storedName}`, {
        headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/octet-stream");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    });
  } finally {
    fs.rmSync(storedPath, { force: true });
  }
});

test("evidence names outside the safe charset are rejected, not echoed into a header", async () => {
  const uploadDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  // Spaces and a leading dot are creatable on every platform and are both
  // outside the conservative charset the route accepts.
  const storedName = "reviewer evidence probe.html";
  const storedPath = path.join(uploadDir, storedName);
  fs.writeFileSync(storedPath, "<script>1</script>", "utf8");

  try {
    await withServer(async (origin) => {
      for (const name of [storedName, `.${storedName}`]) {
        const response = await fetch(`${origin}/api/files/${encodeURIComponent(name)}`, {
          headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
        });

        assert.equal(response.status, 400, `${name} was not rejected`);
        assert.equal(response.headers.get("content-disposition"), null);
        // The rejection body is JSON; the stored payload is never typed by its
        // own extension and never becomes an active document.
        assert.match(response.headers.get("content-type") || "", /^application\/json/);
        assert.equal((await response.text()).includes("<script>"), false);
      }
    });
  } finally {
    fs.rmSync(storedPath, { force: true });
  }
});
