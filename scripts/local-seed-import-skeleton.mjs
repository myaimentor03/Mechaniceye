import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REQUIRED_FLAG = "--dry-run";
const MANIFEST_PATH = path.resolve("docs/seed-data/seed_import_manifest_v1.json");
const PRODUCTION_HOST_MARKERS = [
  "render.com",
  "render",
  "amazonaws",
  "neon.tech",
  "supabase",
  "railway",
  "production",
  "prod"
];

const requiredManifestFields = [
  "datasetName",
  "version",
  "jsonFile",
  "proposedTable",
  "primaryKey",
  "requiredFields",
  "importPriority",
  "importAllowedNow"
];

function hasValue(record, field) {
  return (
    Object.prototype.hasOwnProperty.call(record, field) &&
    record[field] !== null &&
    record[field] !== ""
  );
}

function fail(message) {
  console.error(`Local seed import skeleton refused: ${message}`);
  console.error("LOCAL SKELETON ONLY - no database connection made");
  process.exitCode = 1;
}

if (!process.argv.slice(2).includes(REQUIRED_FLAG)) {
  fail(`explicit ${REQUIRED_FLAG} flag is required`);
} else {
  const databaseUrl = process.env.DATABASE_URL || "";
  const normalizedDatabaseUrl = databaseUrl.toLowerCase();
  const blockedMarker = PRODUCTION_HOST_MARKERS.find((marker) =>
    normalizedDatabaseUrl.includes(marker)
  );

  if (blockedMarker) {
    fail(`DATABASE_URL contains blocked production-like marker "${blockedMarker}"`);
  } else {
    try {
      const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));

      if (!Array.isArray(manifest) || manifest.length === 0) {
        throw new Error("seed import manifest must be a non-empty array");
      }

      const summaries = [];

      for (const [manifestIndex, entry] of manifest.entries()) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error(`manifest entry ${manifestIndex + 1} must be an object`);
        }

        for (const field of requiredManifestFields) {
          if (!hasValue(entry, field)) {
            throw new Error(`manifest entry ${manifestIndex + 1} is missing ${field}`);
          }
        }

        if (!Array.isArray(entry.requiredFields) || entry.requiredFields.length === 0) {
          throw new Error(`${entry.datasetName} requiredFields must be a non-empty array`);
        }
        if (entry.importAllowedNow !== false) {
          throw new Error(`${entry.datasetName} importAllowedNow must remain false`);
        }

        const seedPath = path.resolve(entry.jsonFile);
        const rows = JSON.parse(await readFile(seedPath, "utf8"));

        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error(`${entry.jsonFile} must contain a non-empty array`);
        }

        const ids = new Set();

        rows.forEach((row, rowIndex) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) {
            throw new Error(`${entry.jsonFile} row ${rowIndex + 1} must be an object`);
          }

          for (const field of entry.requiredFields) {
            if (!hasValue(row, field)) {
              throw new Error(`${entry.jsonFile} row ${rowIndex + 1} is missing ${field}`);
            }
          }

          const id = row[entry.primaryKey];
          if (typeof id !== "string" || id.trim() === "") {
            throw new Error(
              `${entry.jsonFile} row ${rowIndex + 1} has invalid ${entry.primaryKey}`
            );
          }
          if (ids.has(id)) {
            throw new Error(`${entry.jsonFile} has duplicate ${entry.primaryKey} "${id}"`);
          }
          ids.add(id);
        });

        summaries.push({
          Priority: entry.importPriority,
          Dataset: entry.datasetName,
          ProposedTable: entry.proposedTable,
          Rows: rows.length,
          PrimaryKey: entry.primaryKey
        });
      }

      summaries.sort((a, b) => a.Priority - b.Priority);
      console.log("Validated proposed local seed import:");
      console.table(summaries);
      console.log(
        `Total proposed rows: ${summaries.reduce((total, item) => total + item.Rows, 0)}`
      );
      console.log("No SQL was generated or executed.");
      console.log("LOCAL SKELETON ONLY - no database connection made");
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
}
