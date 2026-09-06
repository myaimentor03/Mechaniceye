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
| Migrations | `migrations/0001_drivable_launch_controls.sql`, `0002_drivable_core_schema.sql`, `0003_drivable_data_integrity_hardening.sql`, `0004_drivable_delivery_outbox.sql` | **Not applied** in this worktree. Addressed during prod setup. |
| Schema sync | `server/shared/shared/schema.ts` now byte-identical to `shared/schema.ts`; `server/shared/shared/schema.js` regenerated (17 tables, 18 insert schemas) | In-tree, typechecked, tests green. |
| Safety helper | `scripts/lib/db-target-safe.mjs` | Used by all connect scripts. |
| Scripts | `import-seed-data-to-db.mjs`, `create-seed-tables-only.mjs`, `verify-seed-table-counts.mjs`, `count-vehicle-knowledge-packs.mjs`, `verify-vehicle-knowledge-packs.mjs`, `create-missing-tier2-nhtsa-batch.cjs`, `inventory-nhtsa-batch-lists.mjs`, `acceptance-buyer-data-readiness.mjs` | Preflight/import/verification. Refuse remote targets without the gate. |
| Seed data | `docs/seed-data/` (8 datasets, 270 rows) | Validated; imported only via `--apply`. |
| NHTSA packs | `data/nhtsa/vehicle-knowledge-packs/*.json` (230 packs) | **Gitignored**, generated locally, never applied without `--apply`. |

---

## 1.1 Environment requirements

| Variable | Required | Purpose | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | YES (apply steps) | PostgreSQL connection string for the reviewed target | Never echoed by any script; always shown redacted as `safeTargetDescription(...)`. |
| `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET` | YES (non-local target) | Set to `1` to allow any mutating script against a remote/hosted DB | Required for `render.com`, `neon.tech`, `supabase`, `railway`, `amazonaws`, `fly.io`, `azure`, `herokuapp`, `vercel.com` and any non-localhost host. |
| `DRIVABLE_ALLOW_SEED_IMPORT` | Conditional | Set to `1` to import seed data while `seed_import_manifest_v1.json` still carries `importAllowedNow: false` | The manifest deliberately keeps every dataset blocked for launch; this is the explicit override. |
| `DRIVABLE_LAUNCH_CONTROLS_ENABLED` | Optional | `true` to require the consent/review runtime (Postgres tables + triggers verified at startup) | Server runtime, not an import step. |
| `DRIVABLE_PHOTO_UPLOAD_ENABLED` | Conditional | Must be `"true"` AND evidence backend `private_object_storage` before photo uploads are accepted | Server runtime; without it the intake returns 409 for photos. |
| `DRIVABLE_EVIDENCE_S3_BUCKET` / `DRIVABLE_EVIDENCE_S3_REGION` | Conditional | Select the S3-compatible evidence store (`private_object_storage`) | Without these, evidence falls back to `runtime_local`. |
| `PORT` | Optional | Server port (default 5000) | Server runtime. |

Environment requirements table for the migration/import sequence only involves `DATABASE_URL` plus the two `DRIVABLE_CONFIRM_*` / `DRIVABLE_ALLOW_*` gates. The server runtime variables are listed so operators understand which features they are enabling.

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
node scripts/verify-production-storage-guards.mjs # static: no in-memory fake reachable from production
node scripts/acceptance-buyer-data-readiness.mjs  # no-target dry run (exits 2), never connects
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

### 3.4 `0004_drivable_delivery_outbox.sql` — optional, deferred

Creates `drivable_delivery_outbox` (idempotent) for a future durable delivery
outbox. **No runtime code reads or writes it yet** (current deliveries are
direct fire-and-forget webhook fetches, §7). Apply it only when a durable
outbox implementation is wired in; the acceptance script treats it as an
optional/informational table.

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

### 5.4 Exact tier-1 distribution (source of truth)

Actual `tier1-marketplace-vehicles.csv` (30 rows, verified against the batch
list, **not** the audit's prose table):

| Make | Models | Rows | Packs |
| --- | --- | --- | --- |
| Ford | Focus(4), F-150(1), Edge(1), Escape(1), Fusion(2) | 9 | 9 |
| Chevrolet | Silverado(2), Cruze(3), Malibu(2) | 7 | 7 |
| Nissan | Altima(3) | 3 | 3 |
| Hyundai | Tiburon(1), Elantra(2) | 3 | 3 |
| Toyota | Prius(3) | 3 | 3 |
| Kia | Optima(2) | 2 | 2 |
| Honda | Civic(2) | 2 | 2 |
| Subaru | Outback(1) | 1 | 1 |
| **Total** | | **30** | **30** |

The audit memo's "Ford 10 / Chevrolet 6" prose was inaccurate (archived source
audit: `docs/beta/DRIVABLE_PRODUCTION_DATA_READINESS_0902.md`); the CSV rows
are authoritative (30 total either way). Tier-2 covers 215, tier-2-missing 21,
grand-cherokee-repair 7; the cross-file distinct set is 230 packs.

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
  sample;
- optional `drivable_delivery_outbox` reported as INFO (present or absent —
  never a failure, it is not wired yet).

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

- **Diagnoses are durable in Postgres; the in-memory read model is a bridge.**
  `GET /api/diagnoses/:id` / `/api/diagnoses/recent` / `/api/diagnoses` first
  consult the in-memory `LocalStorage` maps in `server/storage.ts` and, on a
  miss, fall back to the Postgres `diagnoses` table (best-effort, fails open to
  in-memory only when `DATABASE_URL` is absent). Public-case rows written by
  `insertPublicDiagnosisCaseToDb` are therefore visible to the reviewer routes
  across restarts. The in-memory maps are still process-local for review
  state, consultations, and follow-up-created diagnosis records.
- **DB failure is never reported as success.** The launch-controlled public
  path returns 503 with `persisted:false` when the `diagnoses` insert fails
  and deletes persisted photo evidence. The Windows-only local-case-store
  fallback now returns **202 Accepted** with `persisted:false`,
  `databaseMirror:"unavailable"`, an explicit message, and **no webhooks** when
  the database mirror write fails (webhooks previously fired regardless and a
  200 was returned). `insertPublicDiagnosisCaseToDb` returns `{ok:false}`
  (never throws to the caller) on a database failure and redacts credentials
  from the surfaced error.
- **Consent precedes the case row (audit trail).** In the launch-controlled
  path the consent event is appended before the `diagnoses` insert. If the
  insert then fails, the consent event intentionally remains as an intake
  attempt record; retries create their own events. This is recorded rather
  than auto-revoked to preserve the audit trail.
- **Launch readiness gates on durable evidence.** `server/launch-readiness.ts`
  only reports ready when `evidenceStore.durability ===
  'private_object_storage'`, and `server/review/postgres-adapter.ts`'s
  `verifyLaunchControlSchema` requires the 6 tables + 6 triggers to exist.
- **Delivery outbox is provisioned, not wired.** `migrations/0004_drivable_delivery_outbox.sql`
  creates `drivable_delivery_outbox` (idempotent, optional) but no runtime code
  reads or writes it yet. Current webhook/diagnosis deliveries are direct,
  fire-and-forget `fetch` calls with `console.error` only. The static
  production-storage guard
  (`node scripts/verify-production-storage-guards.mjs`) proves no production
  module imports an in-memory test double, and the contract-level guards
  (`assertDurableDeliveryOutbox`, `assertDurableScalablePrivateStorage`,
  `assertDurableReviewRepository`) are enforced by the contract tests.
- **Schema drift fixed.** The runtime schema copy
  (`server/shared/shared/schema.ts`) is now byte-identical to the canonical
  `shared/schema.ts`, and `server/shared/shared/schema.js` was regenerated so
  the 10 Drivable tables are present in the compiled artifact. There are no
  foreign keys declared in the schema; `0003` adds them as optional hardening.

---

## 8. Rollback / non-goals / owner approvals

- No destructive SQL exists in this branch. To undo an applied migration, use
  standard Postgres `DROP` of the specific tables/indexes — none of this
  branch auto-drops anything.
- `db:push` (Drizzle) is **not** part of the safe path; prefer the checked-in
  `0001`/`0002`/`0003`/`0004` SQL so changes are reviewable and versioned.
- Nothing here commits secrets, echoes `DATABASE_URL`, or stores credentials.

### 8.1 Backup expectations before any apply step

- Take a full logical snapshot of the target **before** running any migration
  or `--apply` import, and record its restore procedure in your run notes:
  `pg_dump "$DATABASE_URL" --no-owner --no-privileges > backup_$(date +%Y%m%d_%H%M%S).sql`
  (or the managed provider's snapshot tool). Verify the dump is non-empty and
  restorable to a scratch database before touching the target.
- Verify the target is the reviewed, named database: run
  `node scripts/acceptance-buyer-data-readiness.mjs` first (read-only; exits 2
  with no target, 1 on any failed check) and `node scripts/inspect-db-config.mjs`
  (never connects). Never trust a `DATABASE_URL` you did not paste yourself
  from the provisioning console.
- All imports are idempotent upserts (`ON CONFLICT ... DO UPDATE` / `DO NOTHING`),
  so a failed or partial apply can be re-run safely after the underlying cause
  is fixed. Rollback of applied seed rows is `TRUNCATE` of the 8
  `drivable_seed_*` tables; NHTSA packs roll back with
  `DELETE FROM drivable_vehicle_knowledge_packs WHERE source = 'NHTSA'`.
- No down-migrations exist. Schema rollback is manual `DROP TABLE` (see the
  archived source audit `docs/beta/DRIVABLE_PRODUCTION_DATA_READINESS_0902.md`
  §8 for the safe drop order).

### 8.2 Owner approvals required before applying

Record explicit owner sign-off (name + date) next to each item before running
the corresponding step:

1. Provisioned PostgreSQL target identified and `DATABASE_URL` pasted from the
   provisioning console (never from chat logs) — **approves §3.1.**
2. Review of `migrations/0003_drivable_data_integrity_hardening.sql`
   (`NOT VALID` FK assumptions: all writes carry a real registered `users.id`);
   **approves §3.2** (optional hardening).
3. Review of the seed manifest
   `docs/seed-data/seed_import_manifest_v1.json` and decision to flip the 8
   datasets to `importAllowedNow: true` **or** set
   `DRIVABLE_ALLOW_SEED_IMPORT=1` — **approves §4.**
4. NHTSA `--apply` target confirmation (packs are regenerable from the public
   NHTSA API; applying them to the wrong DB is harmless but noisy) — **approves §5.3.**
5. `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1` for every non-localhost host —
   required by every mutating script; never export it globally.

### 8.3 Commands never to run blindly

- `npm run db:push` — Drizzle schema diffing against a live target; guarded by
  `scripts/db-push-guarded.mjs`, which requires an explicit authenticated
  target confirmation and prints the redacted target first. Read the guard's
  output before re-running with `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1`.
- `npm run import:seed-data -- --apply` — refuses to run while any manifest
  dataset is `importAllowedNow: false` unless `DRIVABLE_ALLOW_SEED_IMPORT=1`.
- `npm run nhtsa:batch -- --apply` / `npm run nhtsa:pack -- ... --apply` —
  writes `drivable_vehicle_knowledge_packs`; requires the authenticated-target
  gate.
- `npm run create:seed-tables` — raw `CREATE TABLE IF NOT EXISTS`; safe to
  re-run but only intended for fresh targets (see §4).
- `node scripts/create-missing-tier2-nhtsa-batch.cjs` — writes a CSV from a
  read-only DB probe; it requires and connects to `DATABASE_URL`. Confirm the
  target first.
- Any `psql "$DATABASE_URL" -f migrations/...` invoke is a schema-changing
  migration; run with `ON_ERROR_STOP=1` and a fresh backup per §8.1.
- Nothing in this branch should ever be pointed at a database whose contents
  you cannot afford to lose. Prefer a fresh staging database for the first
  migration + import rehearsal.