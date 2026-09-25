import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import express from "express";
import { registerRoutes } from "./routes.js";
import { storage } from "./storage.js";
import { generateCaseId } from "./case-storage.js";

const REVIEWER_TOKEN = "qa-test-reviewer-token-for-followup-upload-abc123";

async function withServer(work: (origin: string) => Promise<void>) {
  const priorToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  process.env.DRIVABLE_REVIEWER_TOKEN = REVIEWER_TOKEN;
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
    if (priorToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN;
    else process.env.DRIVABLE_REVIEWER_TOKEN = priorToken;
  }
}

async function createCase(): Promise<string> {
  const caseId = generateCaseId();
  await storage.createDiagnosis({
    id: caseId,
    userId: "qa-followup-upload-test-user",
    vehicleInfo: "2015 Honda Civic",
    description: "Engine runs rough at highway speed",
    timing: "Highway Speed",
  });
  return caseId;
}

function assertNoStore(res: Response, label: string) {
  const cc = res.headers.get("cache-control") || "";
  assert.match(cc, /no-store/, `${label} must answer Cache-Control: no-store (got "${cc}")`);
}

test("follow-up unexpected file field returns 415 with Cache-Control no-store (P0 #2 #9)", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair follow-up check");
    form.append("photos", new Blob(["fake"], { type: "image/jpeg" }), "photo.jpg");
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form as any,
    });
    assert.equal(response.status, 415, `expected 415 for unexpected file field, got ${response.status}`);
    assertNoStore(response, "follow-up 415 unexpected field");
    const body = await response.json().catch(() => ({} as any));
    assert.equal(body.persisted, false);
  });
});

test("follow-up valid audio field is accepted (not 415) and still returns no-store on downstream result", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair follow-up check");
    form.append("audio", new Blob([new Uint8Array([0x00, 0x01, 0x02])], { type: "audio/mp4" }), "clip.m4a");
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form as any,
    });
    assert.notEqual(response.status, 415, `audio/mp4 under audio field must not be 415, got ${response.status}`);
    assertNoStore(response, "follow-up with audio field");
  });
});

test("follow-up without auth still returns Cache-Control no-store on 401 before multer", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair");
    form.append("photos", new Blob(["fake"], { type: "image/jpeg" }), "photo.jpg");
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      body: form as any,
    });
    assert.equal(response.status, 401);
    assertNoStore(response, "follow-up 401 without auth");
  });
});

test("follow-up oversized audio file returns 413 with Cache-Control no-store (P0 #2 #9)", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair follow-up check");
    const bigAudio = new Blob([new Uint8Array(51 * 1024 * 1024)], { type: "audio/mp4" });
    form.append("audio", bigAudio, "big.m4a");
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form as any,
    });
    assert.equal(response.status, 413, `expected 413 for oversized audio, got ${response.status}`);
    assertNoStore(response, "follow-up 413 oversized audio");
    const body = await response.json().catch(() => ({} as any));
    assert.equal(body.persisted, false);
    assert.ok(typeof body.message === "string" && body.message.length > 0);
    assert.ok(!JSON.stringify(body).includes("PayloadTooLargeError"), "must not leak multer error internals");
  });
});

test("follow-up oversized video file returns 413 with Cache-Control no-store (P0 #2 #9)", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair follow-up check");
    const bigVideo = new Blob([new Uint8Array(51 * 1024 * 1024)], { type: "video/mp4" });
    form.append("video", bigVideo, "big.mp4");
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form as any,
    });
    assert.equal(response.status, 413, `expected 413 for oversized video, got ${response.status}`);
    assertNoStore(response, "follow-up 413 oversized video");
    const body = await response.json().catch(() => ({} as any));
    assert.equal(body.persisted, false);
    assert.ok(typeof body.message === "string" && body.message.length > 0);
    assert.ok(!JSON.stringify(body).includes("PayloadTooLargeError"), "must not leak multer error internals");
  });
});

test("follow-up success response cleans up temporary upload files (P0 #2 #9)", async () => {
  await withServer(async (origin) => {
    const caseId = await createCase();
    const audioPath = path.join(tmpdir(), `test-followup-audio-${Date.now()}.mp3`);
    fs.writeFileSync(audioPath, Buffer.from("fake audio content for follow-up test"));
    const form = new FormData();
    form.append("additionalInfo", "Still rough after repair follow-up check");
    const audioBlob = new Blob([fs.readFileSync(audioPath)], { type: "audio/mp4" });
    form.append("audio", audioBlob, "followup-audio.mp4");
    const response = await fetch(`${origin}/api/diagnoses/${caseId}/follow-up`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVIEWER_TOKEN}` },
      body: form as any,
    });
    const body = await response.json().catch(() => ({} as any));
    assert.equal(response.status, 200, `expected 200 on success, got ${response.status}`);
    const uploadsDir = path.join(process.cwd(), "uploads");
    const remainingFiles = fs.existsSync(uploadsDir)
      ? fs.readdirSync(uploadsDir).filter(f => f.startsWith("followup-audio") || f.endsWith(".mp3") || f.endsWith(".mp4"))
      : [];
    assert.equal(remainingFiles.length, 0, `Expected 0 follow-up temp files after success, found ${remainingFiles.join(", ")}`);
    fs.rmSync(audioPath, { force: true });
  });
});
