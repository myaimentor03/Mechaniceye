const fs = require("fs");
const pg = require("pg");
const readline = require("readline");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map((h) => h.trim());

  return lines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",").map((v) => v.trim());
      return Object.fromEntries(
        headers.map((header, index) => [header, values[index] || ""])
      );
    });
}

function packId(row) {
  return `nhtsa_${row.year}_${row.make}_${row.model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function askForDatabaseUrl() {
  return new Promise((resolve) => {
    if (process.env.DATABASE_URL?.trim()) {
      resolve(process.env.DATABASE_URL.trim());
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("Enter Render DATABASE_URL: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const databaseUrl = await askForDatabaseUrl();

  if (!databaseUrl) {
    throw new Error("No DATABASE_URL was provided.");
  }

  const sourceFile = "data/nhtsa/batch-lists/tier2-common-used-vehicles.csv";
  const outputFile = "data/nhtsa/batch-lists/tier2-missing-vehicles.csv";

  const rows = parseCsv(fs.readFileSync(sourceFile, "utf8"));
  const expected = rows.map((row) => ({
    ...row,
    pack_id: packId(row),
  }));

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes("localhost") ||
      databaseUrl.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const result = await client.query(
      "SELECT pack_id FROM drivable_vehicle_knowledge_packs WHERE pack_id = ANY($1)",
      [expected.map((row) => row.pack_id)]
    );

    const existing = new Set(result.rows.map((row) => row.pack_id));
    const missing = expected.filter(
      (row) => !existing.has(row.pack_id)
    );

    const csv =
      [
        "year,make,model",
        ...missing.map(
          (row) => `${row.year},${row.make},${row.model}`
        ),
      ].join("\n") + "\n";

    fs.writeFileSync(outputFile, csv);

    console.log("");
    console.log(`Tier 2 expected rows: ${expected.length}`);
    console.log(
      `Tier 2 already imported: ${expected.length - missing.length}`
    );
    console.log(`Tier 2 missing rows: ${missing.length}`);
    console.log(`Wrote: ${outputFile}`);

    if (missing.length) {
      console.log("");
      console.log("First missing rows:");
      console.table(
        missing.slice(0, 10).map(({ year, make, model }) => ({
          year,
          make,
          model,
        }))
      );
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});