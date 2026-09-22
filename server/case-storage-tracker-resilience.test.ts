import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { mock } from "node:test";
import { trackerCsvPath } from "./case-storage.js";

/**
 * P0 tracker failure resilience (commit fe4d5d8).
 *
 * The CSV tracker append is a best-effort side-effect: if it fails (disk full,
 * permissions, CSV corruption), case creation MUST still succeed. A failing
 * tracker must never block case creation or crash the intake route.
 */

const input = {
  description: "Customer Email: tracker-test@example.com\nVIN: 1HGCM82633A004352\nMileage: 90000\nEngine running rough",
  vehicleInfo: "2017 Subaru Outback 2.5L",
  rawVehicleSelection: { year: "2017", make: "Subaru", model: "Outback", engine: "2.5L" },
};

test("createStoredDiagnosisCase returns valid case when CSV tracker append fails", async () => {
  const { createStoredDiagnosisCase, getStoredDiagnosisCase } = await import("./case-storage.js");

  const appendMock = mock.method(fs, "appendFileSync", () => {
    throw new Error("ENOSPC: no space left on device (simulated tracker failure)");
  });

  try {
    const stored = createStoredDiagnosisCase(input);

    assert.ok(stored, "case must be returned even when tracker fails");
    assert.ok(stored.id.startsWith("CASE-"), "case ID must have valid format");
    assert.equal(stored.status, "received");
    assert.ok(stored.createdAt, "case must have a createdAt timestamp");
    assert.ok(stored.caseFolder, "case must have a caseFolder path");

    const retrieved = getStoredDiagnosisCase(stored.id);
    assert.ok(retrieved, "case must be retrievable from disk after tracker failure");
    assert.equal(retrieved!.id, stored.id);
    assert.equal(retrieved!.description, input.description);

    const fs2 = await import("node:fs");
    const path2 = await import("node:path");
    assert.ok(fs2.existsSync(path2.join(stored.caseFolder, "case.json")), "case.json must exist");
    assert.ok(fs2.existsSync(path2.join(stored.caseFolder, "summary.txt")), "summary.txt must exist");

    try { fs2.rmSync(stored.caseFolder, { recursive: true, force: true }); } catch {}
  } finally {
    appendMock.mock.restore();
  }
});

test("createStoredDiagnosisCase returns valid case when CSV tracker read also fails", async () => {
  const { createStoredDiagnosisCase } = await import("./case-storage.js");
  const originalReadFileSync = fs.readFileSync;

  const readMock = mock.method(fs, "readFileSync", function (this: unknown, filePath: unknown, ...args: unknown[]) {
    if (typeof filePath === "string" && filePath === trackerCsvPath) {
      throw new Error("EACCES: permission denied (simulated CSV read failure)");
    }
    return originalReadFileSync.call(this as typeof fs, filePath as any, ...args as any);
  });

  try {
    const stored = createStoredDiagnosisCase(input);

    assert.ok(stored, "case must be returned even when tracker read + write fails");
    assert.ok(stored.id.startsWith("CASE-"), "case ID must have valid format");
    assert.equal(stored.status, "received");

    const fs2 = await import("node:fs");
    const path2 = await import("node:path");
    assert.ok(fs2.existsSync(path2.join(stored.caseFolder, "case.json")), "case.json must exist");

    try { fs2.rmSync(stored.caseFolder, { recursive: true, force: true }); } catch {}
  } finally {
    readMock.mock.restore();
  }
});

test("createStoredDiagnosisCase cleans up case folder when case.json write fails", async () => {
  const { createStoredDiagnosisCase } = await import("./case-storage.js");

  let writeCount = 0;
  const writeMock = mock.method(fs, "writeFileSync", (filePath: string, ...args: unknown[]) => {
    writeCount++;
    if (writeCount === 1) {
      throw new Error("ENOSPC: no space left on device (simulated case.json write failure)");
    }
  });

  try {
    assert.throws(
      () => createStoredDiagnosisCase(input),
      (error: unknown) => error instanceof Error && error.message.includes("ENOSPC"),
      "case.json write failure must propagate as an error",
    );
  } finally {
    writeMock.mock.restore();
  }
});
