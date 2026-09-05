/**
 * Read-only Buyer Check / Drivable launch data-readiness acceptance probe.
 *
 * Connects to the DATABASE_URL target (never printed), verifies schema,
 * seed counts, launch-control tables/triggers, and Buyer Check sample rows.
 * Performs NO writes whatsoever. Exits non-zero when the target is not ready.
 *
 * Usage:  DATABASE_URL=... node scripts/acceptance-buyer-data-readiness.mjs [--strict-packs=30]
 */

import pg from "pg";

const { Pool } = pg;
import {
  safeTargetDescription,
  sslConfigForUrl,
} from "./lib/db-target-safe.mjs";

const environment = process.env.DATABASE_URL?.trim();
const strictPacks = Number.parseInt(
  process.argv.find((arg) => arg.startsWith("--strict-packs="))?.split("=")[1] ?? "30",
  10,
);

const CORE_TABLES = Object.freeze([
  "users",
  "diagnoses",
  "fix_history_log",
  "chat_export_log",
  "mechanics",
  "consultations",
  "follow_up_requests",
  "drivable_seed_symptom_categories",
  "drivable_seed_evidence_items",
  "drivable_seed_roadside_risk_triggers",
  "drivable_seed_decision_paths",
  "drivable_seed_follow_up_questions",
  "drivable_seed_repair_vs_sell_factors",
  "drivable_seed_buyer_risk_flags",
  "drivable_seed_seller_disclosure_prompts",
  "drivable_confirmed_cases",
  "drivable_vehicle_knowledge_packs",
]);

const LAUNCH_CONTROL_TABLES = Object.freeze([
  "drivable_consent_events",
  "drivable_review_versions",
  "drivable_review_approvals",
  "drivable_review_rejections",
  "drivable_review_supersessions",
  "drivable_review_case_heads",
]);

const LAUNCH_CONTROL_TRIGGERS = Object.freeze([
  "drivable_consent_events_append_only",
  "drivable_consent_revocation_guard",
  "drivable_review_approvals_transition_guard",
  "drivable_review_rejections_transition_guard",
  "drivable_review_supersessions_transition_guard",
  "drivable_review_case_heads_guard",
]);

const EXPECTED_SEED_COUNTS = Object.freeze({
  drivable_seed_symptom_categories: 31,
  drivable_seed_evidence_items: 36,
  drivable_seed_roadside_risk_triggers: 25,
  drivable_seed_decision_paths: 16,
  drivable_seed_follow_up_questions: 72,
  drivable_seed_repair_vs_sell_factors: 25,
  drivable_seed_buyer_risk_flags: 35,
  drivable_seed_seller_disclosure_prompts: 30,
});

let pool;
const failures = [];

function report(ok, label, detail = "") {
  const marker = ok ? "OK  " : "FAIL";
  console.log(`${marker}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function tableNames() {
  const { rows } = await pool.query(
    "select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=current_schema() and c.relkind='r'",
  );
  return new Set(rows.map((r) => r.name));
}

async function triggerNames() {
  const { rows } = await pool.query(
    "select tgname as name from pg_trigger where not tgisinternal",
  );
  return new Set(rows.map((r) => r.name));
}

async function main() {
  console.log(`Acceptance target: ${safeTargetDescription(environment)}`);

  if (!environment) {
    console.log("\nDATABASE_URL is not set; skipping live acceptance probe.");
    console.log("Run with DATABASE_URL set to the reviewed staging/production target.");
    process.exitCode = 2;
    return;
  }

  pool = new Pool({
    connectionString: environment,
    max: 2,
    connectionTimeoutMillis: 5000,
    ssl: sslConfigForUrl(environment),
  });

  try {
    const healthy = await pool.query("select 1 as one");
    report(healthy.rows[0]?.one === 1, "Database reachable (select 1)");

    const tables = await tableNames();
    for (const table of CORE_TABLES) {
      report(tables.has(table), `core table ${table}`);
    }
    for (const table of LAUNCH_CONTROL_TABLES) {
      report(tables.has(table), `launch-control table ${table}`);
    }

    const triggers = await triggerNames();
    for (const trigger of LAUNCH_CONTROL_TRIGGERS) {
      report(triggers.has(trigger), `launch-control trigger ${trigger}`);
    }

    let seedTotal = 0;
    for (const [table, expected] of Object.entries(EXPECTED_SEED_COUNTS)) {
      const { rows } = await pool.query(`select count(*)::int as n from ${table}`);
      const actual = rows[0]?.n ?? -1;
      seedTotal += actual;
      report(actual === expected, `seed table ${table}`, `${actual}/${expected}`);
    }
    report(seedTotal === 270, "seed total rows", `${seedTotal}/270`);

    const packs = await pool.query(
      "select count(*)::int as n from drivable_vehicle_knowledge_packs",
    );
    const packCount = packs.rows[0]?.n ?? 0;
    report(
      packCount >= strictPacks,
      "vehicle knowledge packs",
      `${packCount} (expect >= ${strictPacks} via --strict-packs)`,
    );

    const focusPack = await pool.query(
      `select pack_id, vehicle_year, vehicle_make, vehicle_model, json_array_length(raw) is not null as has_raw
         from drivable_vehicle_knowledge_packs
        where vehicle_year = 2014 and lower(vehicle_make) = lower('Ford') and lower(vehicle_model) = lower('Focus')`,
    );
    report(focusPack.rows.length > 0, "Buyer Check sample 2014 Ford Focus", focusPack.rows.length ? `pack ${focusPack.rows[0].pack_id}` : "not found");

    const flags = await pool.query(
      "select risk_level, count(*)::int as n from drivable_seed_buyer_risk_flags group by risk_level order by risk_level",
    );
    const flagLevels = flags.rows.map((r) => `${r.risk_level}=${r.n}`).join(", ");
    report(
      flags.rows.length >= 1,
      "buyer risk flag risk_level distribution",
      flagLevels || "empty",
    );

    const risky = await pool.query(
      "select label, risk_level from drivable_seed_buyer_risk_flags where risk_level in ('high','critical') order by label limit 8",
    );
    const sample = risky.rows.map((r) => `${r.label} [${r.risk_level}]`).join(" | ");
    report(risky.rows.length >= 1, "high/critical buyer risk flag sample", sample || "none");
  } catch (error) {
    report(false, "probe execution", error instanceof Error ? error.message : String(error));
  } finally {
    await pool.end();
  }

  if (failures.length) {
    console.error(`\nAcceptance did not pass (${failures.length} failing check(s)):`);
    for (const item of failures) console.error(`  - ${item}`);
    process.exitCode = 1;
  } else {
    console.log("\nAcceptance passed: data is ready for Buyer Check / Drivable launch.");
  }
}

main();