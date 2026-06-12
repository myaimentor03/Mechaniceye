import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const manifestPath = path.resolve("docs/seed-data/seed_import_manifest_v1.json");
const requiredManifestFields = [
  "datasetName",
  "version",
  "jsonFile",
  "csvFile",
  "proposedTable",
  "primaryKey",
  "requiredFields",
  "importPriority",
  "customerVisible",
  "internalOnly",
  "aiContextSafe",
  "importAllowedNow",
  "notes"
];

function hasValue(row, field) {
  return field in row && row[field] !== null && row[field] !== "";
}

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("manifest must be a non-empty array");
  }

  const datasets = [];

  for (const [manifestIndex, entry] of manifest.entries()) {
    for (const field of requiredManifestFields) {
      if (!hasValue(entry, field)) {
        throw new Error(`manifest entry ${manifestIndex + 1} is missing ${field}`);
      }
    }

    if (entry.importAllowedNow !== false) {
      throw new Error(`${entry.datasetName} must set importAllowedNow to false`);
    }

    if (!Array.isArray(entry.requiredFields) || entry.requiredFields.length === 0) {
      throw new Error(`${entry.datasetName} requiredFields must be a non-empty array`);
    }

    const jsonPath = path.resolve(entry.jsonFile);
    const rows = JSON.parse(await readFile(jsonPath, "utf8"));

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`${entry.jsonFile} must contain at least one row`);
    }

    rows.forEach((row, rowIndex) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`${entry.jsonFile} row ${rowIndex + 1} must be an object`);
      }

      for (const field of entry.requiredFields) {
        if (!hasValue(row, field)) {
          throw new Error(`${entry.jsonFile} row ${rowIndex + 1} is missing ${field}`);
        }
      }
    });

    datasets.push({ entry, rows });
  }

  datasets.sort((a, b) => a.entry.importPriority - b.entry.importPriority);

  console.log("Proposed seed import order:");
  console.table(
    datasets.map(({ entry, rows }) => ({
      Priority: entry.importPriority,
      Dataset: entry.datasetName,
      ProposedTable: entry.proposedTable,
      Rows: rows.length,
      ImportAllowedNow: entry.importAllowedNow
    }))
  );

  for (const { entry, rows } of datasets) {
    console.log(`\n${entry.importPriority}. ${entry.datasetName} (${rows.length} rows)`);
    console.log(`Source: ${entry.jsonFile}`);
    console.log(`Sample row: ${JSON.stringify(rows[0], null, 2)}`);
  }

  console.log("\nDRY RUN ONLY - no database changes made");
} catch (error) {
  console.error(`Seed import preview failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error("DRY RUN ONLY - no database changes made");
  process.exitCode = 1;
}
