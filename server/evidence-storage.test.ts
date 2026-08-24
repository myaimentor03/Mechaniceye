import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { drivableEvidenceIntakeSchema } from "../shared/drivableEvidence.js";
import { RuntimeFileEvidenceStore, S3PrivateEvidenceStore } from "./evidence-storage.js";

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
