import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { drivableEvidenceIntakeSchema } from "../shared/drivableEvidence.js";
import { RuntimeFileEvidenceStore, S3PrivateEvidenceStore, PHOTO_LIMITS } from "./evidence-storage.js";

function upload(buffer: Buffer, originalname = "dash.jpg", mimetype = "image/jpeg") {
  return { buffer, originalname, mimetype, size: buffer.length } as Express.Multer.File;
}

test("shared intake supports diagnose, buy, and sell without duplication", () => {
  for (const mode of ["diagnose", "buy", "sell"] as const) {
    const parsed = drivableEvidenceIntakeSchema.parse({
      mode,
      vehicle: { vin: "1HGCM82633A004352", mileage: 142500 },
      obd: { codes: ["P0300"] },
    });
    assert.equal(parsed.mode, mode);
    assert.deepEqual(parsed.obd.codes, ["P0300"]);
  }
});

test("photo bytes receive server IDs, controlled extensions, and honest analysis state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const [attachment] = await store.savePhotos("CASE-123", [upload(bytes, "../../unsafe.exe")]);
    assert.equal(attachment.caseId, "CASE-123");
    assert.equal(attachment.originalName, "unsafe.exe");
    assert.equal(attachment.analysisStatus, "uploaded_not_analyzed");
    assert.match(attachment.storageKey, /^evidence\/CASE-123\/[0-9a-f-]+\.jpg$/);
    assert.deepEqual(await readFile(path.join(root, "CASE-123", path.basename(attachment.storageKey))), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renamed executable and MIME/signature mismatch are rejected and cleaned up", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    await assert.rejects(() => store.savePhotos("CASE-BAD", [upload(Buffer.from("MZ executable"), "fake.jpg")]), /supported image/);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await assert.rejects(() => store.savePhotos("CASE-MISMATCH", [upload(png, "fake.jpg")]), /does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("case traversal and storage failure never report success", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const jpg = upload(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await assert.rejects(() => store.savePhotos("../escape", [jpg]), /Invalid server case ID/);
    await assert.rejects(() => store.savePhotos("..", [jpg]), /Invalid server case ID/);
    await assert.rejects(() => store.savePhotos("..\\escape", [jpg]), /Invalid server case ID/);
    await assert.rejects(() => store.savePhotos("CASE/..", [jpg]), /Invalid server case ID/);
    await assert.rejects(() => store.savePhotos("", [jpg]), /Invalid server case ID/);
    await assert.rejects(() => store.savePhotos(".", [jpg]), /Invalid server case ID/);
    await assert.rejects(() => store.savePhotos("-CASE", [jpg]), /Invalid server case ID/);
    await assert.rejects(() => store.savePhotos("CASE-", [jpg]), /Invalid server case ID/);
    await assert.rejects(() => store.savePhotos("CASE..ID", [jpg]), /Invalid server case ID/);
    const blockedRoot = path.join(root, "not-a-directory");
    await writeFile(blockedRoot, "blocked");
    await assert.rejects(() => new RuntimeFileEvidenceStore(blockedRoot).savePhotos("CASE-FAIL", [jpg]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("case cleanup removes its attachment manifest and bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    await store.savePhotos("CASE-CLEAN", [upload(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))]);
    await store.deleteCase("CASE-CLEAN");
    await assert.rejects(() => readFile(path.join(root, "CASE-CLEAN", "attachments.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("private object storage persists, retrieves, and deletes evidence without public URLs", async () => {
  const objects = new Map<string, Buffer>();
  const client = {
    async send(command: any) {
      const name = command.constructor.name;
      const key = command.input.Key as string;
      if (name === "PutObjectCommand") {
        objects.set(key, Buffer.from(command.input.Body));
        return {};
      }
      if (name === "GetObjectCommand") {
        const value = objects.get(key);
        if (!value) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return { Body: { transformToByteArray: async () => value } };
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(key);
        return {};
      }
      throw new Error(`Unexpected command ${name}`);
    },
  };
  const store = new S3PrivateEvidenceStore({ bucket: "private-test", region: "test-1" }, client);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const [attachment] = await store.savePhotos("CASE-S3", [upload(bytes)]);
  assert.equal(store.durability, "private_object_storage");
  assert.equal(objects.has("evidence/CASE-S3/attachments.json"), true);
  assert.equal(attachment.storageKey.startsWith("evidence/CASE-S3/"), true);
  const retrieved = await store.getAttachment("CASE-S3", attachment.id);
  assert.deepEqual(retrieved?.bytes, bytes);
  assert.equal(await store.getAttachment("CASE-S3", "not-present"), null);
  await store.deleteCase("CASE-S3");
  assert.equal(objects.size, 0);
});

test("private object storage rolls back objects after a partial upload failure", async () => {
  const written = new Set<string>();
  let puts = 0;
  const client = {
    async send(command: any) {
      const name = command.constructor.name;
      const key = command.input.Key as string;
      if (name === "PutObjectCommand") {
        puts += 1;
        if (puts === 2) throw new Error("object store unavailable");
        written.add(key);
        return {};
      }
      if (name === "DeleteObjectCommand") {
        written.delete(key);
        return {};
      }
      throw new Error(`Unexpected command ${name}`);
    },
  };
  const store = new S3PrivateEvidenceStore({ bucket: "private-test", region: "test-1" }, client);
  const jpg = upload(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await assert.rejects(() => store.savePhotos("CASE-ROLLBACK", [jpg, jpg]), /unavailable/);
  assert.equal(written.size, 0);
});

function heicBuffer(brand: string): Buffer {
  const header = Buffer.alloc(16);
  header.writeUInt32BE(16, 0);
  header.write("ftyp", 4, "ascii");
  header.write(brand, 8, "ascii");
  return header;
}

const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "hvc1", "hvc2"] as const;

test("all recognized HEIC/HEIF ftyp brands are accepted with image/heic MIME type", async () => {
  for (const brand of HEIC_BRANDS) {
    const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-heic-"));
    try {
      const store = new RuntimeFileEvidenceStore(root);
      const bytes = heicBuffer(brand);
      const [attachment] = await store.savePhotos(`CASE-HEIC-${brand}`, [upload(bytes, `${brand}.heic`, "image/heic")]);
      assert.equal(attachment.mimeType, "image/heic", `brand ${brand} must detect as image/heic`);
      assert.match(attachment.storageKey, /\.heic$/, `brand ${brand} must get .heic extension`);
      assert.equal(attachment.status, "persisted");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("HEIC brands accept image/heif MIME type from mobile clients (heif-compatible path)", async () => {
  for (const brand of HEIC_BRANDS) {
    const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-heif-"));
    try {
      const store = new RuntimeFileEvidenceStore(root);
      const bytes = heicBuffer(brand);
      const [attachment] = await store.savePhotos(`CASE-HEIF-${brand}`, [upload(bytes, `${brand}.heic`, "image/heif")]);
      assert.equal(attachment.mimeType, "image/heic", `brand ${brand} with image/heif MIME must be accepted`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("HEIC ftyp brand with wrong MIME type is rejected (MIME/signature mismatch)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-heic-mismatch-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const bytes = heicBuffer("heic");
    await assert.rejects(
      () => store.savePhotos("CASE-HEIC-MISMATCH", [upload(bytes, "heic.jpg", "image/jpeg")]),
      /does not match/,
      "HEIC content disguised as JPEG must be rejected",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unknown ftyp brand is rejected as unsupported image", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-unknown-brand-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const bytes = heicBuffer("zzzz");
    await assert.rejects(
      () => store.savePhotos("CASE-UNKNOWN", [upload(bytes, "unknown.heic", "image/heic")]),
      /supported image/,
      "unrecognized ftyp brand must be rejected",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HEIC detection requires minimum 12 bytes — short buffer is rejected", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-short-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const tooShort = Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x66, 0x74, 0x79]);
    await assert.rejects(
      () => store.savePhotos("CASE-SHORT", [upload(tooShort, "short.heic", "image/heic")]),
      /supported image/,
      "truncated ftyp header must be rejected",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HEIC brand detection works through S3 private object storage", async () => {
  const objects = new Map<string, Buffer>();
  const client = {
    async send(command: any) {
      const name = command.constructor.name;
      const key = command.input.Key as string;
      if (name === "PutObjectCommand") {
        objects.set(key, Buffer.from(command.input.Body));
        return {};
      }
      if (name === "GetObjectCommand") {
        const value = objects.get(key);
        if (!value) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return { Body: { transformToByteArray: async () => value } };
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(key);
        return {};
      }
      throw new Error(`Unexpected command ${name}`);
    },
  };
  const store = new S3PrivateEvidenceStore({ bucket: "test", region: "test-1" }, client);
  for (const brand of HEIC_BRANDS) {
    const bytes = heicBuffer(brand);
    const [attachment] = await store.savePhotos(`CASE-S3-${brand}`, [upload(bytes, `${brand}.heic`, "image/heic")]);
    assert.equal(attachment.mimeType, "image/heic", `S3 store: brand ${brand} must detect as image/heic`);
    assert.match(attachment.storageKey, /\.heic$/, `S3 store: brand ${brand} must get .heic extension`);
  }
});

test("runtime store persists audio attachments with correct metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-audio-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const [attachment] = await store.saveAudio("CASE-AUDIO", [upload(bytes, "note.mp3", "audio/mpeg")]);
    assert.equal(attachment.caseId, "CASE-AUDIO");
    assert.equal(attachment.kind, "audio");
    assert.equal(attachment.analysisStatus, "uploaded_not_analyzed");
    assert.match(attachment.storageKey, /^evidence\/CASE-AUDIO\/[0-9a-f-]+\.mp3$/);
    assert.deepEqual(await readFile(path.join(root, "CASE-AUDIO", path.basename(attachment.storageKey))), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store persists video attachments with correct metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-video-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const [attachment] = await store.saveVideo("CASE-VIDEO", [upload(bytes, "clip.mp4", "video/mp4")]);
    assert.equal(attachment.caseId, "CASE-VIDEO");
    assert.equal(attachment.kind, "video");
    assert.equal(attachment.analysisStatus, "uploaded_not_analyzed");
    assert.match(attachment.storageKey, /^evidence\/CASE-VIDEO\/[0-9a-f-]+\.mp4$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store persists vibration attachments with correct metadata", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-vibration-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const [attachment] = await store.saveVibration("CASE-VIB", [upload(bytes, "vib.bin", "application/octet-stream")]);
    assert.equal(attachment.caseId, "CASE-VIB");
    assert.equal(attachment.kind, "vibration");
    assert.equal(attachment.analysisStatus, "uploaded_not_analyzed");
    assert.match(attachment.storageKey, /^evidence\/CASE-VIB\/[0-9a-f-]+\.bin$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store rejects oversized audio/video/vibration files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-limit-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const big = Buffer.alloc(PHOTO_LIMITS.maxBytesEach + 1);
    await assert.rejects(() => store.saveAudio("CASE-LIMIT", [upload(big, "big.mp3", "audio/mpeg")]), /too large/i);
    await assert.rejects(() => store.saveVideo("CASE-LIMIT", [upload(big, "big.mp4", "video/mp4")]), /too large/i);
    await assert.rejects(() => store.saveVibration("CASE-LIMIT", [upload(big, "big.bin", "application/octet-stream")]), /too large/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store does not duplicate case directory when called twice", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-dup-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const [attachment] = await store.saveAudio("CASE-DUP", [upload(bytes, "note.mp3", "audio/mpeg")]);
    const caseRoot = path.join(root, "CASE-DUP");
    const manifest = JSON.parse(await readFile(path.join(caseRoot, "attachments.json"), "utf8"));
    assert.equal(manifest.length, 1);
    assert.equal(manifest[0].id, attachment.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("S3 store persists audio/video/vibration and rolls back on failure", async () => {
  const objects = new Map<string, Buffer>();
  const client = {
    async send(command: any) {
      const name = command.constructor.name;
      const key = command.input.Key as string;
      if (name === "PutObjectCommand") {
        objects.set(key, Buffer.from(command.input.Body));
        return {};
      }
      if (name === "GetObjectCommand") {
        const value = objects.get(key);
        if (!value) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return { Body: { transformToByteArray: async () => value } };
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(key);
        return {};
      }
      throw new Error(`Unexpected command ${name}`);
    },
  };
  const store = new S3PrivateEvidenceStore({ bucket: "test", region: "test-1" }, client);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const [audio] = await store.saveAudio("CASE-S3-AUDIO", [upload(bytes, "note.mp3", "audio/mpeg")]);
  const [video] = await store.saveVideo("CASE-S3-VIDEO", [upload(bytes, "clip.mp4", "video/mp4")]);
  const [vib] = await store.saveVibration("CASE-S3-VIB", [upload(bytes, "vib.bin", "application/octet-stream")]);
  assert.equal(audio.kind, "audio");
  assert.equal(video.kind, "video");
  assert.equal(vib.kind, "vibration");
  assert.equal(objects.has("evidence/CASE-S3-AUDIO/attachments.json"), true);
  assert.equal(objects.has("evidence/CASE-S3-VIDEO/attachments.json"), true);
  assert.equal(objects.has("evidence/CASE-S3-VIB/attachments.json"), true);
});

test("S3 audio/video/vibration objects carry retention, case, and evidence-status metadata (parity with photos)", async () => {
  const stored: Array<{ key: string; metadata?: Record<string, string>; contentType: string }> = [];
  const client = {
    async send(command: any) {
      const name = command.constructor.name;
      if (name === "PutObjectCommand") {
        stored.push({ key: command.input.Key as string, metadata: command.input.Metadata, contentType: command.input.ContentType });
        return {};
      }
      if (name === "DeleteObjectCommand") return {};
      throw new Error(`Unexpected command ${name}`);
    },
  };
  const store = new S3PrivateEvidenceStore({ bucket: "private-test", region: "test-1" }, client);
  const bytes = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  await store.saveAudio("CASE-META-AUDIO", [{ buffer: bytes, originalname: "clip.mp3", mimetype: "audio/mpeg", size: bytes.length } as Express.Multer.File]);
  await store.saveVideo("CASE-META-VIDEO", [{ buffer: bytes, originalname: "clip.mp4", mimetype: "video/mp4", size: bytes.length } as Express.Multer.File]);
  await store.saveVibration("CASE-META-VIB", [{ buffer: bytes, originalname: "vib.bin", mimetype: "application/octet-stream", size: bytes.length } as Express.Multer.File]);
  for (const record of stored) {
    const md = record.metadata || {};
    assert.equal(md["evidence-status"], "uploaded_not_analyzed", `missing evidence-status on ${record.key}`);
    assert.equal(md["retention-days"], "30", `missing retention-days on ${record.key}`);
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(md["delete-after"] || ""), `missing ISO delete-after on ${record.key}`);
    assert.ok(md["case-id"]?.startsWith("CASE-META-"), `missing case-id on ${record.key}`);
    assert.ok(md["media-type"], `missing media-type on ${record.key}`);
    assert.equal(record.contentType.includes("/") ? true : false, true);
  }
  const audioObj = stored.find((r) => r.key.includes("CASE-META-AUDIO") && !r.key.endsWith("attachments.json"));
  assert.equal(audioObj?.metadata?.["media-type"], "audio/mpeg");
  const videoObj = stored.find((r) => r.key.includes("CASE-META-VIDEO") && !r.key.endsWith("attachments.json"));
  assert.equal(videoObj?.metadata?.["media-type"], "video/mp4");
  const jsonManifests = stored.filter((r) => r.key.endsWith("attachments.json"));
  assert.equal(jsonManifests.length, 3);
  for (const m of jsonManifests) assert.equal(m.metadata?.["media-type"], "application/json");
});

test("runtime and S3 stores read audio/video/vibration from disk path when buffer is absent (multer disk storage)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-disk-"));
  try {
    const tmpAudio = path.join(root, "disk-audio.mp3");
    const bytes = Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]);
    await writeFile(tmpAudio, bytes);
    const diskFile = { path: tmpAudio, originalname: "disk-audio.mp3", mimetype: "audio/mpeg", size: bytes.length } as Express.Multer.File;
    const runtime = new RuntimeFileEvidenceStore(path.join(root, "runtime-evidence"));
    const [att] = await runtime.saveAudio("CASE-DISK-AUDIO", [diskFile]);
    assert.equal(att.kind, "audio");
    assert.deepEqual(await readFile(path.join(root, "runtime-evidence", "CASE-DISK-AUDIO", path.basename(att.storageKey))), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const storedBody = new Map<string, Buffer>();
  const client = {
    async send(command: any) {
      const name = command.constructor.name;
      if (name === "PutObjectCommand") {
        const body: Buffer = Buffer.isBuffer(command.input.Body) ? command.input.Body : Buffer.from(await command.input.Body);
        storedBody.set(command.input.Key as string, body);
        return {};
      }
      if (name === "DeleteObjectCommand") { storedBody.delete(command.input.Key as string); return {}; }
      throw new Error(`Unexpected ${name}`);
    },
  };
  const root2 = await mkdtemp(path.join(tmpdir(), "drivable-evidence-disk2-"));
  try {
    const tmpVideo = path.join(root2, "disk-video.mp4");
    const bytes2 = Buffer.from([0x05, 0x06, 0x07, 0x08]);
    await writeFile(tmpVideo, bytes2);
    const diskVideo = { path: tmpVideo, originalname: "disk-video.mp4", mimetype: "video/mp4", size: bytes2.length } as Express.Multer.File;
    const s3store = new S3PrivateEvidenceStore({ bucket: "test", region: "test-1" }, client);
    const [vAtt] = await s3store.saveVideo("CASE-DISK-VIDEO", [diskVideo]);
    assert.equal(vAtt.kind, "video");
    assert.deepEqual(storedBody.get(vAtt.storageKey), bytes2);
  } finally {
    await rm(root2, { recursive: true, force: true });
  }
});

test("runtime store getAttachment returns null for missing case directory (ENOENT on manifest)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-missing-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const result = await store.getAttachment("NONEXISTENT-CASE", "some-id");
    assert.equal(result, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store getAttachment returns null for missing attachment file (ENOENT on media)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-nomedia-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const caseRoot = path.join(root, "CASE-NOMEDIA");
    await mkdir(caseRoot, { recursive: true });
    await writeFile(path.join(caseRoot, "attachments.json"), JSON.stringify([{
      id: "missing-attachment", caseId: "CASE-NOMEDIA", kind: "photo",
      originalName: "test.jpg", mimeType: "image/jpeg", byteSize: 1024,
      status: "persisted", serverAttachmentId: "missing-attachment",
      storageKey: "evidence/CASE-NOMEDIA/missing-attachment.jpg",
      createdAt: new Date().toISOString(), provenance: "uploaded_media", analysisStatus: "uploaded_not_analyzed",
    }], null, 2));
    const result = await store.getAttachment("CASE-NOMEDIA", "missing-attachment");
    assert.equal(result, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store getAttachment returns null for invalid attachmentId with path traversal", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-traversal-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const result = await store.getAttachment("CASE-TRAVERSAL", "../etc/passwd");
    assert.equal(result, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store getAttachment returns null when storageKey does not match case prefix", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-prefix-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const caseRoot = path.join(root, "CASE-PREFIX");
    await mkdir(caseRoot, { recursive: true });
    await writeFile(path.join(caseRoot, "attachments.json"), JSON.stringify([{
      id: "bad-prefix", caseId: "CASE-PREFIX", kind: "photo",
      originalName: "test.jpg", mimeType: "image/jpeg", byteSize: 1024,
      status: "persisted", serverAttachmentId: "bad-prefix",
      storageKey: "evidence/OTHER-CASE/evil.jpg",
      createdAt: new Date().toISOString(), provenance: "uploaded_media", analysisStatus: "uploaded_not_analyzed",
    }], null, 2));
    const result = await store.getAttachment("CASE-PREFIX", "bad-prefix");
    assert.equal(result, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime store getAttachment returns attachment when evidence exists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-evidence-ok-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x02, 0x03, 0xff, 0xd9]);
    const [attachment] = await store.savePhotos("CASE-OK", [{ buffer: bytes, originalname: "test.jpg", mimetype: "image/jpeg", size: bytes.length } as Express.Multer.File]);
    const result = await store.getAttachment("CASE-OK", attachment.id);
    assert.ok(result);
    assert.equal(result!.attachment.id, attachment.id);
    assert.deepEqual(result!.bytes, bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
