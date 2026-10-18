import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  JourneyPersistenceError,
  clearJourneyStoreForTests,
  getJourneyCase,
  journeyDurableStorageRequired,
  journeyStoreReady,
  seedJourneyCaseForTests,
  setJourneyCase,
} from "./journey-store.js";
import { createJourneyCase } from "./journey-state-machine.js";

const priorNodeEnv = process.env.NODE_ENV;
const priorDatabaseUrl = process.env.DATABASE_URL;
const priorStorePath = process.env.JOURNEY_STORE_PATH;

function useTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drivable-journey-store-"));
  process.env.JOURNEY_STORE_PATH = path.join(dir, "journey-store.json");
  return dir;
}

function cleanup() {
  clearJourneyStoreForTests();
  if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = priorNodeEnv;
  if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = priorDatabaseUrl;
  if (priorStorePath === undefined) delete process.env.JOURNEY_STORE_PATH;
  else process.env.JOURNEY_STORE_PATH = priorStorePath;
}

afterEach(cleanup);

test("production requires a durable journey store and never reports a case as saved without one", async () => {
  useTempStore();
  process.env.NODE_ENV = "production";
  delete process.env.DATABASE_URL;
  assert.equal(journeyDurableStorageRequired(), true);

  const caseData = createJourneyCase({
    vehicleInfo: "2020 Honda Civic",
    description: "Grinding noise when braking",
    customerId: "cust-durability-1",
  });

  // No DATABASE_URL in production: the write must refuse rather than land in
  // the container-local JSON mirror and be lost on the next deploy.
  await assert.rejects(
    () => setJourneyCase(caseData),
    (error: unknown) => error instanceof JourneyPersistenceError,
  );

  // The refused case must not be readable back as if it had been saved.
  assert.equal(getJourneyCase(caseData.id), undefined);

  // Startup readiness must also refuse in production.
  await assert.rejects(
    () => journeyStoreReady(),
    (error: unknown) => error instanceof JourneyPersistenceError,
  );
});

test("startup readiness is a no-op warning outside production", async () => {
  useTempStore();
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;

  const result = await journeyStoreReady();
  assert.equal(result.durable, false);
});

test("outside production the local mirror keeps journey cases readable", async () => {
  useTempStore();
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;

  const caseData = createJourneyCase({
    vehicleInfo: "2018 Honda Civic",
    description: "Grinding noise when braking",
    customerId: "cust-durability-2",
  });
  await setJourneyCase(caseData);

  const stored = getJourneyCase(caseData.id);
  assert.ok(stored, "case should be readable back in non-production");
  assert.equal(stored.id, caseData.id);
  assert.equal(fs.existsSync(process.env.JOURNEY_STORE_PATH!), true);
});

test("seedJourneyCaseForTests bypasses the durable write for test fixtures", () => {
  useTempStore();
  process.env.NODE_ENV = "production";
  delete process.env.DATABASE_URL;

  const caseData = createJourneyCase({
    vehicleInfo: "2016 Toyota RAV4",
    description: "Check engine light is on",
    customerId: "cust-durability-3",
  });
  seedJourneyCaseForTests(caseData);

  assert.equal(getJourneyCase(caseData.id)?.id, caseData.id);
});
