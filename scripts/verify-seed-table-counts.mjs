import pg from "pg";
import { mutationTargetGuard, safeTargetDescription, sslConfigForUrl, verifyConnectedDatabaseTarget } from "./lib/db-target-safe.mjs";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. This read-only verification requires a configured target.");
}
console.log(`Read-only verification target: ${safeTargetDescription(process.env.DATABASE_URL)}`);
const targetGuard = mutationTargetGuard(process.env.DATABASE_URL);
if (!targetGuard.ok) throw new Error(`Read-only verification refused before connection: ${targetGuard.reason}`);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfigForUrl(process.env.DATABASE_URL)
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

const expectedCounts = {
  drivable_seed_symptom_categories: 31,
  drivable_seed_evidence_items: 36,
  drivable_seed_roadside_risk_triggers: 25,
  drivable_seed_decision_paths: 16,
  drivable_seed_follow_up_questions: 72,
  drivable_seed_repair_vs_sell_factors: 25,
  drivable_seed_buyer_risk_flags: 35,
  drivable_seed_seller_disclosure_prompts: 30
};

let failed = false;
let total = 0;

try {
  await client.connect();
  await verifyConnectedDatabaseTarget(client);
  for (const table of tables) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
    const count = result.rows[0].count;
    const expected = expectedCounts[table];
    const match = count === expected ? "OK" : `MISMATCH (expected ${expected})`;
    if (count !== expected) failed = true;
    console.log(`${table}: ${count} [${match}]`);
    total += count;
  }
  console.log(`\nTotal seed rows: ${total} (expected 270)`);
  if (total !== 270) failed = true;
  if (failed) process.exitCode = 1;
} finally {
  await client.end();
}
