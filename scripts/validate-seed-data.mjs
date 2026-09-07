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

const results = [];
const manifestErrors = [];
const rowsByDataset = new Map();
let manifest = [];
let failed = false;

function hasValue(row, field) {
  return field in row && row[field] !== null && row[field] !== "";
}

try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  manifestErrors.push(`parse/read error: ${error instanceof Error ? error.message : String(error)}`);
}

if (!Array.isArray(manifest)) {
  manifestErrors.push("root value must be an array");
  manifest = [];
} else if (manifest.length === 0) {
  manifestErrors.push("manifest must contain at least one dataset");
}

const datasetNames = new Set();
const priorities = new Set();

manifest.forEach((entry, index) => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    manifestErrors.push(`entry ${index + 1} must be an object`);
    return;
  }

  for (const field of requiredManifestFields) {
    if (!hasValue(entry, field)) {
      manifestErrors.push(`entry ${index + 1} is missing ${field}`);
    }
  }

  if (!Array.isArray(entry.requiredFields) || entry.requiredFields.length === 0) {
    manifestErrors.push(`entry ${index + 1} requiredFields must be a non-empty array`);
  }

  if (entry.importAllowedNow !== false) {
    manifestErrors.push(`entry ${index + 1} importAllowedNow must be false`);
  }

  if (datasetNames.has(entry.datasetName)) {
    manifestErrors.push(`duplicate datasetName: ${entry.datasetName}`);
  }
  datasetNames.add(entry.datasetName);

  if (priorities.has(entry.importPriority)) {
    manifestErrors.push(`duplicate importPriority: ${entry.importPriority}`);
  }
  priorities.add(entry.importPriority);
});

if (manifestErrors.length) failed = true;

for (const entry of manifest) {
  const errors = [];
  let rows = [];

  try {
    const content = await readFile(path.resolve(entry.jsonFile), "utf8");
    rows = JSON.parse(content);
  } catch (error) {
    errors.push(`parse/read error: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(rows)) {
    errors.push("root value must be an array");
    rows = [];
  } else if (rows.length === 0) {
    errors.push("array must contain at least one row");
  }
  rowsByDataset.set(entry.datasetName, rows);

  const ids = new Set();
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`row ${index + 1} must be an object`);
      return;
    }

    for (const field of entry.requiredFields ?? []) {
      if (!hasValue(row, field)) {
        errors.push(`row ${index + 1} is missing ${field}`);
      }
    }

    const id = row[entry.primaryKey];
    if (typeof id !== "string" || !id) {
      errors.push(`row ${index + 1} has invalid ${entry.primaryKey}`);
    } else if (ids.has(id)) {
      errors.push(`duplicate ${entry.primaryKey}: ${id}`);
    } else {
      ids.add(id);
    }
  });

  if (errors.length) failed = true;
  results.push({
    Dataset: entry.datasetName,
    File: path.basename(entry.jsonFile),
    Rows: rows.length,
    Status: errors.length ? "FAIL" : "PASS",
    Details: errors.length
      ? errors.slice(0, 4).join("; ")
      : `required fields present; ${entry.primaryKey} values unique`
  });
}

console.log("Manifest validation:");
console.table([
  {
    File: path.basename(manifestPath),
    Datasets: manifest.length,
    Status: manifestErrors.length ? "FAIL" : "PASS",
    Details: manifestErrors.length
      ? manifestErrors.slice(0, 6).join("; ")
      : "required metadata present; priorities and dataset names unique; imports disabled"
  }
]);

console.log("\nSeed dataset validation:");
console.table(results);

const categoriesDataset = rowsByDataset.get("symptom_categories") ?? [];
const categoriesResult = results.find((result) => result.Dataset === "symptom_categories");
let crossErrors = [];
if (categoriesResult && categoriesResult.Status === "PASS") {
  const categoryIds = new Set(
    categoriesDataset
      .map((row) => row.symptomCategoryId)
      .filter((id) => typeof id === "string" && id),
  );
  crossErrors = (rowsByDataset.get("follow_up_questions") ?? [])
    .map((row) => {
      if (typeof row?.symptomCategoryId !== "string" || !row.symptomCategoryId) {
        return `follow_up_questions ${row?.questionId ?? "(unspecified)"} is missing symptomCategoryId`;
      }
      if (!categoryIds.has(row.symptomCategoryId)) {
        return `follow_up_questions ${row?.questionId ?? "(unspecified)"} references unknown symptomCategoryId ${row.symptomCategoryId}`;
      }
      return null;
    })
    .filter((message) => message !== null);
  console.log("\nCross-dataset referential validation:");
  if (crossErrors.length) {
    failed = true;
    crossErrors.slice(0, 8).forEach((message) => console.error(`FAIL  ${message}`));
  } else {
    console.log("PASS — all follow_up_questions.symptomCategoryId resolve to seed categories (matches 0003 FK)");
  }
} else {
  console.log("\nCross-dataset referential validation: SKIPPED (symptom_categories dataset failed to load)");
}

const totalRows = results.reduce((sum, result) => sum + result.Rows, 0);
const passedDatasets = results.filter((result) => result.Status === "PASS").length;
console.log(
  failed
    ? `Seed data validation failed: ${passedDatasets}/${results.length} datasets passed; ${totalRows} rows checked.`
    : `Seed data validation passed: ${results.length} datasets and ${totalRows} rows checked.`
);

process.exitCode = failed ? 1 : 0;
