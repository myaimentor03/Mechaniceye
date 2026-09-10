# Drivable Data Migration and Import Runbook

**Date:** 2026-09-10  
**Branch:** prep/drivable-production-data-0902  
**Worker:** OpenCode Worker 3 (DATABASE + NHTSA + PERSISTENCE RELEASE ENGINEER)  

> **IMPORTANT:** This is a read-only audit and preflight runbook. No production DB writes, no `db:push`, no `--apply`, no destructive SQL. All operations are safe to re-run and idempotent.

---

## 1. Environment Requirements

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes (for DB operations) | PostgreSQL connection string (SSL required, `rejectUnauthorized: false`) |
| `DRIVABLE_AI_MODE` | Optional | `"mock"` (default) or `"live"` |
| `OPENAI_API_KEY` | Conditional | Required only when `DRIVABLE_AI_MODE=live` |
| `PORT` | Optional | Server port (default 5000) |
| `DRIVABLE_ALLOW_SEED_IMPORT` | Optional | Set to `"1"` to override manifest gate during apply |
| `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET` | Optional | Set to `"1"` only after owner confirms remote DB target |

**DATABASE_URL** must point to a provisioned PostgreSQL database (e.g., Neon, Render Postgres). The connection uses pg Pool with SSL enabled.

> **Never** set `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1` unless the owner has deliberately confirmed this is the intended production/staging database.

---

## 2. Preflight Checks

Run these in order before any import to verify readiness.

### 2a. Validate seed data files
```bash
npm run validate:seed-data
```
Checks JSON parsing, row presence, required fields, and unique primary IDs across all 8 seed datasets.

### 2b. Preview seed import (no DB connection)
```bash
npm run preview:seed-import
```
Validates the import plan without touching the database.

### 2c. Local seed import skeleton (no DB connection)
```bash
npm run local:seed-import:skeleton -- --dry-run
```
Validates manifest structure, checks all required fields, counts rows, and **refuses to connect to production-like databases** (blocks URLs containing `render.com`, `neon.tech`, `supabase`, `railway`, `amazonaws`, `production`, `prod`).

### 2d. Inspect DB configuration
```bash
npm run inspect:db-config
```
Checks Drizzle config files, schema file existence, migration paths, and package scripts. Does not connect to any database.

### 2e. Dry-run seed SQL generation
```bash
npm run import:seed-data
```
Generates `tmp/drivable-seed-import.sql` without database connection. Review the SQL before applying.

### 2f. Dry-run NHTSA pack build (single vehicle)
```bash
npm run nhtsa:pack -- --year 2014 --make Ford --model Focus
```
Without `--apply`: fetches from NHTSA API and writes local JSON only.

### 2g. Run safe preflight
```bash
npm run preflight:safe
```
Full safety verification including:
- Seed data validation (270 rows across 8 datasets)
- Migration/schema parity (migrations match `shared/schema.ts`)
- Destructive SQL scan (no destructive statements)
- Local NHTSA pack quality (structural validation)
- NHTSA batch inventory (no duplicates or malformed rows)
- Drizzle config inspection
- Typecheck and build
- Production storage guard (no unintended in-memory fakes)

### 2h. Run acceptance probe (read-only)
```bash
npm run preflight:acceptance
```
Requires `DATABASE_URL` set. Verifies schema, seed counts, launch-control tables/triggers, and Buyer Check sample rows. Exits non-zero when the target is not ready.

---

## 3. Migration Order

Migrations are already present in `migrations/` and verified against `shared/schema.ts`:

1. `0001_drivable_launch_controls.sql` - Consent events, review versions, approvals, rejections, supersessions, case heads, triggers (append-only, revocation guard)
2. `0002_drivable_core_schema.sql` - Core app tables (users, diagnoses, fix_history_log, chat_export_log, mechanics, consultations, follow_up_requests) + seed knowledge tables + operational tables (confirmed_cases, vehicle_knowledge_packs) + indexes
3. `0003_drivable_data_integrity_hardening.sql` - FK constraints (NOT VALID, enforced on new writes only) + lookup indexes + timeline indexes
4. `0004_drivable_delivery_outbox.sql` - Optional durable delivery outbox table (NOT WIRED into runtime)

**To generate fresh migrations** (if schema changes):
```bash
npx drizzle-kit generate    # reads shared/schema.ts, writes to ./migrations/
npx drizzle-kit migrate     # runs generated migrations in order
```

> **DO NOT** run `npx drizzle-kit push` against a production database without owner confirmation.

---

## 4. Seed Data Import Order

Seed data is imported via idempotent UPSERTS (INSERT ... ON CONFLICT DO UPDATE). Safe to re-run.

### Step 1: Create seed tables (if not already created by migration)
```bash
npm run create:seed-tables
```
Runs `scripts/create-seed-tables-only.mjs` which executes raw CREATE TABLE IF NOT EXISTS statements for all 10 Drivable tables.

### Step 2: Import seed data (dry-run first)
```bash
npm run import:seed-data
```
Writes SQL preview to `tmp/drivable-seed-import.sql` without connecting to the database.

### Step 3: Import seed data (with --apply, requires confirmed target)
```bash
npm run import:seed-data -- --apply
```
This runs `scripts/import-seed-data-to-db.mjs --apply` which:
1. Reads all 8 JSON files from `docs/seed-data/json/`
2. Generates UPSERT SQL (INSERT ... ON CONFLICT DO UPDATE)
3. Wraps in a transaction (BEGIN / COMMIT / ROLLBACK on error)
4. Imports 270 rows across 8 tables
5. Enforces manifest gate: each dataset must have `importAllowedNow: true` in `docs/seed-data/seed_import_manifest_v1.json`, OR `DRIVABLE_ALLOW_SEED_IMPORT=1` must be set

**Expected row counts after import:**
| Table | Expected Rows |
|---|---|
| drivable_seed_symptom_categories | 31 |
| drivable_seed_evidence_items | 36 |
| drivable_seed_roadside_risk_triggers | 25 |
| drivable_seed_decision_paths | 16 |
| drivable_seed_follow_up_questions | 72 |
| drivable_seed_repair_vs_sell_factors | 25 |
| drivable_seed_buyer_risk_flags | 35 |
| drivable_seed_seller_disclosure_prompts | 30 |
| **Total** | **270** |

---

## 5. NHTSA Import Order

### Step 1: Build single vehicle pack (dry-run)
```bash
npm run nhtsa:pack -- --year 2014 --make Ford --model Focus
```
Without `--apply`: writes JSON to `data/nhtsa/vehicle-knowledge-packs/nhtsa_2014_ford_focus.json`.

### Step 2: Build single vehicle pack (with --apply, requires DATABASE_URL)
```bash
npm run nhtsa:pack -- --year 2014 --make Ford --model Focus --apply
```
Inserts/upserts pack into `drivable_vehicle_knowledge_packs` table.

### Step 3: Build batch of all tier-1 vehicles (dry-run)
```bash
npm run nhtsa:batch
```
Reads `data/nhtsa/batch-lists/tier1-marketplace-vehicles.csv` (30 vehicles) and runs `nhtsa:pack` for each with a 1.5-second delay between calls.

### Step 4: Build batch with local pack writes (no DB)
```bash
npm run nhtsa:batch
```
Without `--apply`: writes 30 JSON pack files to `data/nhtsa/vehicle-knowledge-packs/`. These are **gitignored** and must be regenerated/imported on each deployment.

### Step 5: Build batch with DB insert (requires DATABASE_URL and owner confirmation)
```bash
npm run nhtsa:batch -- --apply
```
Runs `npx spawn_sync` for each of the 30 vehicles with `--apply`. Inserts/upserts all 30 packs into `drivable_vehicle_knowledge_packs`.

**Expected pack count after full import:** 30 packs (one per tier-1 vehicle).

**Pack file location:** `data/nhtsa/vehicle-knowledge-packs/{pack_id}.json` - **gitignored**, must be regenerated on each deployment.

**Verification after import:**
```bash
node scripts/count-vehicle-knowledge-packs.mjs
node scripts/verify-vehicle-knowledge-packs.mjs
node scripts/verify-seed-table-counts.mjs
```

---

## 6. Read-Only Verification (After Import)

Run these after completing Steps 1-5 to verify data readiness.

### 6a. Table existence and row counts
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'drivable_%'
ORDER BY table_name;
```
Expected: 10 tables matching `drivable_%`.

### 6b. Seed data counts (should match exactly)
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
Expected:
| t | count |
|---|---|
| buyer_risk_flags | 35 |
| decision_paths | 16 |
| evidence_items | 36 |
| follow_up_questions | 72 |
| repair_vs_sell_factors | 25 |
| roadside_risk_triggers | 25 |
| seller_disclosure_prompts | 30 |
| symptom_categories | 31 |
| **Total: 270** |

### 6c. NHTSA pack count
```sql
SELECT source, source_type, count(*) AS count
FROM drivable_vehicle_knowledge_packs
GROUP BY source, source_type
ORDER BY count DESC;
```
Expected: `NHTSA | recalls_and_complaints | 30`

Or run:
```bash
node scripts/count-vehicle-knowledge-packs.mjs
```

### 6d. Verify specific pack exists
```sql
SELECT pack_id, vehicle_year, vehicle_make, vehicle_model, confidence
FROM drivable_vehicle_knowledge_packs
WHERE pack_id = 'nhtsa_2014_ford_focus';
```
Or run:
```bash
node scripts/verify-vehicle-knowledge-packs.mjs
```

### 6e. Health check
```bash
curl http://localhost:5000/api/health/db
```
Should return `{"ok":true}` when DATABASE_URL is set and reachable, or `{"ok":false,"error":"..."}` with HTTP 503 when DB is unavailable.

---

## 7. Rollback / Backup Expectations

### Seed Data Rollback
All seed imports use idempotent upserts (ON CONFLICT DO UPDATE). To remove seed data:
```sql
TRUNCATE drivable_seed_symptom_categories;
TRUNCATE drivable_seed_evidence_items;
TRUNCATE drivable_seed_roadside_risk_triggers;
TRUNCATE drivable_seed_decision_paths;
TRUNCATE drivable_seed_follow_up_questions;
TRUNCATE drivable_seed_repair_vs_sell_factors;
TRUNCATE drivable_seed_buyer_risk_flags;
TRUNCATE drivable_seed_seller_disclosure_prompts;
```

### NHTSA Pack Rollback
```sql
-- Remove all NHTSA-sourced packs
DELETE FROM drivable_vehicle_knowledge_packs WHERE source = 'NHTSA';

-- Or remove all packs
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

-- App tables (drop separately if needed)
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS diagnoses;
DROP TABLE IF EXISTS fix_history_log;
DROP TABLE IF EXISTS chat_export_log;
DROP TABLE IF EXISTS mechanics;
DROP TABLE IF EXISTS consultations;
DROP TABLE IF EXISTS follow_up_requests;
```

---

## 8. Warnings and Known Issues

| Issue | Impact | Mitigation |
|---|---|---|
| 10a. Schema import path mismatch | `server/db.ts` line 4 imports from `./shared/shared/schema` (double nesting). Canonical path is `shared/schema.ts`. | Low risk if current directory structure is preserved. |
| 10b. DB is partially disabled | `server/_db.DISABLED.ts` contains original Neon serverless connection. Active code uses `server/db.ts` (plain pg Pool) + `server/storage.ts` (LocalStorage - in-memory Map). | Diagnosis data is **not durable** across server restarts unless `public-case-db.ts` is invoked. |
| 10c. Commerce/Jobs/Review subsystems use in-memory test doubles | `server/commerce/in-memory-commerce-order-repository.ts`, `server/jobs/in-memory-delivery-outbox.ts`, `server/review/in-memory-review-repository.ts`, `server/media/in-memory-private-object-storage.ts` - explicitly marked as test doubles with `durable: false`. | Production requires durable implementations backed by PostgreSQL or object storage. |
| 10d. All seed manifest entries have `importAllowedNow: false` | The manifest explicitly gates all 8 datasets with `importAllowedNow: false`. The import script enforces this for local validation, but `--apply` does not check this flag (requires `DRIVABLE_ALLOW_SEED_IMPORT=1`). | Policy gate for local validation, not a technical gate. |
| 10e. NHTSA packs are gitignored | Pack JSON files in `data/nhtsa/vehicle-knowledge-packs/` are gitignored. Must be regenerated from NHTSA API or imported to database on each fresh deployment. | Regenerate or import on each deployment. |
| 10f. No down migrations | No rollback migration files exist. Schema rollback requires manual SQL. | Manual rollback SQL available in runbook. |

---

## 9. Owner Approvals

The following require explicit owner confirmation before executing mutating commands:

| Command | Required Gate |
|---|---|
| `npm run import:seed-data -- --apply` | `DRIVABLE_ALLOW_SEED_IMPORT=1` OR each manifest dataset has `importAllowedNow: true` |
| `npm run nhtsa:batch -- --apply` | `DATABASE_URL` set and confirmed target (no production-like hosts without `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1`) |
| `npm run db:push` | `DATABASE_URL` set and confirmed target |
| Any mutation against a non-local host | `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1` set after owner confirmation |

---

## 10. Commands Never to Run Blindly

**NEVER run these commands without reviewing the implications:**

| Command | Reason |
|---|---|
| `npm run db:push` | Drops and recreates all DB tables - data loss risk |
| `npm run import:seed-data -- --apply` | Imports seed data into DB - requires confirmed target and manifest gate |
| `npm run nhtsa:batch -- --apply` | Calls NHTSA API for 30 vehicles, inserts into DB - requires confirmed target |
| `npx drizzle-kit push` | Applies schema directly - irreversible without manual rollback |
| `npx drizzle-kit migrate run` | Runs all pending migrations - verify order first |
| `TRUNCATE drivable_vehicle_knowledge_packs` | Permanently deletes all NHTSA packs |
| `TRUNCATE drivable_seed_*` | Permanently deletes all seed data (use WITH IDENTITY INSERT if needed) |
| Any command with `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1` without owner confirmation | Mutates production database without safety gate |

---

## 11. Complete Launch Sequence (Phase 1-5)

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

**Total expected database rows after full import:** 270 seed rows + 30 NHTSA packs + app data = 300+ rows minimum.

---

## 12. Mobile Multimodal Evidence Pipeline (P0 Beta)

The P0 beta requires real phone sensor capture (vibration/audio/photo/video) linked to diagnosis cases. Key components:

### Evidence Intake Flow
1. **Phone captures**: vibration sensor, microphone, camera
2. **Upload middleware**: `diagnosisPhotoUploadMiddleware` (photos), `diagnosisAudioVideoUploadMiddleware` (audio/video)
3. **Evidence persistence**: `evidenceStore.savePhotos()` / `evidenceStore.saveAudioVideo()`
4. **Case persistence**: `insertPublicDiagnosisCaseToDb()` with `inputTypes` tracking
5. **Analysis handoff**: `performEnhancedAnalysis()` receives sensor data

### Evidence Status Fields (in diagnoses table)
- `photoFileNames`, `audioFileNames`, `videoFileNames`, `vibrationFileNames`
- `photoEvidenceStatus`, `audioEvidenceStatus`, `videoEvidenceStatus`, `vibrationEvidenceStatus`
- `inputTypes`: array of string types actually analyzed (e.g., `["written", "photo", "vibration"]`)

### Degraded Behavior (truthful)
- If device cannot provide a sensor/evidence type: `say so clearly`
- Never substitute fake sensor values
- Never present human-review-only media as AI-analyzed evidence
- `analysisStatus: "uploaded_not_analyzed"` when evidence uploaded but not yet analyzed

### Permission Handling
- Permission denial: gracefully degrade, omit missing evidence types
- Unsupported sensor: record `unsupportedVehicle: true` and `manualVehicleEntryUsed: true`
- Upload failure: return 507, delete partial case, persist clear error message

### Analysis Integration
```typescript
// enhanced-analysis.ts already uses sensorData.vibration, sensorData.audio, sensorData.video
// routes.ts follow-up endpoint passes sensorData to performEnhancedAnalysis()
// inputTypes in diagnoses tracks what was actually analyzed
```

---

## Appendix: Script Summary

| Script | Purpose |
|---|---|
| `npm run validate:seed-data` | Validate seed data files |
| `npm run preview:seed-import` | Preview seed import plan |
| `npm run local:seed-import:skeleton -- --dry-run` | Local seed import skeleton (dry-run) |
| `npm run inspect:db-config` | Inspect DB configuration |
| `npm run import:seed-data` | Dry-run seed SQL generation |
| `npm run nhtsa:pack` | Build single NHTSA vehicle knowledge pack |
| `npm run nhtsa:batch` | Build NHTSA batch of vehicle knowledge packs |
| `npm run preflight:safe` | Full safety verification |
| `npm run preflight:acceptance` | Read-only acceptance probe (needs DATABASE_URL) |
| `npm run verify:migration-parity` | Verify migrations match shared/schema.ts |
| `npm run verify:packs-quality` | Validate local NHTSA pack structure |
| `npm run verify:packs-count` | Count vehicle knowledge packs in DB |
| `npm run verify:packs-sample` | Verify specific pack exists in DB |
| `npm run verify:seed-counts` | Verify seed table row counts in DB |
| `npm run check` | TypeScript type check |
| `npm run build` | Production build (vite + esbuild) |