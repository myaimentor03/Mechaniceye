/**
 * Drivable safe preflight — runs the full no-database, no-mutation battery a
 * single time and reports pass/fail per stage.
 *
* Nothing here connects to a database, mutates anything, or applies a
 * migration. It covers: seed validation, migration/schema parity, destructive-SQL
 * scan, NHTSA batch inventory, local pack quality, drizzle config inspection,
 * typecheck, production build, production storage guard, the seed-import dry run
 * (which only writes tmp/drivable-seed-import.sql), the persistence-truth
 * batteries, and the full no-DB contract sweep.
 *
 * Usage:  node scripts/run-safe-preflight.mjs
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, command) {
  process.stdout.write(`\n== ${label} ==\n`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    timeout: 10 * 60 * 1000,
    env: { ...process.env, DATABASE_URL: "" },
  });
  const ok = result.status === 0;
  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${label}`);
  return ok;
}

const stages = [
  ["validate seed data (270 rows)", "node scripts/validate-seed-data.mjs"],
  ["migration/schema parity", "node scripts/verify-migration-schema-parity.mjs"],
  ["destructive-SQL scan (migrations + seed preview)", "node scripts/scan-for-destructive-sql.mjs"],
  ["local NHTSA pack quality (no DB, no network)", "node scripts/validate-local-nhtsa-packs.mjs"],
  ["NHTSA batch inventory (no DB, no network)", "node scripts/inventory-nhtsa-batch-lists.mjs"],
  ["drizzle config inspection", "node scripts/inspect-db-config.mjs"],
  ["typecheck (tsc)", "npm run check"],
  ["production build (vite + esbuild)", "npm run build"],
  ["production storage guard (no in-memory fakes wired)", "node scripts/verify-production-storage-guards.mjs"],
  ["seed-import dry run (SQL preview only)", "npm run import:seed-data"],
  ["persistence truth test (no DB)", "npx tsx --test server/persistence-truth.test.ts"],
  ["storage persistence test (no DB)", "npx tsx --test server/storage-persistence.test.ts"],
  ["contract sweep (all no-DB suites)", "npm run test:safe-contracts"],
];

let passed = 0;
const failed = [];
for (const [label, command] of stages) {
  if (run(label, command)) {
    passed++;
  } else {
    failed.push(label);
  }
}

console.log(`\nPreflight complete: ${passed}/${stages.length} stages passed.`);
if (failed.length) {
  console.error(`Failed stages:\n${failed.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("All safe preflight stages passed. No database connection and no mutation were performed.");

