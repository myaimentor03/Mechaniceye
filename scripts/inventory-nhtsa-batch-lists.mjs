/**
 * Read-only inventory of every NHTSA batch list under data/nhtsa/batch-lists.
 *
 * No network calls and no database connection. Reports per file:
 *   - total rows
 *   - unique (year,make,model) vehicles
 *   - duplicate rows
 *   - malformed rows (missing year/make/model, non-numeric year)
 *   - expected unique pack count in the batch
 *   - how many of those pack JSON files already exist locally (gitignored dir)
 * and an overall unique-vehicle summary across all lists.
 */

import fs from "node:fs";
import path from "node:path";

const batchDir = "data/nhtsa/batch-lists";
const packsDir = path.join("data", "nhtsa", "vehicle-knowledge-packs");

try {
  if (!fs.existsSync(batchDir)) {
    throw new Error(`batch list directory not found: ${batchDir}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let index = 1; index < lines.length; index++) {
    const raw = lines[index];
    if (!raw.trim()) continue;
    const values = raw.split(",").map((v) => v.trim());
    const record = {};
    headers.forEach((header, i) => {
      record[header] = values[i] ?? "";
    });
    record.__raw = raw;
    rows.push(record);
  }
  return { headers, rows };
}

function packId(row) {
  return `nhtsa_${row.year}_${row.make}_${row.model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isMalformed(row) {
  const problems = [];
  if (typeof row.year !== "string" || !row.year.trim()) {
    problems.push("missing year");
  } else if (!/^\d{4}$/.test(row.year.trim())) {
    problems.push(`year not a 4-digit number: "${row.year.trim()}"`);
  }
  if (typeof row.make !== "string" || !row.make.trim()) {
    problems.push("missing make");
  }
  if (typeof row.model !== "string" || !row.model.trim()) {
    problems.push("missing model");
  }
  return problems;
}

const files = fs
  .readdirSync(batchDir)
  .filter((name) => /\.csv$/i.test(name))
  .sort();

const perFile = files.map((fileName) => {
  const filePath = path.join(batchDir, fileName);
  const { rows } = parseCsv(fs.readFileSync(filePath, "utf8"));

  const seen = new Map();
  const duplicateRows = [];
  const malformed = [];

  for (const row of rows) {
    const problems = isMalformed(row);
    if (problems.length) {
      malformed.push({ row: `${row.year || ""}/${row.make || ""}/${row.model || ""}`, problems });
      continue;
    }
    const key = `${row.year.trim()}|${row.make.trim().toLowerCase()}|${row.model.trim().toLowerCase()}`;
    if (seen.has(key)) {
      duplicateRows.push({ row: `${row.year.trim()}/${row.make.trim()}/${row.model.trim()}`, firstLine: seen.get(key) });
    } else {
      seen.set(key, row.__raw);
    }
  }

  const uniqueKeys = [...new Set(rows.filter((row) => isMalformed(row).length === 0).map((row) => `${row.year.trim()}|${row.make.trim().toLowerCase()}|${row.model.trim().toLowerCase()}`))];

  let existingPacks = 0;
  if (fs.existsSync(packsDir)) {
    const onDisk = new Set(
      fs.readdirSync(packsDir).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, "").toLowerCase())
    );
    for (const key of uniqueKeys) {
      const [year, make, model] = key.split("|");
      if (onDisk.has(packId({ year, make: `${make[0].toUpperCase()}${make.slice(1)}`, model: `${model[0].toUpperCase()}${model.slice(1)}` }))) {
        existingPacks++;
      }
    }
  }

  return {
    File: fileName,
    Rows: rows.length,
    UniqueVehicles: uniqueKeys.length,
    DuplicateRows: duplicateRows.length,
    MalformedRows: malformed.length,
    ExpectedPackCount: uniqueKeys.length,
    PacksAlreadyOnDisk: existingPacks,
    malformed,
    duplicates: duplicateRows,
  };
});

console.log("NHTSA batch list inventory (read-only, no network, no database):\n");
console.table(
  perFile.map((entry) => ({
    File: entry.File,
    Rows: entry.Rows,
    UniqueVehicles: entry.UniqueVehicles,
    Duplicates: entry.DuplicateRows,
    Malformed: entry.MalformedRows,
    ExpectedPackCount: entry.ExpectedPackCount,
    PacksOnDisk: entry.PacksAlreadyOnDisk,
  }))
);

const crossFileUnique = new Map();

console.log("\nOverall unique (year/make/model) rows across all lists (duplicates removed within and across files):");
let totalUnique = 0;
for (const entry of perFile) {
  const text = fs.readFileSync(path.join(batchDir, entry.File), "utf8");
  const { rows } = parseCsv(text);
  for (const row of rows) {
    if (isMalformed(row).length) continue;
    const key = `${row.year.trim()}|${row.make.trim().toLowerCase()}|${row.model.trim().toLowerCase()}`;
    if (!crossFileUnique.has(key)) {
      crossFileUnique.set(key, `${row.year.trim()}/${row.make.trim()}/${row.model.trim()}`);
    }
  }
  console.log(`  ${entry.File}: ${entry.UniqueVehicles}`);
  totalUnique += entry.UniqueVehicles;
}
console.log(`  Sum of list-level unique rows: ${totalUnique}`);
console.log(`  Distinct vehicles across all lists (case-insensitive, cross-file): ${crossFileUnique.size}`);

let overallFailed = false;
for (const entry of perFile) {
  if (entry.MalformedRows > 0) {
    console.error(`\n${entry.File}: malformed rows:`);
    for (const item of entry.malformed) {
      console.error(`  - ${item.row}: ${item.problems.join("; ")}`);
    }
    overallFailed = true;
  }
  if (entry.DuplicateRows > 0) {
    console.error(`\n${entry.File}: duplicate rows:`);
    for (const item of entry.duplicates) {
      console.error(`  - ${item.row} (first appears on line: ${item.firstLine || "unknown"})`);
    }
    overallFailed = true;
  }
}

if (overallFailed) {
  console.error("\nInventory found duplicates or malformed rows. Review before running a batch.");
  process.exitCode = 1;
} else {
  console.log("\nInventory clean: no duplicate rows and no malformed rows in any batch list.");
}