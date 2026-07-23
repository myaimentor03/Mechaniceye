import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
