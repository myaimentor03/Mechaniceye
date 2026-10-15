import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOW_ISOLATED_TEST_DATABASE_ENV,
  CONFIRMED_TEST_INSTANCE_ID_ENV,
  EXPECTED_TEST_DATABASE_FINGERPRINT_ENV,
  EXPECTED_TEST_INSTANCE_ID_ENV,
  EXPECTED_TEST_SERVER_ADDRESS_ENV,
  ISOLATED_TEST_DATABASE,
  databaseTargetFingerprint,
  mutationTargetGuard,
  verifyConnectedDatabaseTarget,
} from "./db-target-safe.mjs";

const url = "postgres://test_user:never-print-this@127.0.0.1:5432/drivable_commerce_test?sslmode=disable";
const fingerprint = databaseTargetFingerprint(url);
const approvedEnv = {
  [ALLOW_ISOLATED_TEST_DATABASE_ENV]: "1",
  [EXPECTED_TEST_DATABASE_FINGERPRINT_ENV]: fingerprint,
  [EXPECTED_TEST_INSTANCE_ID_ENV]: "render-db-test-instance-123",
  [CONFIRMED_TEST_INSTANCE_ID_ENV]: "render-db-test-instance-123",
  [EXPECTED_TEST_SERVER_ADDRESS_ENV]: "127.0.0.1",
};

test("database target fingerprint excludes credentials and binds host, port, and database", () => {
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(databaseTargetFingerprint("postgres://different:password@127.0.0.1:5432/drivable_commerce_test?sslmode=disable"), fingerprint);
  assert.notEqual(databaseTargetFingerprint("postgres://u:p@127.0.0.2:5432/drivable_commerce_test?sslmode=disable"), fingerprint);
  assert.notEqual(databaseTargetFingerprint("postgres://u:p@127.0.0.1:5433/drivable_commerce_test?sslmode=disable"), fingerprint);
  assert.notEqual(databaseTargetFingerprint("postgres://u:p@127.0.0.1:5432/other"), fingerprint);
});

test("mutation target guard denies missing, malformed, wrong-name, and production targets", () => {
  for (const candidate of [undefined, "not a url", "https://host/drivable_commerce_test",
    "postgres://u:p@localhost:5432/other",
    "postgres://u:p@localhost:5432/mechaniceye_db", "postgres://u:p@localhost:5432/drivable_production"]) {
    const result = mutationTargetGuard(candidate, approvedEnv);
    assert.equal(result.ok, false);
  }
});

test("exact isolated database still denies missing opt-in, fingerprint, or instance attestation", () => {
  assert.equal(mutationTargetGuard(url, {}).ok, false);
  assert.equal(mutationTargetGuard(url, { ...approvedEnv, [ALLOW_ISOLATED_TEST_DATABASE_ENV]: undefined }).ok, false);
  assert.equal(mutationTargetGuard(url, { ...approvedEnv, [EXPECTED_TEST_DATABASE_FINGERPRINT_ENV]: "0".repeat(64) }).ok, false);
  assert.equal(mutationTargetGuard(url, { ...approvedEnv, [EXPECTED_TEST_INSTANCE_ID_ENV]: "" }).ok, false);
  assert.equal(mutationTargetGuard(url, { ...approvedEnv, [CONFIRMED_TEST_INSTANCE_ID_ENV]: "different-instance" }).ok, false);
  assert.equal(mutationTargetGuard(url, { ...approvedEnv, [EXPECTED_TEST_SERVER_ADDRESS_ENV]: "" }).ok, false);
  assert.equal(mutationTargetGuard(url, { ...approvedEnv, [EXPECTED_TEST_SERVER_ADDRESS_ENV]: "not-an-ip" }).ok, false);
});

test("the isolated test target passes only when all independent confirmations match", () => {
  const result = mutationTargetGuard(url, approvedEnv);
  assert.equal(result.ok, true);
  assert.equal(result.database, ISOLATED_TEST_DATABASE);
  assert.equal(result.fingerprint, fingerprint);
  assert.equal(JSON.stringify(result).includes("never-print-this"), false);
});

test("connected identity mismatch stops before a caller can issue writes", async () => {
  const calls = [];
  const client = { async query(sql) { calls.push(sql); return { rows: [{ database: "wrong_database", server_address: "127.0.0.1" }] }; } };
  await assert.rejects(() => verifyConnectedDatabaseTarget(client, approvedEnv), /identity did not match/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^select current_database\(\)/i);
});

test("connected identity must match both the exact database and verified server address", async () => {
  let calls = 0;
  const client = { async query() { calls += 1; return { rows: [{ database: ISOLATED_TEST_DATABASE, server_address: "127.0.0.1" }] }; } };
  assert.deepEqual(await verifyConnectedDatabaseTarget(client, approvedEnv), { database: ISOLATED_TEST_DATABASE, verified: true });
  assert.equal(calls, 1);
});
