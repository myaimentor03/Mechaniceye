import fs from "node:fs";
import { spawnSync } from "node:child_process";

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map((h) => h.trim());

  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",").map((v) => v.trim());
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
}

function arg(name, fallback = null) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const file = arg("file", "data/nhtsa/batch-lists/tier1-marketplace-vehicles.csv");
const apply = process.argv.includes("--apply");
const limit = Number(arg("limit", 0));
const delayMs = Number(arg("delay-ms", 1500));

if (!fs.existsSync(file)) {
  throw new Error(`Batch file not found: ${file}`);
}

const rows = parseCsv(fs.readFileSync(file, "utf8"));
const selectedRows = limit > 0 ? rows.slice(0, limit) : rows;

console.log(`NHTSA batch file: ${file}`);
console.log(`Vehicles queued: ${selectedRows.length}`);
console.log(`Apply mode: ${apply ? "YES" : "NO, dry run"}`);
console.log("");

let success = 0;
let failed = 0;
const failures = [];

for (let i = 0; i < selectedRows.length; i++) {
  const row = selectedRows[i];

  console.log("");
  console.log(`=== ${i + 1}/${selectedRows.length}: ${row.year} ${row.make} ${row.model} ===`);

  const args = [
    "run",
    "nhtsa:pack",
    "--",
    "--year",
    row.year,
    "--make",
    row.make,
    "--model",
    row.model
  ];

  if (apply) args.push("--apply");

  const result = spawnSync("npm", args, {
    stdio: "inherit",
    shell: true,
    env: process.env
  });

  if (result.status === 0) {
    success++;
  } else {
    failed++;
    failures.push(row);
    console.error(`FAILED: ${row.year} ${row.make} ${row.model}`);
  }

  if (i < selectedRows.length - 1 && delayMs > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  }
}

console.log("");
console.log("NHTSA batch complete.");
console.log(`Success: ${success}`);
console.log(`Failed: ${failed}`);

if (failures.length) {
  console.log("");
  console.log("Failures:");
  console.table(failures);
}
