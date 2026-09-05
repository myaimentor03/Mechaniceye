# Drivable Data Migration & Import Runbook (beta / 0902)

Owner-only operational guide for taking the Drivable production data
(schema, seed knowledge, NHTSA vehicle-knowledge packs) from this branch to a
reviewed staging/production PostgreSQL target.

> **Safety contract.** Nothing in this branch connects to, mutates, or
> creates tables on any database on its own. No `npm run db:push`, no NHTSA
> `--apply`, no migration application, and no destructive SQL are performed by
> CI or by any preflight here. A human (the owner) must run the apply steps
> below against an explicitly confirmed target. All mutating scripts refuse a
> non-local `DATABASE_URL` unless `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1` is
> set, and `DATABASE_URL` is never echoed.

---

## 1. Scope of the branch

`prep/drivable-production-data-0902` (worktree: `data/`). Everything it adds
is safe by construction:

| Area | Artifacts | Applied/live? |
| --- | --- | --- |
| Migrations | `migrations/0001_drivable_launch_controls.sql`, `0002_drivable_core_schema.sql`, `0003_drivable_data_integrity_hardening.sql` | **Not applied** in this worktree. Addressed during prod setup. |
| Schema sync | `server/shared/shared/schema.ts` now byte-identical to `shared/schema.ts`; `server/shared/shared/schema.js` regenerated (17 tables, 18 insert schemas) | In-tree, typechecked, tests green. |
| Safety helper | `scripts/lib/db-target-safe.mjs` | Used by all connect scripts. |
| Scripts | `import-seed-data-to-db.mjs`, `create-seed-tables-only.mjs`, `verify-seed-table-counts.mjs`, `count-vehicle-knowledge-packs.mjs`, `verify-vehicle-knowledge-packs.mjs`, `create-missing-tier2-nhtsa-batch.cjs`, `inventory-nhtsa-batch-lists.mjs`, `acceptance-buyer-data-readiness.mjs` | Preflight/import/verification. Refuse remote targets without the gate. |
| Seed data | `docs/seed-data/` (8 datasets, 270 rows) | Validated; imported only via `--apply`. |
| NHTSA packs | `data/nhtsa/vehicle-knowledge-packs/*.json` (230 packs) | **Gitignored**, generated locally, never applied without `--apply`. |

---

## 2. Preflight (no database needed)

Run from the worktree root:

```bash
npm run preflight:safe           # runs the whole battery below in one shot (no DB, no mutations)
```

Or the individual stages:

```bash
npm run validate:seed-data          # 8 datasets, 270 rows, unique PKs, required fields
npm run inspect:db-config           # confirm both drizzle configs resolve schema + out dir
npm run verify:migration-parity     # static: migrations match shared/schema.ts (no DB, no network)
node scripts/inventory-nhtsa-batch-lists.mjs   # read-only: 230 distinct vehicles, no dupes/malformed
npm run import:seed-data            # seed-import dry run (SQL preview only, exit 0)
npm run check                       # typecheck
npm run build                       # production build
```

Expected:
- `validation passed: 8 datasets and 270 rows`
- inventory: 4 CSVs, clean, `230` distinct vehicles, `0` duplicate/malformed.
- `npm run check` and `npm run build` both succeed.

Dry-run the seed import without a DB (writes only `tmp/drivable-seed-import.sql`):

```bash
npm run import:seed-data                     # dry run, exit 0, 270 upserts previewed
npm run import:seed-data -- --dry-run        # same, explicit
```

The dry run never connects; it prints the intended target (redacted) and the
SQL preview path. `tmp/` is gitignored.

---

## 3. Schema migrations (owner applies manually)

Migrations are plain, reviewable SQL in `migrations/`. They are **never run
by this branch**. The table order below assumes `0002` (core schema) then
`0003` (optional hardening); `0001` (launch controls) is the existing baseline
that created the consent/review tables.

### 3.1 `0002_drivable_core_schema.sql` — required

Idempotent (`CREATE ... IF NOT EXISTS`), mirrors `shared/schema.ts`
column-for-column for the 7 app tables + 10 Drivable tables, no FKs, with the
same named indexes the schema declares (`mechanics_rating_idx`,
`mechanics_active_idx`, `consultations_mechanic_idx`, `consultations_user_idx`,
`consultations_status_idx`, `follow_up_diagnosis_idx`,
`seed_follow_up_symptom_idx`, `confirmed_cases_vehicle_idx`,
`knowledge_packs_vehicle_idx`). Requires PostgreSQL 13+ (`gen_random_uuid()`
default).

Apply, e.g.:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0002_drivable_core_schema.sql
```

Verification (read-only):

```bash
DATABASE_URL=... node scripts/verify-seed-table-counts.mjs   # counts reflect pre-import: needs seed import first; see §4/§6
```

### 3.2 `0003_drivable_data_integrity_hardening.sql` — optional, review first

Adds `NOT VALID` foreign keys (enforce on new writes only, never rescan
existing rows) plus a lowercase Buyer Check lookup index and timeline indexes.

- FKs presume the runtime always writes real `users.id` for `diagnoses` /
  consultations / follow-up requests. Today this holds: `server/routes.ts`
  only persists public cases through `insertPublicDiagnosisCaseToDb(...)` with
  the result of `authenticatedCaseOwnerId(req.drivableCustomer?.id)`, which
  **throws** when no authenticated customer is present, so no anonymous rows
  are ever inserted. Re-verify before applying if new insert paths appear.
- The `drivable_seed_follow_up_questions.symptom_category_id` FK requires
  symptom categories to import before follow-up questions. The seed manifest
  (`docs/seed-data/seed_import_manifest_v1.json`) already orders it this way
  (priority 1) and all 72 questions reference an existing category.
- Objectives: fix history / consultations / follow-up rows keyed to users,
  plus a lowercased `(vehicle_year, lower(vehicle_make), lower(vehicle_model))`
  index that the Buyer Check query in `server/routes.ts` can actually use.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0003_drivable_data_integrity_hardening.sql
```

### 3.3 `0001_drivable_launch_controls.sql` — existing baseline

Already in the repo (from base `8eba023`). Creates the consent/review tables +
append-only/transition guards. It is the schema that
`server/launch-readiness.ts` and `server/review/postgres-adapter.ts`
(`REQUIRED_TABLES` / `REQUIRED_TRIGGERS`) verify at startup.

---

## 4. Seed data import

Seeds are staged, never written at runtime. To apply to the confirmed target:

```bash
# 1) Create tables (0002 applied in §3.1, or use this helper on a fresh target)
npm run create:seed-tables

# 2) Apply the 270 seed upserts (idempotent; safe to re-run)
DATABASE_URL=... npm run import:seed-data -- --apply
```

Both mutating scripts:
- print the redacted intended target first;
- refuse a `neon.tech` / `render` / `supabase` / AWS / other production-marker
  host **and** any non-local host unless
  `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1` is explicitly set;
- exit non-zero and touch nothing otherwise.

Expected post-import row counts (see
`docs/seed-data/seed_import_manifest_v1.json`):

| Table | Rows |
| --- | --- |
| `drivable_seed_symptom_categories` | 31 |
| `drivable_seed_evidence_items` | 36 |
| `drivable_seed_roadside_risk_triggers` | 25 |
| `drivable_seed_decision_paths` | 16 |
| `drivable_seed_follow_up_questions` | 72 |
| `drivable_seed_repair_vs_sell_factors` | 25 |
| `drivable_seed_buyer_risk_flags` | 35 |
| `drivable_seed_seller_disclosure_prompts` | 30 |
| **Total** | **270** |

Import order follows `importPriority` (symptom_categories first, so category →
follow-up FK from `0003` holds).

---

## 5. NHTSA vehicle-knowledge packs

### 5.1 Inventory (already covered in §2)

`node scripts/inventory-nhtsa-batch-lists.mjs` reports per-file rows, unique
vehicles, duplicates, malformed rows, expected pack count, and how many packs
already exist in the gitignored `data/nhtsa/vehicle-knowledge-packs/`.

### 5.2 Generate (local, no `--apply`)

The `nhtsa:batch` script fetches NHTSA APIs and writes JSON pack files to
`data/nhtsa/vehicle-knowledge-packs/` (gitignored). It **never inserts into a
database** unless `--apply` is given.

```bash
npm run nhtsa:batch                       # the 'tier1-marketplace-vehicles.csv' default batch
npm run nhtsa:batch -- --file data/nhtsa/batch-lists/tier2-common-used-vehicles.csv
npm run nhtsa:pack -- --year 2014 --make Ford --model Focus   # single pack, dry
```

This branch already generated all 230 distinct vehicles across the 4 batch
lists (tier1 = 30, tier2-common = 215, tier2-missing = 21, grand-cherokee = 7;
the distinct overlap is 230). Pack id format:
`nhtsa_<year>_<make>_<model>` (lowercased, non-alphanumerics → `_`).

### 5.3 Apply (owner only)

```bash
DATABASE_URL=... npm run nhtsa:batch -- --apply            # inserts/updates drivable_vehicle_knowledge_packs
DATABASE_URL=... npm run nhtsa:pack -- --year 2014 --make Ford --model Focus --apply
```

Same remote-target gate applies. After apply, sanity-check with the Buyer
Check example:
`DATABASE_URL=... node scripts/count-vehicle-knowledge-packs.mjs` and
`node scripts/verify-vehicle-knowledge-packs.mjs`, or the full acceptance
probe in §6.

---

## 6. Acceptance verification (read-only)

`scripts/acceptance-buyer-data-readiness.mjs` is a pure live-audit probe. It
performs only `SELECT` health/table/count/sample checks and never writes.

```bash
DATABASE_URL=... node scripts/acceptance-buyer-data-readiness.mjs                            # expect packs >= 30
DATABASE_URL=... node scripts/acceptance-buyer-data-readiness.mjs --strict-packs=230
```

Checks (each exits non-zero on failure):
- table existence for all 17 core tables and the 6 launch-control tables;
- presence of the 6 launch-control triggers;
- exact seed counts (31/36/25/16/72/25/35/30 = 270 total);
- vehicle-knowledge-pack count (`--strict-packs` floor, default 30);
- Buyer Check sample: the 2014 Ford Focus pack exists;
- `drivable_seed_buyer_risk_flags` risk-level distribution and a high/critical
  sample.

With no `DATABASE_URL`, it prints the (redacted) "no target" line and exits 2
— it never connects, mutates, or hangs.

Also available (read-only):
- `DATABASE_URL=... node scripts/verify-seed-table-counts.mjs` — seed row counts, all 8 tables + 270 total, exit 1 on mismatch.
- `DATABASE_URL=... node scripts/count-vehicle-knowledge-packs.mjs` — total packs.
- `DATABASE_URL=... node scripts/verify-vehicle-knowledge-packs.mjs` — pack presence required for coverage.
- `DATABASE_URL=... node scripts/create-missing-tier2-nhtsa-batch.cjs` — regenerates a missing-coverage CSV for tier2 (reads DB only; never prompts, never writes).

---

## 7. Runtime & persistence truth (important caveats)

Documented so operators set expectations correctly, not to hide anything:

- **Diagnoses are durable in Postgres; the rich in-memory read model is not.**
  `GET /api/diagnoses/:id` reads `LocalStorage` maps in
  `server/storage.ts`, which are in-memory and lost on restart. Only the
  launch-controlled public-case insert (`insertPublicDiagnosisCaseToDb`) writes
  `diagnoses` rows to Postgres, idempotently (`ON CONFLICT ... DO NOTHING` →
  `alread_exists`), and it returns `ok:false` (never throws to the caller) on a
  database failure, redacting any credentials from the surfaced error.
- **Launch readiness gates on durable evidence.** `server/launch-readiness.ts`
  only reports ready when `evidenceStore.durability ===
  'private_object_storage'`, and `server/review/postgres-adapter.ts`'s
  `verifyLaunchControlSchema` requires the 6 tables + 6 triggers to exist.
- **Webhook/delivery fire-and-miss risk.** Public-case notification and
  diagnosis webhook deliveries are fire-and-forget with `console.error` only;
  there is no durable outbox table. Out-of-band retry/durability is out of
  scope for this data-readiness change.
- **Schema drift fixed.** The runtime schema copy
  (`server/shared/shared/schema.ts`) is now byte-identical to the canonical
  `shared/schema.ts`, and `server/shared/shared/schema.js` was regenerated so
  the 10 Drivable tables are present in the compiled artifact. There are no
  foreign keys declared in the schema; `0003` adds them as optional hardening.

---

## 8. Rollback / non-goals

- No destructive SQL exists in this branch. To undo an applied migration, use
  standard Postgres `DROP` of the specific tables/indexes — none of this
  branch auto-drops anything.
- `db:push` (Drizzle) is **not** part of the safe path; prefer the checked-in
  `0001`/`0002`/`0003` SQL so changes are reviewable and versioned.
- Nothing here commits secrets, echoes `DATABASE_URL`, or stores credentials.