import assert from "node:assert/strict";
import test from "node:test";
import { syncFilePreviewUrls } from "./filePreviewUrls";

function fakeFile(name: string): File {
  // Identity-keyed stand-in; sync helper only uses object identity.
  return { name } as unknown as File;
}

test("creates one URL per added file", () => {
  let created = 0;
  const revoked: string[] = [];
  const a = fakeFile("a.jpg");
  const b = fakeFile("b.jpg");
  const next = syncFilePreviewUrls(
    new Map(),
    [a, b],
    () => `blob:${++created}`,
    (url) => void revoked.push(url),
  );
  assert.equal(next.size, 2);
  assert.equal(created, 2);
  assert.deepEqual(revoked, []);
});

test("reuses URLs for retained files and only creates for added ones", () => {
  const a = fakeFile("a.jpg");
  const b = fakeFile("b.jpg");
  const c = fakeFile("c.jpg");
  let created = 0;
  const revoked: string[] = [];
  const prev = new Map<File, string>([
    [a, "blob:a"],
    [b, "blob:b"],
  ]);
  // New array reference (as setFormData produces) with same identities + one add.
  const next = syncFilePreviewUrls(
    prev,
    [a, b, c],
    () => `blob:new-${++created}`,
    (url) => void revoked.push(url),
  );
  assert.equal(next.get(a), "blob:a");
  assert.equal(next.get(b), "blob:b");
  assert.equal(created, 1);
  assert.deepEqual(revoked, []);
});

test("revokes URLs exactly once for removed files", () => {
  const a = fakeFile("a.jpg");
  const b = fakeFile("b.jpg");
  const revoked: string[] = [];
  const prev = new Map<File, string>([
    [a, "blob:a"],
    [b, "blob:b"],
  ]);
  const next = syncFilePreviewUrls(
    prev,
    [a],
    () => "blob:should-not-create",
    (url) => void revoked.push(url),
  );
  assert.equal(next.size, 1);
  assert.deepEqual(revoked, ["blob:b"]);
});

test("empty file list revokes everything and creates nothing", () => {
  const a = fakeFile("a.jpg");
  const revoked: string[] = [];
  let created = 0;
  const next = syncFilePreviewUrls(
    new Map([[a, "blob:a"]]),
    [],
    () => `blob:${++created}`,
    (url) => void revoked.push(url),
  );
  assert.equal(next.size, 0);
  assert.equal(created, 0);
  assert.deepEqual(revoked, ["blob:a"]);
});
