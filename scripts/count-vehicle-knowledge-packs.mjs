import pg from "pg";
import { safeTargetDescription, sslConfigForUrl } from "./lib/db-target-safe.mjs";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. This read-only verification requires a configured target.");
}
console.log(`Read-only verification target: ${safeTargetDescription(process.env.DATABASE_URL)}`);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfigForUrl(process.env.DATABASE_URL)
});

await client.connect();

try {
  const total = await client.query(`
    SELECT count(*)::int AS total
    FROM drivable_vehicle_knowledge_packs
  `);

  const bySource = await client.query(`
    SELECT source, source_type, count(*)::int AS count
    FROM drivable_vehicle_knowledge_packs
    GROUP BY source, source_type
    ORDER BY count DESC
  `);

  console.log("Total vehicle knowledge packs:", total.rows[0].total);
  console.table(bySource.rows);
} finally {
  await client.end();
}
