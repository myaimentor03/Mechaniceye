import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { createJourneyCase } from "./journey-state-machine";
import { createJourneyCaseStorage, getJourneyCase, setJourneyCase, journeyCaseStorage, type JourneyCaseStorage } from "./journey-store";
import { createPgJourneyStore, JourneyStorageUnavailableError } from "./journey-store-pg";
import { createSessionToken } from "./customer-auth";
import { registerJourneyRoutes } from "./journey-routes";
import { pollAndEvaluate, getUnattendedWorkerStatus } from "./journey-unattended-worker";

function caseData() {
  return createJourneyCase({ vehicleInfo: "2020 Honda Civic", description: "Grinding when braking", customerId: "storage-test-customer" });
}

test("case facade rejects a failed database write without publishing a local case", async () => {
  const candidate = caseData();
  const storage = createJourneyCaseStorage({ useDatabase: () => true, database: async () => createPgJourneyStore({ query: async (text) => {
    if (text.includes("information_schema")) return { rows: [{ ready: 1 }] };
    throw new Error("database unavailable");
  } }) });
  await assert.rejects(storage.set(candidate), JourneyStorageUnavailableError);
  assert.equal(getJourneyCase(candidate.id), undefined);
});

test("production never uses local Journey cases when database configuration is missing", async () => {
  const candidate = caseData();
  const previousMode = process.env.NODE_ENV, previousDatabase = process.env.DATABASE_URL;
  process.env.NODE_ENV = "production"; delete process.env.DATABASE_URL;
  try {
    await assert.rejects(journeyCaseStorage.set(candidate), JourneyStorageUnavailableError);
    await assert.rejects(journeyCaseStorage.get(candidate.id), JourneyStorageUnavailableError);
    assert.throws(() => setJourneyCase(candidate), JourneyStorageUnavailableError);
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
  }
});

test("failed local file writes do not publish successful cached cases", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "journey-file-failure-"));
  const blocker = join(directory, "blocker"); await writeFile(blocker, "not a directory");
  const previousPath = process.env.JOURNEY_STORE_PATH;
  process.env.JOURNEY_STORE_PATH = join(blocker, "cases.json");
  const candidate = caseData();
  try {
    assert.throws(() => setJourneyCase(candidate), JourneyStorageUnavailableError);
    assert.equal(getJourneyCase(candidate.id), undefined);
  } finally {
    if (previousPath === undefined) delete process.env.JOURNEY_STORE_PATH; else process.env.JOURNEY_STORE_PATH = previousPath;
    await rm(directory, { recursive: true });
  }
});

test("customer start returns truthful 503 when the case write fails", async () => {
  const previousSecret = process.env.DRIVABLE_SESSION_SECRET;
  process.env.DRIVABLE_SESSION_SECRET = "journey-storage-test-session-secret-at-least-32-characters";
  const storage: JourneyCaseStorage = {
    get: async () => undefined, listAll: async () => [], listByCustomer: async () => [],
    set: async () => { throw new JourneyStorageUnavailableError(); },
  };
  const app = express(); app.use(express.json()); registerJourneyRoutes(app, undefined, storage);
  const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const token = createSessionToken({ id: "storage-test-customer", email: "storage@example.test" });
    const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/journey/start`, {
      method: "POST", headers: { cookie: `drivable_session=${encodeURIComponent(token)}`, "content-type": "application/json" }, body: JSON.stringify({ vehicleInfo: "2020 Honda Civic", description: "Grinding noise when braking" }),
    });
    assert.equal(response.status, 503);
    const body = await response.json() as { ok: boolean; persisted: boolean; code: string; id?: string };
    assert.equal(body.ok, false); assert.equal(body.persisted, false);
    assert.equal(body.code, "JOURNEY_STORAGE_UNAVAILABLE"); assert.equal(body.id, undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousSecret === undefined) delete process.env.DRIVABLE_SESSION_SECRET; else process.env.DRIVABLE_SESSION_SECRET = previousSecret;
  }
});

test("unattended evaluation records failure and never counts an unsaved result as completed", async () => {
  const candidate = { ...caseData(), state: "evidence_received" as const, confidenceLevel: "moderate" as const, confidenceScore: 50, evidence: [{ kind: "photo" as const, description: "Brake photo" }] };
  const before = getUnattendedWorkerStatus();
  let writes = 0;
  const storage: JourneyCaseStorage = {
    get: async () => candidate, listAll: async () => [candidate], listByCustomer: async () => [candidate],
    set: async () => { writes++; throw new JourneyStorageUnavailableError(); },
  };
  assert.equal(await pollAndEvaluate(storage), 0);
  assert.equal(writes, 1);
  assert.equal(candidate.state, "evidence_received");
  const after = getUnattendedWorkerStatus();
  assert.equal(after.totalProcessed, before.totalProcessed);
  assert.equal(after.totalErrors, before.totalErrors + 1);
});


test("unattended retry completes a durable evaluating case after the final write failed", async () => {
  let stored = { ...caseData(), state: "evidence_received", confidenceLevel: "moderate", confidenceScore: 50, evidence: [{ kind: "photo", description: "Brake photo" }] } as import("./journey-state-machine").JourneyCase;
  let failDiagnosis = true;
  const storage: JourneyCaseStorage = {
    get: async () => stored, listAll: async () => [stored], listByCustomer: async () => [stored],
    set: async (candidate) => {
      if (candidate.state === "diagnosis_ready" && failDiagnosis) throw new JourneyStorageUnavailableError();
      stored = candidate;
    },
  };
  assert.equal(await pollAndEvaluate(storage), 0);
  assert.equal(stored.state, "evaluating");
  failDiagnosis = false;
  assert.equal(await pollAndEvaluate(storage), 1);
  assert.equal(stored.state, "diagnosis_ready");
});
