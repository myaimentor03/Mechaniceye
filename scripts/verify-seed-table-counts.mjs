import pg from "pg";

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const tables = [
  "drivable_seed_symptom_categories",
  "drivable_seed_evidence_items",
  "drivable_seed_roadside_risk_triggers",
  "drivable_seed_decision_paths",
  "drivable_seed_follow_up_questions",
  "drivable_seed_repair_vs_sell_factors",
  "drivable_seed_buyer_risk_flags",
  "drivable_seed_seller_disclosure_prompts"
];

await client.connect();

try {
  for (const table of tables) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
    console.log(`${table}: ${result.rows[0].count}`);
  }
} finally {
  await client.end();
}
