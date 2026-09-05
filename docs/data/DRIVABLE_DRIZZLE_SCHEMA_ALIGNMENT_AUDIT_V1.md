# Drivable Drizzle Schema Alignment Audit V1

> **Resolution notes (branch `prep/drivable-production-data-0902`, 2026-09-05).**
> The findings below reflect the audit date (June 12, 2026). Each has since been
> acted on in the 0902 data-readiness work without touching production:
>
> - `shared/schema.ts` is now the authoritative canonical schema (415 lines, 17
>   tables) and the runtime copy `server/shared/shared/schema.ts` is now
>   byte-identical to it; `server/shared/shared/schema.js` was regenerated and
>   now exports all 17 tables + 18 insert schemas.
> - A tracked migration baseline now exists: `migrations/0001_...launch_controls`
>   (consent/review), `migrations/0002_drivable_core_schema.sql` (all 17 core
>   tables, idempotent), and `migrations/0003_drivable_data_integrity_hardening.sql`
>   (optional `NOT VALID` FKs + lookup indexes). None are auto-applied.
> - `db:push` is now `npm run db:push` → `scripts/db-push-guarded.mjs`, which
>   refuses missing or unconfirmed targets (production-marker hosts and all
>   non-local hosts require `DRIVABLE_CONFIRM_AUTHENTICATED_TARGET=1`). The
>   reviewed SQL migrations remain the preferred path.
> - `npm run preflight:safe` runs the no-database, no-mutation battery
>   (seed validation, migration/schema parity, NHTSA inventory, config
>   inspection, typecheck, build, seed-import dry run). Seed import remains
>   dry-run only (`importAllowedNow: false`, `--apply` gated).

## Audit Scope

This audit compares repository configuration, runtime imports, schema files, scripts, and migration artifacts. It did not load Drizzle Kit, read `DATABASE_URL`, connect to a database, generate SQL, create migrations, or change runtime files.

Audit date: June 12, 2026.

## Current Dependencies

| Package | Version | Observed role |
|---|---|---|
| `drizzle-orm` | `^0.39.1` | Runtime ORM |
| `drizzle-zod` | `^0.7.0` | Insert-schema generation |
| `drizzle-kit` | `^0.30.4` | Schema tooling through `db:push` |
| `pg` | `^8.13.1` | Active PostgreSQL driver |
| `@neondatabase/serverless` | `^0.10.4` | Installed, but only the disabled connector was observed using it |
| `zod` | `^3.24.2` | Schema validation/types |

The active runtime uses PostgreSQL through `drizzle-orm/node-postgres` and `pg.Pool`.

## Config and Schema Paths

| Item | Path or value | Exists | Finding |
|---|---|---:|---|
| Root Drizzle config | `drizzle.config.ts` | Yes | Automatically selected by root `drizzle-kit` commands |
| Server Drizzle config | `server/drizzle.config.ts` | Yes | Duplicate config with path resolution relative to `server/` |
| JavaScript config | `drizzle.config.js` | No | Not present |
| ESM config | `drizzle.config.mjs` | No | Not present |
| Root config schema target | `./shared/schema.ts` | No | Broken from repository root |
| Server config schema target | `server/shared/schema.ts` | No | Broken when resolved from `server/drizzle.config.ts` |
| Actual runtime TypeScript schema | `server/shared/shared/schema.ts` | Yes | Imported by active DB modules |
| JavaScript schema copy | `server/shared/shared/schema.js` | Yes | Generated-looking copy with no documented authority |
| Disabled TypeScript copy | `_shared_DISABLED/schema.ts` | Yes | Byte-identical to active TypeScript schema at audit time |

Both configs specify `./migrations`. For the root config that means `migrations/`; for the server config it means `server/migrations/`. Neither directory exists.

## Package Scripts

`package.json` contains:

```text
"db:push": "drizzle-kit push"
```

This script invokes Drizzle Kit without an explicit config or environment guard. From the repository root it would find `drizzle.config.ts`, require `DATABASE_URL`, and target the nonexistent `shared/schema.ts`. If the path were corrected while a production URL was present, `push` could directly alter that database without producing a reviewed migration history.

The seed validator, preview, and local skeleton scripts are read-only and do not use Drizzle.

## Migration Inventory

- `migrations/`: absent.
- `server/migrations/`: absent.
- Other tracked migration directories: none found.
- Tracked migration SQL or metadata: none found.
- Migration history in a deployed database: unknown because no database connection was made.

The repository therefore has no reviewable migration baseline.

## Runtime DB Usage

### `server/db.ts`

- Imports all schema exports from `./shared/shared/schema`.
- Lazily creates a `pg.Pool` from `DATABASE_URL`.
- Configures SSL with `rejectUnauthorized: false`.
- Exposes `getDb()` and a `select 1` health check.

### `server/routes.ts`

`server/routes.ts` does not import table models directly. It imports:

- `checkDatabaseConnection` from `server/db.ts`.
- `insertPublicDiagnosisCaseToDb` from `server/public-case-db.ts`.

It calls the health check for `/api/health/db` and calls the public-case insert helper during diagnosis creation.

### `server/public-case-db.ts`

- Imports `diagnoses` from `./shared/shared/schema`.
- Calls `getDb().insert(diagnoses)`.
- Uses conflict-ignore behavior keyed by diagnosis ID.

Most other route storage behavior currently uses `server/storage.ts`, which is in-memory/local, while a broader Drizzle storage implementation remains disabled in `server/_storage.DISABLED.ts`.

## Inconsistencies Found

| Finding | Risk | Why it matters |
|---|---|---|
| Root config points to missing `shared/schema.ts` | High | Drizzle tooling cannot reliably inspect or generate from the runtime schema |
| Server config points to missing `server/shared/schema.ts` | High | The duplicate config is also invalid and can produce a different output directory |
| Runtime schema is nested at `server/shared/shared/schema.ts` | Medium | The doubled directory is surprising and conflicts with the root `@shared/*` alias |
| Two Drizzle configs exist with relative paths | High | Command working directory or explicit config choice can change schema/output resolution |
| No tracked migration baseline exists | Critical | A generated migration could interpret all existing tables as new or fail to represent deployed state |
| `db:push` directly changes the configured database | Critical | There is no review artifact, environment guard, or production confirmation gate |
| Deployed schema is unknown | Critical | Repository definitions cannot safely be assumed to match production |
| TypeScript, JavaScript, and disabled schema copies coexist | High | Future edits may diverge and tooling/runtime may use different sources |
| Schema JavaScript differs textually from TypeScript | Medium | It appears transpiled, but generation ownership and freshness are undocumented |
| Active runtime mixes DB writes with local storage | Medium | Migration testing must cover the narrow live write path and local behavior separately |
| SSL verification is disabled in the active pool | High | Security posture needs provider-specific review before expanding DB usage |
| Proposed seller table name differs from manifest | Medium | `drivable_seed_seller_disclosures` and `drivable_seed_seller_disclosure_prompts` must be reconciled |

## Overall Risk

**Current migration readiness: Critical / No-Go.**

The path mismatch alone blocks trustworthy Drizzle tooling. The absence of a migration baseline and unknown deployed schema make a real migration unsafe even after correcting the path.

**Current seed import readiness: High / No-Go.**

Seed files validate, but target tables do not exist in an approved migration, the final seller table name is unresolved, and no environment-isolated real importer exists.

## Recommended Correction Path

1. Freeze migration and import commands.
2. Name one technical owner and one authoritative schema.
3. Use `shared/schema.ts` as the recommended final schema location because:
   - Root `drizzle.config.ts` already targets it.
   - `tsconfig.json` maps `@shared/*` to `shared/*`.
   - Historical commits show the schema originally lived there.
   - It keeps shared data contracts outside the server implementation directory.
4. In a separate reviewed change, move/copy the current authoritative TypeScript schema to `shared/schema.ts` and update active runtime imports to `@shared/schema`.
5. Keep one root `drizzle.config.ts`; remove or clearly retire `server/drizzle.config.ts` only after all operational references are checked.
6. Set one reviewed root output path, recommended `drizzle/migrations`, to make generated artifacts unmistakable and trackable.
7. Replace direct `db:push` use with explicit inspection/generation/migration scripts that require a named non-production environment.
8. Obtain an approved read-only inventory of the deployed database and compare it with the chosen schema.
9. Establish a migration baseline without applying speculative changes.
10. Generate and review the first Drivable migration against a disposable local database, then staging.

## Must Be Fixed Before Real Migrations

- Authoritative schema location selected.
- Both runtime and Drizzle tooling resolve the same TypeScript schema.
- Duplicate config decision completed.
- Migration output directory selected and tracked.
- Deployed schema inspected and reconciled.
- Local, staging, and production URLs separated and protected.
- Backup and restore test completed.
- Migration generation and application commands separated.
- `db:push` removed, renamed, or guarded from routine/production use.
- Migration reviewed and tested on disposable local and staging databases.
- SSL and credential policy reviewed.

## Must Be Fixed Before Seed Import

- Approved seed tables exist through a reviewed migration.
- Final table names exactly match the manifest and importer.
- Seed/customer/outcome separation is verified physically and through permissions.
- Import account is restricted to seed tables.
- Import is idempotent and batch-tagged.
- Expected counts and checksums are frozen.
- Rollback by import batch is tested.
- Local and staging imports pass before production consideration.
- `importAllowedNow` remains `false` until explicit approval.

## Must Not Be Changed Yet

- Do not edit the live schema or runtime imports in this audit lane.
- Do not run `db:push`, Drizzle generation, or migration commands.
- Do not create an empty migration baseline by guesswork.
- Do not remove duplicate files until their operational use is confirmed.
- Do not point inspection scripts at `DATABASE_URL`.
- Do not import seed data into any database.
- Do not use production as the first schema comparison or import test.
