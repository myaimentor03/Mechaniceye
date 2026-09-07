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
  const result = await client.query(`
    SELECT pack_id, vehicle_year, vehicle_make, vehicle_model, source, source_type, confidence
    FROM drivable_vehicle_knowledge_packs
    ORDER BY created_at DESC
    LIMIT 20
  `);

  console.table(result.rows);
} finally {
  await client.end();
}
