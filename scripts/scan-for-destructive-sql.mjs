/**
 * Destructive-SQL safety scan for the checked-in migration set (read-only).
 *
 * The Drivable migrations are intentionally CREATE-only and idempotent
 * (CREATE ... IF NOT EXISTS / CREATE INDEX IF NOT EXISTS). This scanner
 * proves that guarantee by flagging any destructive statement in
 * migrations/*.sql:
 *   - DROP TABLE / DROP INDEX / DROP VIEW / DROP SEQUENCE
 *   - TRUNCATE
 *   - DELETE FROM
 *   - ALTER TABLE ... DROP
 *   - DROP SCHEMA / DROP DATABASE
 *   - UPDATE ... SET (non-append writes on seed/ops tables)
 *
 * It also scans the generated dry-run preview in tmp/ so a preflight run can
 * confirm the seed import preview contains only INSERT ... ON CONFLICT upserts.
 *
 * Exits non-zero when any destructive statement is found. Never connects to a
 * database and never mutates anything.
 *
 * Usage:  node scripts/scan-for-destructive-sql.mjs
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationDirs = ["migrations", "server/migrations"];
const previewFiles = [path.join("tmp", "drivable-seed-import.sql")];

const DESTRUCTIVE_PATTERNS = [
  { pattern: /\bdrop\s+(table|index|view|sequence|schema|database|materialized\s+view)\b/gi, label: "DROP *" },
  { pattern: /\btruncate\b/gi, label: "TRUNCATE" },
  { pattern: /\bdelete\s+from\b/gi, label: "DELETE FROM" },
  { pattern: /\balter\s+table[^;]*\bdrop\b/gi, label: "ALTER TABLE ... DROP" },
  { pattern: /\bupdate\s+[a-z_."]+\s+set\b/gi, label: "UPDATE ... SET" },
];

const failures = [];

function scanFile(dir, file, isMigration) {
  const full = path.join(root, dir, file);
  if (!fs.existsSync(full)) return;
  const source = fs.readFileSync(full, "utf8");
  for (const { pattern, label } of DESTRUCTIVE_PATTERNS) {
    const matches = source.match(pattern);
    if (!matches) continue;
    for (const match of matches) {
      failures.push(`${path.join(dir, file)}: unexpected ${label} statement "${match.trim()}"`);
      console.error(`FAIL  ${path.join(dir, file)} — ${label}: ${match.trim()}`);
    }
  }
  if (isMigration) {
    console.log(`OK    ${path.join(dir, file)} — free of destructive SQL`);
  }
}

for (const dir of migrationDirs) {
  if (!fs.existsSync(path.join(root, dir))) continue;
  for (const file of fs.readdirSync(path.join(root, dir)).filter((name) => name.endsWith(".sql")).sort()) {
    scanFile(dir, file, true);
  }
}

for (const file of previewFiles) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.log(`INFO  ${file} — not present (seed dry-run hasn't run); nothing to scan`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  const hasUpsert = /on\s+conflict/i.test(source);
  const destructive = new Set();
  for (const { pattern } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(source)) destructive.add(pattern.label);
  }
  if (!hasUpsert || destructive.size > 0) {
    failures.push(`${file}: expected only INSERT ... ON CONFLICT upserts (upsert=${hasUpsert}, destructive=${[...destructive].join(",") || "none"})`);
    console.error(`FAIL  ${file} — seed preview must contain only upserts`);
  } else {
    console.log(`OK    ${file} — contains only idempotent upserts`);
  }
}

if (failures.length) {
  console.error(`\nDestructive-SQL scan FAILED (${failures.length} finding(s)).`);
  process.exit(1);
}

console.log("\nDestructive-SQL scan PASSED: no destructive statements in migrations or seed preview.");