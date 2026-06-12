# Drivable Drizzle Correction Plan V1

## Current Suspected Issue

The repository has two Drizzle configs, neither of which resolves to the schema used by runtime:

- Root `drizzle.config.ts` targets missing `shared/schema.ts`.
- `server/drizzle.config.ts` targets missing `server/shared/schema.ts`.
- Runtime imports `server/shared/shared/schema.ts`.

No migration directory or tracked migration baseline exists. The current `db:push` script can directly alter whichever database is in `DATABASE_URL`, without an explicit config or environment guard.

## Recommended Final Layout

```text
drizzle.config.ts
shared/
  schema.ts
drizzle/
  migrations/
server/
  db.ts
  public-case-db.ts
```

Recommended choices:

- **Authoritative schema:** `shared/schema.ts`
- **Authoritative config:** root `drizzle.config.ts`
- **Migration output:** `drizzle/migrations`
- **Runtime import:** `@shared/schema`

This matches the existing TypeScript alias, the original repository layout, and the concept of schema contracts shared by server and tooling.

## Safest Correction Sequence

### Phase 0: Freeze

1. Do not run `db:push`, generation, migration, or import commands.
2. Name the technical owner and authoritative production environment.
3. Preserve current runtime behavior while evidence is gathered.

### Phase 1: Prove Current State

1. Run `node scripts/inspect-db-config.mjs`.
2. Record current runtime schema hash and table names.
3. Obtain approved read-only deployed schema metadata.
4. Determine how existing tables were created and whether any external migration history exists.
5. Confirm whether `server/shared/shared/schema.js` is generated and whether anything imports it explicitly.

### Phase 2: Align Source Files

In one separate reviewed change:

1. Create `shared/schema.ts` from the current authoritative TypeScript schema.
2. Update `server/db.ts` and `server/public-case-db.ts` to import `@shared/schema`.
3. Run TypeScript checks and build.
4. Verify public diagnosis insertion against a disposable local database.
5. Remove or archive duplicate schema files only after import/reference searches prove they are unused.

This phase changes runtime imports and therefore must not be folded into an audit-only commit.

### Phase 3: Align Drizzle Config

1. Keep one root `drizzle.config.ts`.
2. Set `schema: "./shared/schema.ts"`.
3. Set `out: "./drizzle/migrations"`.
4. Remove or retire `server/drizzle.config.ts` after operational references are checked.
5. Add explicit config arguments to future Drizzle scripts.
6. Ensure inspection/generation does not silently consume production credentials.

### Phase 4: Establish Safe Scripts

Recommended future script intent:

```json
{
  "inspect:db-config": "node scripts/inspect-db-config.mjs",
  "db:generate": "drizzle-kit generate --config=drizzle.config.ts",
  "db:migrate:local": "node scripts/run-reviewed-migration.mjs --environment=local",
  "db:migrate:staging": "node scripts/run-reviewed-migration.mjs --environment=staging"
}
```

Do not add a routine production migration script. Production execution should use an approved runbook and explicit operator confirmation.

The existing `db:push` should later be removed or renamed to a clearly dangerous manual command after team review. Do not merely repoint it and leave it easy to invoke.

### Phase 5: Baseline and Reconcile

1. Compare deployed schema with `shared/schema.ts`.
2. Decide whether to introspect, baseline, or write a reconciliation migration.
3. Confirm existing seven tables will not be recreated or dropped.
4. Generate migration artifacts without applying them.
5. Review SQL for data loss, locks, defaults, nullability, and indexes.
6. Commit the reviewed baseline/reconciliation artifacts.

### Phase 6: Local and Staging

1. Apply to a disposable local database.
2. Test apply, rollback/restore, and reapply.
3. Run application and DB smoke tests.
4. Apply to staging with a verified backup.
5. Re-run application, router, email-safety, and data-boundary tests.

### Phase 7: Seed Tables

1. Resolve `drivable_seed_seller_disclosures` versus `drivable_seed_seller_disclosure_prompts`.
2. Review the proposed schema and migration.
3. Apply seed-table migration locally and in staging.
4. Use a real importer created in a separate reviewed task.
5. Verify counts, samples, idempotency, batch rollback, and permissions.

Production remains out of scope until all gates pass.

## Files That Should Change Later

- `shared/schema.ts`: become the authoritative live schema.
- `server/db.ts`: import the authoritative shared schema.
- `server/public-case-db.ts`: import table models from the authoritative schema.
- `drizzle.config.ts`: point to the authoritative schema and approved migration output.
- `package.json`: replace/guard `db:push` and add explicit reviewed commands.
- `scripts/`: add environment guard and reviewed migration runner.
- `drizzle/migrations/`: contain committed migration artifacts after baseline approval.

Potential cleanup after proof:

- `server/drizzle.config.ts`
- `server/shared/shared/schema.ts`
- `server/shared/shared/schema.js`
- `_shared_DISABLED/schema.ts`
- disabled DB/storage files

Cleanup must be a separate reviewed step, not assumed.

## Files That Should Not Change Yet

- Live schema files.
- `server/db.ts`.
- `server/public-case-db.ts`.
- `server/routes.ts`.
- Deployment/Render configuration.
- Environment variables or secrets.
- Seed data and manifest import permission.
- Any production database object.

## Decisions Needed Before Migration

- Who owns the database and migration approval?
- What is the authoritative deployed database and provider?
- What schema and migration history currently exist there?
- Is `shared/schema.ts` approved as the final source?
- Is `drizzle/migrations` approved as output?
- How will production credentials be isolated?
- What backup/restore procedure is proven?
- How will existing tables be baselined without recreation?
- Which final seller-disclosure table name is authoritative?
- What SSL verification policy does the provider require?

## Exact Production Stop Line

**Stop before any production schema or seed command.**

Production work may begin only after:

1. Runtime and Drizzle tooling use one reviewed schema.
2. One config and one migration output are authoritative.
3. Deployed schema and migration baseline are known.
4. Migration SQL is committed, reviewed, and locally/staging tested.
5. Backup restore is proven.
6. Target identity and least-privilege credentials are confirmed by two people.
7. Rollback owner and command are recorded.
8. App, Make/router, email, and send-safety smoke tests pass.
9. Seed/customer/outcome separation is verified.
10. Glenn and the technical owner explicitly approve the exact production run.
