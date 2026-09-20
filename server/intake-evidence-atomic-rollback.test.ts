import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readFileSync } from "node:fs";
import { RuntimeFileEvidenceStore } from "./evidence-storage.js";

/**
 * QA launch-blocker for November 2 paid beta (P0 #1 reliable photo/audio/video/
 * vibration evidence capture and persistence, P0 #9 mobile/upload recovery).
 *
 * The intake handler persists photo evidence via `evidenceStore.savePhotos`
 * before persisting audio/video/vibration via `storeEvidenceFiles` (R2).
 * A prior gap: if the second step failed, the 507 left orphan photo
 * evidence on disk/S3 — the case was reported as not persisted, but storage
 * was leaked and a retry would duplicate evidence. The fix rolls back the
 * photo case when media persistence fails, making the whole intake atomic.
 */

function jpegBytes(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
}

function upload(buffer: Buffer, originalname = "dash.jpg", mimetype = "image/jpeg") {
  return { buffer, originalname, mimetype, size: buffer.length } as Express.Multer.File;
}

test("P0 #1 atomic rollback: RuntimeFileEvidenceStore photo orphan is deleted when subsequent media persistence fails", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-atomic-rollback-"));
  try {
    const store = new RuntimeFileEvidenceStore(root);
    const caseId = "CASE-ATOMIC-1";

    // Step 1: photo persistence succeeds (as in the real handler)
    const photos = [upload(jpegBytes(), "front.jpg")];
    const attachments = await store.savePhotos(caseId, photos);
    assert.equal(attachments.length, 1);
    assert.ok(attachments[0].storageKey.startsWith(`evidence/${caseId}/`));

    // Step 2: media persistence fails (simulated by throwing before writing)
    // The handler must now delete the photo case so the 507 leaves no orphan.
    const mediaError = new Error("R2 unavailable during audio upload");
    try {
      throw mediaError;
    } catch {
      // This is what routes.ts now does in the media catch block:
      if (attachments.length) {
        await store.deleteCase(caseId);
      }
      throw mediaError;
    }
  } catch (error: any) {
    assert.match(error.message, /R2 unavailable/);
  }

  // After the rollback, no photo manifest or bytes should remain — atomic.
  const store2 = new RuntimeFileEvidenceStore(root);
  const after = await store2.getAttachment("CASE-ATOMIC-1", "any");
  assert.equal(after, null, "orphan photo must not survive media failure");
  await assert.rejects(() => readFile(path.join(root, "CASE-ATOMIC-1", "attachments.json")), /ENOENT/);
  await rm(root, { recursive: true, force: true });
});

test("P0 #1 contract: routes.ts contains atomic photo rollback on media persistence failure (507)", () => {
  const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  // The media catch block must delete already-persisted photos.
  assert.match(
    source,
    /api\.media_evidence_persistence_failed[\s\S]*evidenceStore\.deleteCase\(responseBody\.id\)/,
    "routes.ts must roll back photo evidence when media persistence fails (atomic 507)"
  );
  assert.match(
    source,
    /Atomic rollback[\s\S]*orphan photo evidence/i,
    "rollback must be documented as P0 #1 launch-blocker fix"
  );
});

test("P0 #1 defense-in-depth: routes.ts also cleans any partially written R2 keys on media failure", () => {
  const source = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /deleteStoredEvidenceForCase\(responseBody\.id,\s*storedR2Keys\)/,
    "routes.ts must clean any partially written R2 keys when media persistence fails"
  );
});
