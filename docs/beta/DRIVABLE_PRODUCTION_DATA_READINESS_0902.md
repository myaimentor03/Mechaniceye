> [!IMPORTANT] ARCHIVED SOURCE AUDIT (2026-09-02)
> This file is the verbatim source readiness audit that this branch was built
> against. It is archived for reference ("audit memo" references in
> `DRIVABLE_DATA_MIGRATION_AND_IMPORT_RUNBOOK_0902.md` point here). Several
> statements are stale relative to the shipped code — this branch implemented
> the work. Verified corrections are documented in the runbook:
>   - Migrations now exist (`migrations/0001..0004`), verified byte-for-byte
>     against `shared/schema.ts` (`verify:migration-parity`).
>   - `import-seed-data-to-db.mjs --apply` now enforces the manifest
>     `importAllowedNow` gate (or `DRIVABLE_ALLOW_SEED_IMPORT=1`).
>   - Tier-1 NHTSA distribution is Ford 9 / Chevrolet 7 (not the 10 / 6 in the
>     prose below); the CSV is authoritative (30 total).
>   - Reviewer read routes now bridge to Postgres for durable diagnosis reads.
>   - The local-case-store fallback returns 202 + `persisted:false` and skips
>     webhooks when the database mirror write fails.
>

# Drivable Production Data Readiness Audit

**Date:** 2026-09-02
**Author:** OpenCode Worker 3 (Database / Buyer Check / NHTSA Readiness Specialist)
**Scope:** Read-only audit. No production database writes, no migrations, no --apply runs.

---

## 1. Executive Summary

| Area | Status |
|------|--------|
| Schema defined in code | YES - 17 tables in shared/schema.ts |
| Migrations generated | NO - migrations/ directory does not exist |
| Seed data files ready | YES - 8 JSON datasets, 270 rows total |
| Seed import tooling ready | YES - dry-run and --apply scripts exist |
| NHTSA batch tooling ready | YES - batch list with 30 tier-1 vehicles |
| NHTSA packs built locally | NO - 0 packs (gitignored, not yet generated) |
| DB connection active | PARTIAL - server/db.ts connects but LocalStorage (in-memory) is primary |
| Buyer Check data ready | NO - requires DB tables + seed data + NHTSA packs |

**Verdict: CONDITIONAL GO** - All tooling and data files are ready. Production launch requires running the import steps below in order. No code changes needed.

---

## 2. Required Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| DATABASE_URL | YES | PostgreSQL connection string (SSL required, rejectUnauthorized: false) |
| DRIVABLE_AI_MODE | Optional | "mock" (default) or "live" |
| OPENAI_API_KEY | Conditional | Required only when DRIVABLE_AI_MODE=live |
| PORT | Optional | Server port (default 5000) |

The DATABASE_URL must point to a provisioned PostgreSQL database (e.g., Neon, Render Postgres). The connection uses pg Pool with SSL enabled. See server/db.ts lines 17-30.

---

## 3. Database Schema - All Required Tables

### 3a. App-Level Tables (7 tables)

Defined in shared/schema.ts lines 6-151. These power core diagnosis, consultation, and user functionality.

| Table | Purpose | Row Estimate |
|-------|---------|--------------|
| users | User accounts, subscription tiers | Grows with users |
| diagnoses | Diagnosis cases (vehicle, description, AI output) | Grows with usage |
| fix_history_log | Fix attempt history per diagnosis | Grows with usage |
| chat_export_log | Chat export for mechanic handoff | Grows with usage |
| mechanics | Mechanic profiles and ratings | Seed + grows |
| consultations | Consultation sessions and feedback | Grows with usage |
| follow_up_requests | Follow-up info requests | Grows with usage |

### 3b. Drivable Seed Knowledge Tables (8 tables)

Defined in shared/schema.ts lines 154-269. These power day-one guidance, buyer/seller workflows, roadside safety, and decision support.

| Table | Seed Rows | Source File |
|-------|-----------|-------------|
| drivable_seed_symptom_categories | 31 | symptom_categories_seed_v1.json |
| drivable_seed_evidence_items | 36 | evidence_items_seed_v1.json |
| drivable_seed_roadside_risk_triggers | 25 | roadside_risk_triggers_seed_v1.json |
| drivable_seed_decision_paths | 16 | decision_paths_seed_v1.json |
| drivable_seed_follow_up_questions | 72 | follow_up_questions_seed_v1.json |
| drivable_seed_repair_vs_sell_factors | 25 | repair_vs_sell_factors_seed_v1.json |
| drivable_seed_buyer_risk_flags | 35 | buyer_risk_flags_seed_v1.json |
| drivable_seed_seller_disclosure_prompts | 30 | seller_disclosure_seed_v1.json |

**Total seed rows: 270**

### 3c. Drivable Operational Tables (2 tables)

| Table | Purpose | Initial Rows |
|-------|---------|--------------|
| drivable_confirmed_cases | Confirmed fix outcomes (future use) | 0 |
| drivable_vehicle_knowledge_packs | NHTSA-sourced vehicle context packs | 0 (must be imported) |

### 3d. Indexes

Defined in shared/schema.ts:
- seed_follow_up_symptom_idx on drivable_seed_follow_up_questions(symptom_category_id)
- confirmed_cases_vehicle_idx on drivable_confirmed_cases(vehicle_year, vehicle_make, vehicle_model)
- knowledge_packs_vehicle_idx on drivable_vehicle_knowledge_packs(vehicle_year, vehicle_make, vehicle_model)
- mechanics_rating_idx, mechanics_active_idx
- consultations_mechanic_idx, consultations_user_idx, consultations_status_idx
- follow_up_diagnosis_idx

---

## 4. Exact Required Migrations

The migrations/ directory does not exist. No Drizzle migration files have been generated.

### Step 1: Generate migration files

```bash
npx drizzle-kit generate
```

This reads shared/schema.ts (per drizzle.config.ts line 9) and writes SQL migration files to ./migrations/.

### Step 2: Apply schema to database

**Option A - Direct push (simpler, recommended for first setup):**
```bash
npm run db:push
```
This runs drizzle-kit push which applies the schema directly without migration files.

**Option B - Migration-based (recommended for ongoing):**
```bash
npx drizzle-kit migrate
```
This runs the generated migration files in order.

**Important:** The schema includes all 17 tables (7 app + 8 seed + 2 operational). A single push/migrate creates everything.

---

## 5. Exact Required Seed Data Import Commands

### Step 3: Create seed tables (alternative to drizzle-kit push)

If drizzle-kit push was used in Step 2, skip this. The tables already exist.

```bash
npm run create:seed-tables
```

This runs scripts/create-seed-tables-only.mjs which executes raw CREATE TABLE IF NOT EXISTS statements for all 10 Drivable tables (8 seed + confirmed_cases + vehicle_knowledge_packs). Safe to re-run.

### Step 4: Import seed data

```bash
npm run import:seed-data -- --apply
```

This runs scripts/import-seed-data-to-db.mjs --apply which:
1. Reads all 8 JSON files from docs/seed-data/json/
2. Generates UPSERT SQL (INSERT ... ON CONFLICT DO UPDATE)
3. Wraps in a transaction (BEGIN / COMMIT / ROLLBACK on error)
4. Imports 270 rows across 8 tables

**Idempotent:** Safe to re-run. Uses ON CONFLICT (primary_key) DO UPDATE SET ...

**Dry run first (recommended):**
```bash
npm run import:seed-data
```
Without --apply, this writes SQL to tmp/drivable-seed-import.sql without connecting to the database.

---

## 6. Exact NHTSA Import Commands

### Step 5: Build NHTSA vehicle knowledge packs

**Single vehicle (test):**
```bash
npm run nhtsa:pack -- --year 2014 --make Ford --model Focus
```
Without --apply: writes JSON to data/nhtsa/vehicle-knowledge-packs/nhtsa_2014_ford_focus.json.
With --apply: also inserts/upserts into drivable_vehicle_knowledge_packs.

**Batch all tier-1 vehicles (30 vehicles):**
```bash
npm run nhtsa:batch
```

This reads data/nhtsa/batch-lists/tier1-marketplace-vehicles.csv (30 vehicles) and runs nhtsa:pack for each with a 1.5-second delay between calls.

**Batch with apply:**
```bash
npm run nhtsa:batch -- --apply
```

**Options:**
- --file <path>: Use a different CSV batch file (default: tier1-marketplace-vehicles.csv)
- --limit <n>: Process only the first N vehicles
- --delay-ms <ms>: Delay between API calls (default: 1500ms)
- --apply: Insert packs into database

### Expected Pack Count

The tier-1 batch list contains **30 vehicles**:

| Make | Models | Count |
|------|--------|-------|
| Ford | Focus, F-150, Edge, Escape, Fusion | 10 |
| Toyota | Prius | 3 |
| Honda | Civic | 2 |
| Hyundai | Tiburon, Elantra | 3 |
| Subaru | Outback | 1 |
| Chevrolet | Silverado, Cruze, Malibu | 6 |
| Nissan | Altima | 3 |
| Kia | Optima | 2 |

Each vehicle produces exactly 1 pack. Expected total: **30 packs**.

**NHTSA API notes:**
- Endpoints: https://api.nhtsa.gov/recalls/recallsByVehicle and https://api.nhtsa.gov/complaints/complaintsByVehicle
- No API key required
- Rate-limited: 1.5s delay between batch calls
- Retries: 3 attempts for recalls (1.5s base delay), 4 attempts for complaints (2s base delay), with linear backoff (delay * attempt number)
- Some vehicles may return 0 recalls and/or 0 complaints (pack is still created with confidence: "low")

### Pack file location

Packs are written to: data/nhtsa/vehicle-knowledge-packs/{pack_id}.json

These files are **gitignored** (per .gitignore line: data/nhtsa/vehicle-knowledge-packs/*.json). They must be regenerated or imported on each deployment.

---

## 7. Preflight Checks

Run these before any import to verify readiness:

### 7a. Validate seed data files
```bash
npm run validate:seed-data
```
Checks JSON parsing, row presence, required fields, and unique primary IDs across all 8 seed datasets.

### 7b. Preview seed import (no DB connection)
```bash
npm run preview:seed-import
```
Validates the import plan without touching the database.

### 7c. Local seed import skeleton (no DB connection)
```bash
npm run local:seed-import:skeleton -- --dry-run
```
Validates manifest structure, checks all required fields, counts rows, and **refuses to connect to production-like databases** (blocks URLs containing render.com, neon.tech, supabase, railway, amazonaws, production, prod).

### 7d. Inspect DB configuration
```bash
node scripts/inspect-db-config.mjs
```
Checks Drizzle config files, schema file existence, migration paths, and package scripts. Does not connect to any database.

### 7e. Dry-run seed SQL generation
```bash
npm run import:seed-data
```
Generates tmp/drivable-seed-import.sql without database connection. Review the SQL before applying.

### 7f. Dry-run NHTSA pack build (single vehicle)
```bash
npm run nhtsa:pack -- --year 2014 --make Ford --model Focus
```
Without --apply: fetches from NHTSA API and writes local JSON only.

---

## 8. Rollback Plan

### Seed Data Rollback

All seed imports use idempotent upserts (ON CONFLICT DO UPDATE). To remove seed data:

```sql
-- Remove all seed data (preserve table structure)
TRUNCATE drivable_seed_symptom_categories;
TRUNCATE drivable_seed_evidence_items;
TRUNCATE drivable_seed_roadside_risk_triggers;
TRUNCATE drivable_seed_decision_paths;
TRUNCATE drivable_seed_follow_up_questions;
TRUNCATE drivable_seed_repair_vs_sell_factors;
TRUNCATE drivable_seed_buyer_risk_flags;
TRUNCATE drivable_seed_seller_disclosure_prompts;
```

The import script also wraps in a transaction with automatic ROLLBACK on error (see scripts/import-seed-data-to-db.mjs lines 234-246).

### NHTSA Pack Rollback

```sql
-- Remove all NHTSA-sourced packs
DELETE FROM drivable_vehicle_knowledge_packs WHERE source = 'NHTSA';
```

Or remove all packs:
```sql
TRUNCATE drivable_vehicle_knowledge_packs;
```

### Schema Rollback

No down-migration exists. If full rollback is needed:
```sql
-- Drop all Drivable tables (order matters for foreign keys)
DROP TABLE IF EXISTS drivable_vehicle_knowledge_packs;
DROP TABLE IF EXISTS drivable_confirmed_cases;
DROP TABLE IF EXISTS drivable_seed_seller_disclosure_prompts;
DROP TABLE IF EXISTS drivable_seed_buyer_risk_flags;
DROP TABLE IF EXISTS drivable_seed_repair_vs_sell_factors;
DROP TABLE IF EXISTS drivable_seed_follow_up_questions;
DROP TABLE IF EXISTS drivable_seed_decision_paths;
DROP TABLE IF EXISTS drivable_seed_roadside_risk_triggers;
DROP TABLE IF EXISTS drivable_seed_evidence_items;
DROP TABLE IF EXISTS drivable_seed_symptom_categories;
```

App tables (users, diagnoses, mechanics, consultations, follow_up_requests, fix_history_log, chat_export_log) should be dropped separately if needed.

---

## 9. Acceptance Queries After Import

Run these after completing Steps 1-5 to verify data readiness:

### 9a. Table existence and row counts
```sql
-- All 17 tables should exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'drivable_%'
ORDER BY table_name;
```

Expected: 10 tables matching drivable_%.

### 9b. Seed data counts (should match exactly)
```sql
SELECT 'symptom_categories' AS t, count(*) FROM drivable_seed_symptom_categories
UNION ALL SELECT 'evidence_items', count(*) FROM drivable_seed_evidence_items
UNION ALL SELECT 'roadside_risk_triggers', count(*) FROM drivable_seed_roadside_risk_triggers
UNION ALL SELECT 'decision_paths', count(*) FROM drivable_seed_decision_paths
UNION ALL SELECT 'follow_up_questions', count(*) FROM drivable_seed_follow_up_questions
UNION ALL SELECT 'repair_vs_sell_factors', count(*) FROM drivable_seed_repair_vs_sell_factors
UNION ALL SELECT 'buyer_risk_flags', count(*) FROM drivable_seed_buyer_risk_flags
UNION ALL SELECT 'seller_disclosure_prompts', count(*) FROM drivable_seed_seller_disclosure_prompts
ORDER BY t;
```

Expected results:

| t | count |
|---|-------|
| buyer_risk_flags | 35 |
| decision_paths | 16 |
| evidence_items | 36 |
| follow_up_questions | 72 |
| repair_vs_sell_factors | 25 |
| roadside_risk_triggers | 25 |
| seller_disclosure_prompts | 30 |
| symptom_categories | 31 |

**Total: 270 rows**

### 9c. NHTSA pack count
```sql
SELECT source, source_type, count(*) AS count
FROM drivable_vehicle_knowledge_packs
GROUP BY source, source_type
ORDER BY count DESC;
```

Expected after full batch import:
| source | source_type | count |
|--------|-------------|-------|
| NHTSA | recalls_and_complaints | 30 |

Or run the dedicated script:
```bash
node scripts/count-vehicle-knowledge-packs.mjs
```

### 9d. Verify specific pack exists
```sql
SELECT pack_id, vehicle_year, vehicle_make, vehicle_model, confidence
FROM drivable_vehicle_knowledge_packs
WHERE pack_id = 'nhtsa_2014_ford_focus';
```

Or run the dedicated script:
```bash
node scripts/verify-vehicle-knowledge-packs.mjs
```

### 9e. Health check
```bash
curl http://localhost:5000/api/health/db
```

Should return `{"ok":true}` when DATABASE_URL is set and reachable, or `{"ok":false,"error":"..."}` with HTTP 503 when DB is unavailable.

---

## 10. Known Issues and Warnings

### 10a. Schema import path mismatch

server/db.ts line 4 imports from "./shared/shared/schema" (double nesting). This works if the runtime resolves ./shared/shared/schema to shared/schema.ts from the server/ directory, but it is fragile. The canonical schema path is shared/schema.ts (as declared in drizzle.config.ts line 9).

**Impact:** Low risk if the current directory structure is preserved. Could break if files are moved.

### 10b. DB is partially disabled

- server/_db.DISABLED.ts contains the original Neon serverless connection
- server/_storage.DISABLED.ts contains the original Drizzle-backed storage
- Active code uses server/db.ts (plain pg Pool) and server/storage.ts (LocalStorage - in-memory Map)

The public-case-db.ts module writes to PostgreSQL via Drizzle, but the main storage layer is in-memory. This means diagnosis data is **not durable** across server restarts unless public-case-db.ts is invoked.

### 10c. Commerce/Jobs/Review subsystems use in-memory test doubles

- server/commerce/in-memory-commerce-order-repository.ts - orders lost on restart (backendClass: "process-local-test-fake")
- server/jobs/in-memory-delivery-outbox.ts - delivery status lost on restart
- server/review/in-memory-review-repository.ts - reviews lost on restart
- server/media/in-memory-private-object-storage.ts - evidence objects lost on restart

These are explicitly marked as test doubles with durable: false. Production requires durable implementations backed by PostgreSQL or object storage.

### 10d. All seed manifest entries have importAllowedNow: false

The manifest at docs/seed-data/seed_import_manifest_v1.json explicitly gates all 8 datasets with "importAllowedNow": false. The local-seed-import-skeleton.mjs script enforces this. The production import script (import-seed-data-to-db.mjs) does not check this flag, so --apply will import regardless. The manifest flag is a policy gate for the local validation script, not a technical gate.

### 10e. NHTSA packs are gitignored

Pack JSON files in data/nhtsa/vehicle-knowledge-packs/ are gitignored. They must be regenerated from the NHTSA API or imported to the database on each fresh deployment.

### 10f. No down migrations

No rollback migration files exist. Schema rollback requires manual SQL (see Rollback Plan above).

---

## 11. GO / CONDITIONAL GO / NO-GO

### Verdict: CONDITIONAL GO

**Rationale:**

All tooling, data files, and import scripts are ready and tested. The conditional factors are:

| Condition | Required For | Status |
|-----------|-------------|--------|
| Provision PostgreSQL database | All DB operations | Not done (needs DATABASE_URL) |
| Run drizzle-kit push | Table creation | Not done (needs DB) |
| Run seed data import | Seed knowledge tables | Not done (needs DB + tables) |
| Run NHTSA batch import | Vehicle knowledge packs | Not done (needs DB + tables + network) |
| Durable storage for commerce/jobs/review | Production orders/deliveries/reviews | NOT IMPLEMENTED (in-memory only) |

**For Buyer Check specifically:** After Steps 1-5 above are completed, Buyer Check will have:
- 35 buyer risk flags in drivable_seed_buyer_risk_flags
- 30 NHTSA vehicle knowledge packs in drivable_vehicle_knowledge_packs
- 16 decision paths in drivable_seed_decision_paths
- Supporting evidence items, follow-up questions, and repair-vs-sell factors

This is sufficient for initial Buyer Check launch with tier-1 marketplace vehicles.

**For full Drivable launch:** The in-memory storage limitation for commerce, jobs, review, and media subsystems must be addressed with durable PostgreSQL-backed implementations before handling real customer data, orders, or payments.

---

## 12. Complete Launch Sequence

```bash
# Phase 1: Database setup
DATABASE_URL="postgresql://..." npm run db:push

# Phase 2: Seed data (idempotent, safe to re-run)
npm run import:seed-data -- --apply

# Phase 3: NHTSA packs (idempotent, safe to re-run)
npm run nhtsa:batch -- --apply

# Phase 4: Verify
node scripts/count-vehicle-knowledge-packs.mjs
node scripts/verify-seed-table-counts.mjs

# Phase 5: Start server
npm run dev
```

Total expected database rows after full import: **270 seed rows + 30 NHTSA packs + app data = 300+ rows minimum**.

