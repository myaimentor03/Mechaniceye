/**
 * Static parity check: migrations/*.sql must describe exactly the tables and
 * indexes the canonical shared/schema.ts declares (plus the launch-control
 * tables that 0001 adds by design). Runs with no database and no network.
 *
 * Checks:
 *   1. Every schema.ts table has a CREATE TABLE IF NOT EXISTS in the SQL set.
 *   2. Every named index in schema.ts has a matching CREATE [UNIQUE] INDEX in
 *      the SQL set.
 *   3. Every CREATE TABLE in the SQL set is either in schema.ts or known as a
 *      launch-control/manual table (0001 consent/review + 0004 optional
 *      delivery outbox; 0003 hardening adds no tables, only
 *      constraints/indexes).
 *   4. No SQL table is missing its CREATE INDEX IF NOT EXISTS for the
 *      schema-declared indexes.
 *
 * Exits non-zero on any drift.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaFile = path.join(root, "shared", "schema.ts");
const migrationsDir = path.join(root, "migrations");
const failures = [];

function fail(label, detail) {
  failures.push(`${label}: ${detail}`);
  console.error(`FAIL  ${label} — ${detail}`);
}
function ok(label, detail) {
  console.log(`OK    ${label} — ${detail}`);
}

try {
  if (!fs.existsSync(schemaFile)) throw new Error(`canonical schema not found: ${schemaFile}`);
  if (!fs.existsSync(migrationsDir)) throw new Error(`migrations directory not found: ${migrationsDir}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const schemaSource = fs.readFileSync(schemaFile, "utf8");

const tablePattern = /pgTable\((["'`])([^"'`]+)\1/g;
const tableNames = [...schemaSource.matchAll(tablePattern)].map((m) => m[2]);

const lines = schemaSource.split(/\r?\n/);
let lastTable = null;
const uniqueIndexNames = [];
for (const line of lines) {
  const tableOpen = line.match(/pgTable\((["'`])([^"'`]+)\1/);
  if (tableOpen) {
    lastTable = tableOpen[2];
    continue;
  }
  if (line.includes(".unique()") && lastTable) {
    const column = line.match(/[A-Za-z0-9_]+\((["'`])([^"'`]+)\1\)/);
    if (column) {
      uniqueIndexNames.push(`${lastTable}_${column[2]}_unique`);
    }
  }
}

const indexNames = [...schemaSource.matchAll(/index\((["'`])([^"'`]+)\1/g)].map((m) => m[2]);

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((name) => /\.sql$/i.test(name))
  .sort();

const sqlTables = new Map();
const sqlUniqueIndexes = new Set();
const sqlIndexes = new Set();

for (const file of migrationFiles) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  for (const match of sql.matchAll(/create table if not exists ([a-z0-9_]+)/gi)) {
    const name = match[1];
    if (!sqlTables.has(name)) sqlTables.set(name, file);
  }
  for (const match of sql.matchAll(/create unique index if not exists ([a-z0-9_]+)/gi)) {
    sqlUniqueIndexes.add(match[1]);
  }
  for (const match of sql.matchAll(/create index if not exists ([a-z0-9_]+)/gi)) {
    sqlIndexes.add(match[1]);
  }
}

ok("migration set", migrationFiles.join(", "));

const EXPECTED_LAUNCH_CONTROL_TABLES = Object.freeze([
  "drivable_consent_events",
  "drivable_review_versions",
  "drivable_review_approvals",
  "drivable_review_rejections",
  "drivable_review_supersessions",
  "drivable_review_case_heads",
]);

// Optional manual tables that live outside shared/schema.ts but ARE committed
// migrations (unlike the ephemeral seed tables). schema.ts stays the source of
// truth for wired runtime tables; the outbox is advisory until a durable
// outbox implementation is wired.
const EXPECTED_OPTIONAL_MANUAL_TABLES = Object.freeze([
  "drivable_delivery_outbox",
]);

for (const table of tableNames) {
  if (sqlTables.has(table)) {
    ok(`table ${table}`, "present in migrations");
  } else {
    fail(`table ${table}`, "missing CREATE TABLE in migrations");
  }
}

for (const table of sqlTables.keys()) {
  if (
    tableNames.includes(table) ||
    EXPECTED_LAUNCH_CONTROL_TABLES.includes(table) ||
    EXPECTED_OPTIONAL_MANUAL_TABLES.includes(table)
  ) {
    continue;
  }
  fail(`table ${table}`, "not declared in shared/schema.ts (unknown extra table)");
}

const schemaDeclaredIndexes = [...new Set([...indexNames, ...uniqueIndexNames])];
for (const index of schemaDeclaredIndexes) {
  if (sqlIndexes.has(index) || sqlUniqueIndexes.has(index)) {
    ok(`index ${index}`, "present in migrations");
  } else {
    fail(`index ${index}`, "missing CREATE INDEX in migrations");
  }
}

for (const constraint of uniqueIndexNames) {
  if (sqlUniqueIndexes.has(constraint)) {
    ok(`index ${constraint}`, "present in migrations (from .unique())");
  } else {
    fail(`index ${constraint}`, "missing in migrations (see 0002 users/mechanics unique indexes)");
  }
}

const sqlTablesMissing = [...sqlTables.keys()].filter(
  (table) => !tableNames.includes(table) &&
    !EXPECTED_LAUNCH_CONTROL_TABLES.includes(table) &&
    !EXPECTED_OPTIONAL_MANUAL_TABLES.includes(table),
);
if (sqlTablesMissing.length === 0) {
  ok("no unknown tables", "all SQL tables are schema-declared, launch-control, or documented optional");
}

if (failures.length) {
  console.error(`\nMigration/schema parity FAILED (${failures.length} problem(s)). See log above.`);
  process.exit(1);
}

console.log("\nMigration/schema parity PASSED: migrations match shared/schema.ts (no database required).");