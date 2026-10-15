import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { withFollowUpUploadCleanup } from "./follow-up-upload-lifecycle";

async function temporaryUpload() {
  const root = await mkdtemp(path.join(tmpdir(), "drivable-follow-up-cleanup-"));
  const uploadPath = path.join(root, "upload.tmp");
  await writeFile(uploadPath, "temporary evidence");
  return {
    uploadPath,
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

describe("follow-up upload lifecycle", () => {
  it("removes temporary uploads after a successful route operation", async () => {
    const upload = await temporaryUpload();

    const result = await withFollowUpUploadCleanup(
      async () => {
        assert.equal(await exists(upload.uploadPath), true);
        return { status: 200 };
      },
      upload.remove,
      () => assert.fail("cleanup should not fail"),
    );

    assert.deepEqual(result, { status: 200 });
    assert.equal(await exists(upload.uploadPath), false);
  });

  it("removes temporary uploads after an unexpected route error", async () => {
    const upload = await temporaryUpload();
    const routeError = new Error("follow-up creation failed");

    await assert.rejects(
      withFollowUpUploadCleanup(
        async () => { throw routeError; },
        upload.remove,
        () => assert.fail("cleanup should not fail"),
      ),
      (error: unknown) => error === routeError,
    );

    assert.equal(await exists(upload.uploadPath), false);
  });

  it("reports cleanup failure without replacing a successful route result", async () => {
    const cleanupError = new Error("temporary file is locked");
    const reported: unknown[] = [];

    const result = await withFollowUpUploadCleanup(
      async () => "response-sent",
      async () => { throw cleanupError; },
      (error) => reported.push(error),
    );

    assert.equal(result, "response-sent");
    assert.deepEqual(reported, [cleanupError]);
  });

  it("preserves the original route error when cleanup also fails", async () => {
    const routeError = new Error("route failed");
    const cleanupError = new Error("cleanup failed");
    const reported: unknown[] = [];

    await assert.rejects(
      withFollowUpUploadCleanup(
        async () => { throw routeError; },
        async () => { throw cleanupError; },
        (error) => reported.push(error),
      ),
      (error: unknown) => error === routeError,
    );
    assert.deepEqual(reported, [cleanupError]);
  });

  it("does not let a cleanup reporter failure replace the route result", async () => {
    const result = await withFollowUpUploadCleanup(
      async () => "response-sent",
      async () => { throw new Error("temporary file is locked"); },
      () => { throw new Error("logger failed"); },
    );

    assert.equal(result, "response-sent");
  });

  it("does not let a cleanup reporter failure replace the route error", async () => {
    const routeError = new Error("route failed");

    await assert.rejects(
      withFollowUpUploadCleanup(
        async () => { throw routeError; },
        async () => { throw new Error("temporary file is locked"); },
        () => { throw new Error("logger failed"); },
      ),
      (error: unknown) => error === routeError,
    );
  });
});
