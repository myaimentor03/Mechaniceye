# Drivable Current DB Inventory V1

## Purpose

Document the database-related code currently present in the repository before any Drivable schema or seed import work. This is an inventory, not authorization to migrate, connect, or change production.

## Current DB-Related Files

| File | Current role | Safety note |
|---|---|---|
| `server/db.ts` | Lazily creates a PostgreSQL `pg.Pool`, wraps it with Drizzle, and exposes a health check | Reads `DATABASE_URL` and can connect when application code calls `getDb()` |
| `server/public-case-db.ts` | Inserts public diagnosis cases into the existing `diagnoses` table | Live DB-writing code; do not use for seed import |
| `server/shared/shared/schema.ts` | Active TypeScript Drizzle schema imported by `server/db.ts` | Treat as a live schema file; do not modify in this planning lane |
| `server/shared/shared/schema.js` | JavaScript copy of the schema definitions | Relationship to generated/runtime use is not fully documented |
| `_shared_DISABLED/schema.ts` | Disabled copy of the same legacy schema | Not an approved migration target |
| `drizzle.config.ts` | Root Drizzle Kit configuration | Points to `./shared/schema.ts`, which does not match the active nested server import |
| `server/drizzle.config.ts` | Server-local Drizzle Kit configuration | Points to `./shared/schema.ts` relative to `server/`, while the observed schema is nested one level deeper |
| `server/storage.ts` | Active local/in-memory-style storage implementation for several routes | Does not appear to be the active Drizzle storage layer |
| `server/_storage.DISABLED.ts` | Disabled Drizzle-backed storage implementation | Historical/reference code only |
| `server/_db.DISABLED.ts` | Disabled Neon/Drizzle connector | Historical/reference code only |
| `package.json` | Contains `db:push` using `drizzle-kit push` | This command can alter a configured DB and must not be used during planning |

## Drizzle and Database Technology

Drizzle is present and actively used for the public diagnosis insert path:

- `drizzle-orm`, `drizzle-zod`, and `drizzle-kit` are installed.
- `server/db.ts` uses `drizzle-orm/node-postgres` with `pg`.
- The schema uses PostgreSQL `pgTable` definitions.
- The database URL is supplied through `DATABASE_URL`.
- SSL is configured with `rejectUnauthorized: false` in the active pool.

PostgreSQL is therefore the observed target dialect. The repository also contains `@neondatabase/serverless`, but the active connector inspected for this inventory uses `node-postgres`, not the disabled Neon connector.

## Observed Schema Location

The schema actually imported by `server/db.ts` is:

```text
server/shared/shared/schema.ts
```

This nested location does not align cleanly with either Drizzle config's declared `./shared/schema.ts` path. That mismatch must be resolved deliberately before any migration generation or `db:push` operation.

## Existing Tables Inferred From the Active Schema

| Table | Inferred purpose |
|---|---|
| `users` | Credentials, subscription tier/status, and Stripe references |
| `diagnoses` | Vehicle diagnosis intake, evidence references, AI-style diagnosis JSON, confidence, and resolution state |
| `fix_history_log` | Suggested-fix attempts, completion, feedback, and success |
| `chat_export_log` | Exported diagnosis/chat context for mechanic handoff |
| `mechanics` | Mechanic directory, rates, specialties, and ratings |
| `consultations` | Mechanic consultations, ratings, notes, cost, and payment |
| `follow_up_requests` | Follow-up evidence and information tied to a diagnosis |

These are code-level definitions only. This inventory did not connect to any database, so it does not confirm that all tables exist in any deployed environment or that deployed columns match the repository.

## Current Runtime Behavior Inferred

- `server/routes.ts` calls `insertPublicDiagnosisCaseToDb()` for public diagnosis submissions.
- `server/public-case-db.ts` writes into `diagnoses` with conflict-ignore behavior on the diagnosis ID.
- `server/db.ts` exposes `/api/health/db` support through a `select 1` health query.
- Several other diagnosis, mechanic, consultation, and follow-up routes use `server/storage.ts`, while the Drizzle-backed storage file is explicitly disabled.
- The current application therefore appears to mix a narrow live Drizzle write path with local storage behavior elsewhere.

## Migrations

No tracked migration directory or generated migration files were found.

Both Drizzle configs specify `./migrations` as output, but absence of tracked migrations means the following are unknown:

- Whether production was initialized through `drizzle-kit push`, manual SQL, or another process.
- Which schema revision production currently has.
- Whether migration history exists outside the repository.
- Whether the root or server Drizzle config is considered authoritative.

## Unknowns Requiring Confirmation

- The deployed database provider, environment boundaries, and owner.
- The exact production schema and migration history.
- Whether `server/shared/shared/schema.js` is generated or manually maintained.
- Which Drizzle config, if either, is used operationally.
- Backup, restore, retention, deletion, and incident-response procedures.
- Whether production uses row-level security or role-separated credentials.
- Whether customer identity should be separated into a dedicated restricted table.
- Whether existing `diagnoses` records should ever link to new Drivable cases.
- Current production data volume, constraints, indexes, and data quality.

## What Must Not Change Yet

- Do not edit `server/shared/shared/schema.ts` or its JavaScript copy.
- Do not run `npm run db:push`, Drizzle generation, migrations, or draft SQL.
- Do not point scripts at `DATABASE_URL`.
- Do not repurpose existing `diagnoses` or outcome-like columns for seed knowledge.
- Do not merge seed taxonomy with customer cases, AI drafts, reports, or outcomes.
- Do not change `server/db.ts`, live routes, storage behavior, environment variables, or deployment configuration.

## Production Safety Notes

1. Inventory the deployed schema with read-only, approved access before designing a migration.
2. Resolve the schema/config path mismatch before using Drizzle Kit.
3. Establish local and staging databases with clearly non-production credentials.
4. Require a verified backup and restore exercise before production migration.
5. Keep seed reference tables separate from customer and outcome tables.
6. Store customer media outside relational rows when appropriate and protect storage references.
7. Apply access control, consent, retention, correction, and deletion rules before collecting real customer outcomes.
8. Treat all SQL and Drizzle files in this docs directory as drafts only.
