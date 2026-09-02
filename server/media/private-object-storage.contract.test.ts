import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryPrivateEvidenceObjectStorage,
} from "./in-memory-private-object-storage.js";
import {
  PrivateObjectStorageError,
  assertDurableScalablePrivateStorage,
  type PrivateEvidenceObjectStorage,
} from "./private-object-storage.js";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function input(overrides: Partial<Parameters<PrivateEvidenceObjectStorage["put"]>[0]> = {}) {
  return {
    caseId: "CASE-123",
    attachmentId: "ATTACHMENT-456",
    bytes: JPEG,
    declaredMediaType: "image/jpeg",
    clientFilename: "dashboard.jpg",
    idempotencyKey: "upload_0001",
    ...overrides,
  };
}

test("generated keys resist traversal and never contain the client filename", async () => {
  const storage = new InMemoryPrivateEvidenceObjectStorage();
  const hostileFilename = "../../OTHER-CASE/secret payload.exe";
  const result = await storage.put(input({ clientFilename: hostileFilename }));

  assert.equal(result.disposition, "created");
  assert.match(
    result.object.objectKey,
    /^private\/drivable-evidence\/v1\/cases\/CASE-123\/attachments\/ATTACHMENT-456\/[0-9a-f-]+\.jpg$/,
  );
  assert.equal(result.object.objectKey.includes("secret"), false);
  assert.equal(result.object.objectKey.includes("payload"), false);
  assert.equal(result.object.objectKey.includes(".."), false);

  for (const caseId of ["../CASE", "CASE/../../OTHER", "CASE\\..\\OTHER", "%2e%2e%2fOTHER"]) {
    await assert.rejects(
      storage.put(input({ caseId, idempotencyKey: `badcase_${caseId.length}` })),
      (error: unknown) => error instanceof PrivateObjectStorageError && error.code === "invalid_input",
    );
  }

  await assert.rejects(
    storage.put(input({ attachmentId: "../../ATTACHMENT", idempotencyKey: "badattach_001" })),
    (error: unknown) => error instanceof PrivateObjectStorageError && error.code === "invalid_input",
  );
});

test("verified bytes control media type and extension", async () => {
  const storage = new InMemoryPrivateEvidenceObjectStorage();
  const jpeg = await storage.put(input({ clientFilename: "renamed.png" }));
  assert.equal(jpeg.object.mediaType, "image/jpeg");
  assert.equal(jpeg.object.extension, ".jpg");
  assert.match(jpeg.object.objectKey, /\.jpg$/);

  await assert.rejects(
    storage.put(input({ bytes: PNG, declaredMediaType: "image/jpeg", idempotencyKey: "upload_0002" })),
    (error: unknown) => error instanceof PrivateObjectStorageError && error.code === "invalid_media",
  );
  await assert.rejects(
    storage.put(input({ bytes: Uint8Array.from(Buffer.from("MZ executable")), idempotencyKey: "upload_0003" })),
    (error: unknown) => error instanceof PrivateObjectStorageError && error.code === "invalid_media",
  );
});

test("case and attachment scope cannot read or delete another scope", async () => {
  const storage = new InMemoryPrivateEvidenceObjectStorage();
  const created = await storage.put(input());
  const locator = created.object;

  assert.equal(await storage.get({ ...locator, caseId: "CASE-OTHER" }), null);
  assert.equal(
    (await storage.delete({ ...locator, attachmentId: "ATTACHMENT-OTHER" })).status,
    "not_found",
  );
  assert.deepEqual((await storage.get(locator))?.bytes, JPEG);
});

test("get/delete not-found behavior is explicit and delete is idempotent", async () => {
  const storage = new InMemoryPrivateEvidenceObjectStorage();
  const created = await storage.put(input());

  assert.equal((await storage.delete(created.object)).status, "deleted");
  assert.equal((await storage.delete(created.object)).status, "not_found");
  assert.equal(await storage.get(created.object), null);
});

test("injected backend failures reject without reporting success or partial mutation", async () => {
  const storage = new InMemoryPrivateEvidenceObjectStorage();
  storage.failNext("put");
  await assert.rejects(
    storage.put(input()),
    (error: unknown) => error instanceof PrivateObjectStorageError
      && error.code === "storage_unavailable"
      && error.retryable,
  );
  assert.equal(storage.storedObjectCount, 0);

  const created = await storage.put(input());
  storage.failNext("delete");
  await assert.rejects(storage.delete(created.object), /Injected delete storage failure/);
  assert.equal(storage.storedObjectCount, 1);
  assert.notEqual(await storage.get(created.object), null);

  storage.failNext("get");
  await assert.rejects(storage.get(created.object), /Injected get storage failure/);
});

test("idempotent puts replay the original object and reject changed content", async () => {
  const storage = new InMemoryPrivateEvidenceObjectStorage();
  const first = await storage.put(input());
  const replay = await storage.put(input({ clientFilename: "a different display name.jpg" }));

  assert.equal(replay.disposition, "idempotent_replay");
  assert.equal(replay.object.objectKey, first.object.objectKey);
  assert.equal(storage.storedObjectCount, 1);

  await assert.rejects(
    storage.put(input({ bytes: Uint8Array.from([...JPEG, 0x01]) })),
    (error: unknown) => error instanceof PrivateObjectStorageError
      && error.code === "idempotency_conflict",
  );
});

test("access metadata is private and production durability is an explicit gate", async () => {
  const storage = new InMemoryPrivateEvidenceObjectStorage();
  const created = await storage.put(input());

  assert.equal(created.object.access.visibility, "private");
  assert.equal("publicUrl" in created.object.access, false);
  assert.equal(storage.capabilities.durable, false);
  assert.equal(storage.capabilities.horizontallyScalable, false);
  assert.equal(storage.capabilities.signedRead.supported, false);
  assert.throws(
    () => assertDurableScalablePrivateStorage(storage),
    (error: unknown) => error instanceof PrivateObjectStorageError
      && error.code === "unsupported_capability",
  );
  await assert.rejects(
    storage.createSignedReadAccess({ ...created.object, ttlSeconds: 60 }),
    (error: unknown) => error instanceof PrivateObjectStorageError
      && error.code === "unsupported_capability",
  );
});
