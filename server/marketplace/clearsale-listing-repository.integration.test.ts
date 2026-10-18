import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { mutationTargetGuard, verifyConnectedDatabaseTarget } from "../../scripts/lib/db-target-safe.mjs";
import { ClearSaleListingRepository } from "./clearsale-listing-repository.js";

const candidateUrl = process.env.DRIVABLE_ALLOW_COMMERCE_TEST_SCHEMA_SETUP === "true"
  ? process.env.DRIVABLE_COMMERCE_TEST_DATABASE_URL : undefined;
const testUrl = candidateUrl && mutationTargetGuard(candidateUrl).ok ? candidateUrl : undefined;

test("Postgres: ClearSale listing ownership, persistence, publication projection, and failure states", {
  skip: !testUrl ? "Explicit verified isolated commerce-test URL and schema-setup opt-in are unavailable" : false,
}, async () => {
  const schema = `clearsale_listing_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: testUrl, ssl: { rejectUnauthorized: false }, max: 1 });
  let pool: pg.Pool | undefined;
  let targetVerified = false;
  try {
    await verifyConnectedDatabaseTarget(admin);
    const tls = await admin.query<{ ssl: boolean }>("select (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as ssl");
    assert.equal(tls.rows[0]?.ssl, true, "the approved test connection must use TLS before any write");
    targetVerified = true;
    await admin.query(`create schema ${schema}`);
    const open = () => new pg.Pool({ connectionString: testUrl, ssl: { rejectUnauthorized: false }, options: `-c search_path=${schema}`, max: 2 });
    pool = open();
    await verifyConnectedDatabaseTarget(pool);
    const poolTls = await pool.query<{ ssl: boolean }>("select (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as ssl");
    assert.equal(poolTls.rows[0]?.ssl, true, "the schema-scoped test connection must use TLS");
    await pool.query(await readFile(new URL("../../migrations/0012_clearsale_listings.sql", import.meta.url), "utf8"));

    const sellerA = `seller_a_${randomUUID()}`;
    const sellerB = `seller_b_${randomUUID()}`;
    const repository = new ClearSaleListingRepository(pool);
    const input = {
      sellerName: "Synthetic Seller A", sellerEmail: "seller-a@example.test", sellerPhone: "555-0100",
      vehicleYear: 2012, make: "Ford", model: "F-150", trim: "XLT", vin: "1FTEXAMPLE1234567",
      mileage: 168400, askingPriceCents: 890000, titleStatus: "seller-reported clean title",
      runsAndDrives: "runs and drives", knownIssues: "Synthetic check-engine-light note",
      recentRepairs: "Synthetic brake service", sellerNotes: "Synthetic listing only",
    } as const;

    const created = await repository.create(sellerA, input);
    assert.equal(created.status, "draft");
    assert.equal((await repository.listOwned(sellerB)).length, 0);
    assert.equal(await repository.updateOwned(created.id, sellerB, input), null, "other seller cannot edit");

    const submitted = await repository.submit(created.id, sellerA);
    assert.equal(submitted.status, "pending_review");
    await assert.rejects(repository.approve(created.id), /storage is incomplete/);
    await pool.query(`update clearsale_listings set storage_status='persisted' where id=$1`, [created.id]);
    const published = await repository.approve(created.id);
    assert.equal(published.status, "published");

    await pool.end();
    pool = open();
    const restarted = new ClearSaleListingRepository(pool);
    const persisted = await restarted.getOwned(created.id, sellerA);
    assert.equal(persisted?.status, "published");
    const publicListing = await restarted.getPublic(created.id);
    assert.equal(publicListing?.id, created.id);
    assert.equal("sellerEmail" in (publicListing ?? {}), false);
    assert.equal("sellerUserId" in (publicListing ?? {}), false);
    assert.equal("internalEvidence" in (publicListing ?? {}), false);

    const withdrawn = await restarted.withdraw(created.id, sellerA);
    assert.equal(withdrawn.status, "withdrawn");
    assert.equal(await restarted.getPublic(created.id), null);

    const rejected = await restarted.create(sellerA, { ...input, sellerEmail: "seller-a-2@example.test" });
    await restarted.submit(rejected.id, sellerA);
    await restarted.reject(rejected.id, "Synthetic missing title evidence");
    assert.equal(await restarted.getPublic(rejected.id), null);

    const failed = await restarted.create(sellerA, { ...input, sellerEmail: "seller-a-3@example.test" });
    await restarted.markStorageFailure(failed.id, "SYNTHETIC_STORAGE_FAILURE");
    await assert.rejects(restarted.submit(failed.id, sellerA), /cannot be submitted/);
    assert.equal(await restarted.getPublic(failed.id), null);
  } finally {
    await pool?.end();
    if (targetVerified) await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
