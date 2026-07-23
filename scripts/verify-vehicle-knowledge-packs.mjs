import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
