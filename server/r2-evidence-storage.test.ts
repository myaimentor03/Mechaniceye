import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { storeEvidenceFilesWithClient, type UploadedEvidenceFiles } from "./r2-evidence-storage.js";

type StoredObject = {
  key: string;
  contentType: string;
  metadata?: Record<string, string>;
};

async function makeTemporaryFiles(files: UploadedEvidenceFiles): Promise<{ root: string; files: UploadedEvidenceFiles }> {
  const root = await mkdtemp(path.join(tmpdir(), "r2-evidence-test-"));
  const withPath: UploadedEvidenceFiles = {};
  for (const [field, list] of Object.entries(files) as Array<[keyof UploadedEvidenceFiles, Express.Multer.File[]]>) {
    withPath[field] = [];
    for (const file of list ?? []) {
      const filename = path.join(root, `${file.originalname}`);
      const content = file.buffer || Buffer.from("test-content");
      await writeFile(filename, content);
      withPath[field]?.push({
        ...file,
        path: filename,
        size: content.length,
      } as Express.Multer.File);
    }
  }
  return { root, files: withPath };
}

function memoryStore() {
  const objects = new Map<string, StoredObject>();
  let putCount = 0;
  let failOnPut = 0;
  const store = {
    bucket: "mechanicseye-evidence-test",
    objects,
    setFailOnPut(n: number) {
      failOnPut = n;
    },
    async send(command: any) {
      const name = command.constructor.name;
      if (name === "PutObjectCommand") {
        putCount += 1;
        if (failOnPut && putCount === failOnPut) {
          throw Object.assign(new Error("R2 upload unavailable"), { name: "R2Unavailable" });
        }
        objects.set(command.input.Key, {
          key: command.input.Key,
          contentType: command.input.ContentType,
          metadata: command.input.Metadata,
        });
        return {};
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(command.input.Key);
        return {};
      }
      throw new Error(`Unexpected command ${name}`);
    },
  };
  return store;
}

test("stores case-scoped private keys with safe segments and no original filename", async () => {
  const store = memoryStore();
  const now = new Date("2026-09-02T00:00:00.000Z");
  const { root, files } = await makeTemporaryFiles({
    photos: [
      { originalname: "../../secret-name.jpg", mimetype: "image/jpeg", size: 0 } as Express.Multer.File,
    ],
    audio: [
      { originalname: "clip.mp3", mimetype: "audio/mpeg", size: 0 } as Express.Multer.File,
    ],
  });

  try {
    const keys = await storeEvidenceFilesWithClient("CASE-20260902000000000-123", files, store, now);

    assert.equal(keys.photos?.length, 1);
    assert.equal(keys.audio?.length, 1);
    const photoKey = keys.photos![0];
    assert.match(photoKey, /^evidence\/CASE-20260902000000000-123\/photos\/[0-9a-f-]{36}\.jpg$/);
    assert.equal(photoKey.includes("secret-name"), false);
    assert.equal(photoKey.includes(".."), false);

    const photoObject = store.objects.get(photoKey);
    assert.ok(photoObject);
    assert.equal(photoObject.contentType, "image/jpeg");
    assert.equal(photoObject.metadata?.case_id, "CASE-20260902000000000-123");
    assert.equal(photoObject.metadata?.evidence_type, "photos");
    assert.equal(photoObject.metadata?.evidence_status, "uploaded_not_analyzed");
    assert.equal(photoObject.metadata?.delete_after, "2026-10-02T00:00:00.000Z");

    assert.equal(store.objects.size, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsafe case segments and rejects empty case ids", async () => {
  const store = memoryStore();
  const { root, files } = await makeTemporaryFiles({
    photos: [{ originalname: "a.jpg", mimetype: "image/jpeg", size: 0 } as Express.Multer.File],
  });

  await assert.rejects(
    () => storeEvidenceFilesWithClient("../CASE:inject/evil", files, store),
    /Invalid server case ID/
  );
  await rm(root, { recursive: true, force: true });

  const empty = await makeTemporaryFiles({
    photos: [{ originalname: "a.jpg", mimetype: "image/jpeg", size: 0 } as Express.Multer.File],
  });
  await assert.rejects(() => storeEvidenceFilesWithClient("", empty.files, store), /Invalid server case ID/);
  await rm(empty.root, { recursive: true, force: true });
});

test("accepts valid case IDs and stores case-scoped private keys", async () => {
  const store = memoryStore();
  const now = new Date("2026-09-02T00:00:00.000Z");
  const { root, files } = await makeTemporaryFiles({
    photos: [{ originalname: "photo.jpg", mimetype: "image/jpeg", size: 0 } as Express.Multer.File],
    audio: [{ originalname: "clip.mp3", mimetype: "audio/mpeg", size: 0 } as Express.Multer.File],
  });

  try {
    const keys = await storeEvidenceFilesWithClient("CASE-20260902000000000-123", files, store, now);
    assert.equal(keys.photos?.length, 1);
    assert.equal(keys.audio?.length, 1);
    const photoKey = keys.photos![0];
    assert.match(photoKey, /^evidence\/CASE-20260902000000000-123\/photos\/[0-9a-f-]{36}\.jpg$/);
    const photoObject = store.objects.get(photoKey);
    assert.ok(photoObject);
    assert.equal(photoObject.metadata?.case_id, "CASE-20260902000000000-123");
    assert.equal(store.objects.size, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rolls back already-uploaded objects and removes temporary files on failure", async () => {
  const store = memoryStore();
  store.setFailOnPut(2);
  const { root, files } = await makeTemporaryFiles({
    photos: [
      { originalname: "a.jpg", mimetype: "image/jpeg", size: 0 } as Express.Multer.File,
      { originalname: "b.jpg", mimetype: "image/jpeg", size: 0 } as Express.Multer.File,
    ],
  });
  const tempFiles = path.join(root, "a.jpg");

  try {
    await assert.rejects(() => storeEvidenceFilesWithClient("CASE-ROLLBACK-1", files, store), /unavailable/);
    assert.equal(store.objects.size, 0);
    await assert.rejects(() => rm(tempFiles));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects 0-byte audio/video/vibration files with no objects written and temp files cleaned", async () => {
  const store = memoryStore();
  const root = await mkdtemp(path.join(tmpdir(), "r2-empty-test-"));
  try {
    const emptyAudio = {
      originalname: "empty.mp3",
      mimetype: "audio/mpeg",
      size: 0,
      buffer: Buffer.alloc(0),
      path: path.join(root, "empty.mp3"),
    } as unknown as Express.Multer.File;
    await writeFile(emptyAudio.path, Buffer.alloc(0));
    await assert.rejects(
      () => storeEvidenceFilesWithClient("CASE-EMPTY-AUDIO-1", { audio: [emptyAudio] }, store),
      /Empty audio file rejected|Empty media file rejected/,
    );
    assert.equal(store.objects.size, 0);
    await assert.rejects(() => rm(emptyAudio.path), /ENOENT/);

    const emptyVideo = {
      originalname: "empty.mp4",
      mimetype: "video/mp4",
      size: 0,
      buffer: Buffer.alloc(0),
      path: path.join(root, "empty.mp4"),
    } as unknown as Express.Multer.File;
    await writeFile(emptyVideo.path, Buffer.alloc(0));
    await assert.rejects(
      () => storeEvidenceFilesWithClient("CASE-EMPTY-VIDEO-1", { video: [emptyVideo] }, store),
      /Empty video file rejected|Empty media file rejected/,
    );
    assert.equal(store.objects.size, 0);

    const emptyVib = {
      originalname: "empty.bin",
      mimetype: "application/octet-stream",
      size: 0,
      buffer: Buffer.alloc(0),
      path: path.join(root, "empty.bin"),
    } as unknown as Express.Multer.File;
    await writeFile(emptyVib.path, Buffer.alloc(0));
    await assert.rejects(
      () => storeEvidenceFilesWithClient("CASE-EMPTY-VIB-1", { vibration: [emptyVib] }, store),
      /Empty vibration file rejected|Empty media file rejected/,
    );
    assert.equal(store.objects.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rolls back already-uploaded R2 object when second audio file is 0-byte (no orphan, atomic)", async () => {
  const store = memoryStore();
  const root = await mkdtemp(path.join(tmpdir(), "r2-partial-empty-"));
  try {
    const goodAudio = {
      originalname: "good.mp3",
      mimetype: "audio/mpeg",
      size: 12,
      buffer: Buffer.from("test-content"),
      path: path.join(root, "good.mp3"),
    } as unknown as Express.Multer.File;
    await writeFile(goodAudio.path, goodAudio.buffer);
    const emptyAudio = {
      originalname: "empty.mp3",
      mimetype: "audio/mpeg",
      size: 0,
      buffer: Buffer.alloc(0),
      path: path.join(root, "empty.mp3"),
    } as unknown as Express.Multer.File;
    await writeFile(emptyAudio.path, Buffer.alloc(0));

    await assert.rejects(
      () => storeEvidenceFilesWithClient("CASE-PARTIAL-EMPTY-1", { audio: [goodAudio, emptyAudio] }, store),
      /Empty audio file rejected|Empty media file rejected/,
    );
    assert.equal(store.objects.size, 0, "partial batch with empty second file must roll back first upload");
    await assert.rejects(() => rm(goodAudio.path), /ENOENT/);
    await assert.rejects(() => rm(emptyAudio.path), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects 0-byte R2 file that is disk-backed without buffer (mobile multer disk storage, size 0)", async () => {
  const store = memoryStore();
  const root = await mkdtemp(path.join(tmpdir(), "r2-disk-empty-"));
  try {
    const diskEmpty = path.join(root, "disk-empty.mp3");
    await writeFile(diskEmpty, Buffer.alloc(0));
    const diskFile = {
      originalname: "disk-empty.mp3",
      mimetype: "audio/mpeg",
      size: 0,
      path: diskEmpty,
    } as unknown as Express.Multer.File;

    await assert.rejects(
      () => storeEvidenceFilesWithClient("CASE-DISK-EMPTY-1", { audio: [diskFile] }, store),
      /Empty audio file rejected|Empty media file rejected/,
    );
    assert.equal(store.objects.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
