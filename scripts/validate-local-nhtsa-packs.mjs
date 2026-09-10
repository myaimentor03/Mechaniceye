/**
 * Local NHTSA vehicle-knowledge-pack quality validation (read-only, no DB,
 * no network).
 *
 * Scans every JSON file in data/nhtsa/vehicle-knowledge-packs/ and verifies:
 *  - parses as JSON;
 *  - carries the required pack fields;
 *  - packId matches the filename-derived pack id;
 *  - vehicle year/make/model present and internally consistent;
 *  - confidence is "medium" or "low";
 *  - vinRequiredForApplicability is a boolean;
 *  - array fields are actually arrays (riskTags, buyerQuestions,
 *    sellerEvidenceRequests, inspectionPrompts);
 *  - raw aggregate counts match the embedded arrays (best effort).
 *
 * Exits non-zero on any malformed pack. Never connects, mutates, or touches
 * the network — this is the zero-cost local "pack quality" gate that pairs
 * with scripts/inventory-nhtsa-batch-lists.mjs.
 *
 * Usage:  node scripts/validate-local-nhtsa-packs.mjs
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packsDir = path.join(root, "data", "nhtsa", "vehicle-knowledge-packs");

if (!fs.existsSync(packsDir)) {
  console.error(`vehicle-knowledge-packs directory not found: ${packsDir}`);
  console.error("Run nhtsa:batch first (dry-run) to generate local packs.");
  process.exit(1);
}

const files = fs
  .readdirSync(packsDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

const failures = [];
let checked = 0;

function fail(file, detail) {
  failures.push(`${file}: ${detail}`);
  console.error(`FAIL  ${file} — ${detail}`);
}

function derivePackIdFromFilename(name) {
  return name.replace(/\.json$/, "");
}

function parseYear(value) {
  const year = Number.parseInt(String(value), 10);
  return Number.isInteger(year) && year >= 1980 && year <= 2100 ? year : NaN;
}

for (const file of files) {
  const filePath = path.join(packsDir, file);
  let pack;
  try {
    pack = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(file, `not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  checked += 1;

  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    fail(file, "pack must be a JSON object");
    continue;
  }

  const expectedPackId = derivePackIdFromFilename(file);
  if (typeof pack.packId !== "string" || pack.packId !== expectedPackId) {
    fail(file, `packId ${JSON.stringify(pack.packId)} does not match filename-derived ${expectedPackId}`);
  }

  const year = parseYear(pack.vehicleYear);
  if (!Number.isInteger(year)) {
    fail(file, `vehicleYear must be a 4-digit year, got ${JSON.stringify(pack.vehicleYear)}`);
  }

  for (const field of ["vehicleMake", "vehicleModel"]) {
    if (typeof pack[field] !== "string" || pack[field].trim().length === 0) {
      fail(file, `${field} must be a non-empty string, got ${JSON.stringify(pack[field])}`);
    }
  }

  if (pack.source !== "NHTSA") {
    fail(file, `source must be "NHTSA", got ${JSON.stringify(pack.source)}`);
  }
  if (pack.sourceType !== "recalls_and_complaints") {
    fail(file, `sourceType must be "recalls_and_complaints", got ${JSON.stringify(pack.sourceType)}`);
  }

  if (typeof pack.summary !== "string" || (pack.summary ?? "").trim().length === 0) {
    fail(file, "summary must be a non-empty string");
  }

  if (pack.confidence !== "medium" && pack.confidence !== "low") {
    fail(file, `confidence must be "medium" or "low", got ${JSON.stringify(pack.confidence)}`);
  }

  if (typeof pack.vinRequiredForApplicability !== "boolean") {
    fail(file, `vinRequiredForApplicability must be a boolean, got ${JSON.stringify(pack.vinRequiredForApplicability)}`);
  }

  for (const field of ["riskTags", "buyerQuestions", "sellerEvidenceRequests", "inspectionPrompts"]) {
    if (!Array.isArray(pack[field])) {
      fail(file, `${field} must be an array, got ${JSON.stringify(typeof pack[field])}`);
    }
  }

  const raw = pack.raw;
  if (!raw || typeof raw !== "object") {
    fail(file, "raw must be an object");
  } else {
    const recallCount = Number.parseInt(String(raw.recallCount), 10);
    const complaintCount = Number.parseInt(String(raw.complaintCount), 10);
    const recallsArray = Array.isArray(raw.recalls) ? raw.recalls : [];
    const complaintsArray = Array.isArray(raw.complaints) ? raw.complaints : [];
    if (Number.isInteger(recallCount) && recallsArray.length !== 0 && recallsArray.length !== recallCount) {
      fail(file, `raw.recallCount ${recallCount} does not match raw.recalls length ${recallsArray.length}`);
    }
    if (Number.isInteger(complaintCount) && complaintsArray.length !== 0 && complaintsArray.length !== complaintCount) {
      fail(file, `raw.complaintCount ${complaintCount} does not match raw.complaints length ${complaintsArray.length}`);
    }
    if (typeof raw.fetchedAt !== "string" || raw.fetchedAt.trim().length === 0) {
      fail(file, "raw.fetchedAt must be a non-empty string");
    }
  }
}

console.log(`Local NHTSA pack quality: scanned ${files.length} file(s), validated ${checked}, ${failures.length} problem(s).`);
if (failures.length) {
  console.error(`\nPack quality FAILED (${failures.length} problem(s)):`);
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
console.log("Pack quality PASSED: all local vehicle-knowledge packs are structurally valid.");