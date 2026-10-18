import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { mutationTargetGuard, verifyConnectedDatabaseTarget } from "../scripts/lib/db-target-safe.mjs";

const candidateUrl = process.env.DRIVABLE_ALLOW_COMMERCE_TEST_SCHEMA_SETUP === "true"
  ? process.env.DRIVABLE_COMMERCE_TEST_DATABASE_URL
  : undefined;
const testUrl = candidateUrl && mutationTargetGuard(candidateUrl).ok ? candidateUrl : undefined;

test("Postgres: customer case history reads persisted cases only for the exact owner", {
  skip: !testUrl ? "Explicit verified isolated commerce-test URL and schema-setup opt-in are unavailable" : false,
}, async () => {
  const schema = `customer_history_${randomUUID().replaceAll("-", "")}`;
  const instanceId = process.env.DRIVABLE_EXPECTED_TEST_DATABASE_INSTANCE_ID?.trim() || "";
  const actualHostname = new URL(testUrl!).hostname.toLowerCase();
  assert.ok(instanceId && actualHostname.includes(instanceId.toLowerCase()), "test hostname must identify the authorized Render instance");

  const admin = new pg.Pool({ connectionString: testUrl, ssl: { rejectUnauthorized: false }, max: 1 });
  let schemaPool: pg.Pool | undefined;
  let drizzlePool: pg.Pool | undefined;
  let targetVerified = false;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
    // First database operation is read-only identity and TLS verification.
    await verifyConnectedDatabaseTarget(admin);
    const identity = await admin.query(
      "select current_database() as database, (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as tls",
    );
    assert.equal(identity.rows[0]?.database, "drivable_commerce_test");
    assert.equal(identity.rows[0]?.tls, true);
    targetVerified = true;

    await admin.query(`create schema ${schema}`);
    const schemaUrl = new URL(testUrl!);
    schemaUrl.searchParams.set("options", `-c search_path=${schema}`);
    schemaPool = new pg.Pool({ connectionString: schemaUrl.toString(), ssl: { rejectUnauthorized: false }, max: 2 });
    await verifyConnectedDatabaseTarget(schemaPool);
    const schemaTls = await schemaPool.query(
      "select (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as tls",
    );
    assert.equal(schemaTls.rows[0]?.tls, true);
    await schemaPool.query(await readFile(new URL("../migrations/0002_drivable_core_schema.sql", import.meta.url), "utf8"));
    await schemaPool.end();
    schemaPool = undefined;

    process.env.DATABASE_URL = schemaUrl.toString();
    const [{ storage }, { getPool }] = await Promise.all([
      import("./storage.js"),
      import("./db.js"),
    ]);
    drizzlePool = getPool();
    const ownerId = `synthetic_owner_${randomUUID().replaceAll("-", "")}`;
    const otherOwnerId = `synthetic_owner_${randomUUID().replaceAll("-", "")}`;
    await storage.createDiagnosis({
      id: `synthetic_case_${randomUUID().replaceAll("-", "")}`,
      userId: ownerId,
      vehicleInfo: "Synthetic 2018 Example Sedan",
      description: "Synthetic owner-only test case",
    });
    await storage.createDiagnosis({
      id: `synthetic_case_${randomUUID().replaceAll("-", "")}`,
      userId: otherOwnerId,
      vehicleInfo: "Synthetic 2020 Other Sedan",
      description: "Synthetic other-owner test case",
    });

    const ownerCases = await storage.getCustomerDiagnosesByUser(ownerId);
    assert.equal(ownerCases.length, 1);
    assert.equal(ownerCases[0]?.userId, ownerId);
    assert.equal(ownerCases[0]?.vehicleInfo, "Synthetic 2018 Example Sedan");
    assert.equal((await storage.getCustomerDiagnosesByUser(otherOwnerId)).length, 1);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    try {
      await schemaPool?.end();
    } finally {
      try {
        await drizzlePool?.end();
      } finally {
        try {
          if (targetVerified) await admin.query(`drop schema if exists ${schema} cascade`);
        } finally {
          await admin.end();
        }
      }
    }
  }
});
