# Drivable Real Seed Import Runbook V1

## Status

This runbook describes a future controlled import. It does not authorize an import today. The manifest must remain `importAllowedNow: false` until schema, migration, environment, backup, and approval gates are complete.

## Required Approvers

A real import requires explicit approval from:

- Product/data owner: Glenn or designated owner.
- Technical owner responsible for the database and deployment.
- Safety reviewer for roadside and customer-guidance implications.
- Privacy/security owner for any environment containing customer data.
- Migration operator who is not relying on the same unreviewed credentials or assumptions as the author.

## Prerequisites

1. Confirm the authoritative Drizzle schema and config path.
2. Inspect the target database schema using approved read-only access.
3. Review and approve the final migration; do not use the draft SQL or Drizzle file directly.
4. Define environment names and prove that local, staging, and production credentials cannot be confused.
5. Define table ownership, least-privilege roles, audit logging, retention, and deletion behavior.
6. Reconcile every final table name with `seed_import_manifest_v1.json`.
7. Record the source Git commit, dataset versions, row counts, and checksums.
8. Confirm seed tables are physically and logically separate from customer and outcome tables.
9. Prepare reviewed idempotent import and rollback scripts.
10. Schedule a maintenance/recovery window appropriate to the target.

## Backup Gate

Before importing into any persistent shared environment:

- Create a complete backup using the provider-approved method.
- Record backup ID, timestamp, environment, database, and operator.
- Verify restore instructions and permissions.
- Perform a restore test outside production.
- Stop if the backup cannot be verified or the restore procedure is uncertain.

## Required Read-Only Checks

From the approved source commit, run:

```text
npm run validate:seed-data
npm run preview:seed-import
node scripts/local-seed-import-skeleton.mjs --dry-run
npm run local:seed-import:skeleton
```

Confirm:

- All eight datasets pass.
- Row counts match the reviewed manifest and release notes.
- All imports remain disabled in the manifest until the separately approved execution change.
- Primary IDs and required fields are valid.
- Follow-up question category references resolve.
- The local skeleton states that no database connection was made.

## Local Import First

1. Provision an empty, disposable local PostgreSQL database with no production-derived customer data.
2. Apply the reviewed migration using the approved migration mechanism.
3. Verify all expected tables, keys, constraints, and indexes.
4. Run the reviewed real importer against local only.
5. Manually compare inserted row counts with the dry-run counts.
6. Sample records from every table and compare them with source JSON.
7. Repeat the import to prove idempotency or verify the documented duplicate-failure behavior.
8. Exercise rollback and restore.
9. Drop the disposable database after evidence is retained.

The current `local-seed-import-skeleton.mjs` is not a real importer and must not be modified into one without a separate reviewed task.

## Staging Import

1. Use a staging database with production-like schema and access controls but no production credentials.
2. Confirm the approved migration is applied and recorded.
3. Re-run validation, preview, and skeleton checks from the exact deployment commit.
4. Execute the reviewed importer with a unique import batch ID.
5. Compare source, attempted, inserted, skipped, and failed row counts.
6. Verify no customer, media, draft, report, or outcome table changed.
7. Verify application reads, admin review, and safety gates in staging.
8. Retain an import audit record and reviewer sign-off.
9. Run rollback and re-import tests before production approval.

## Production Import Last

Production is the final environment, never the first persistent test.

Before execution:

- Reconfirm backup and restore readiness.
- Reconfirm target hostname/database and require a second-person check.
- Confirm the reviewed migration is already applied.
- Confirm the import account can write only to the eight seed tables.
- Freeze the source commit and manifest.
- Record expected row counts.
- Confirm no unresolved launch, safety, privacy, or schema blockers.

During execution:

- Use one import batch ID.
- Import in manifest priority order.
- Stop on any constraint, count, reference, or permission error.
- Do not broaden permissions or disable constraints during the run.

## Manual Row Review

For every dataset, record:

| Dataset | Expected | Inserted | Skipped | Failed | Reviewer |
|---|---:|---:|---:|---:|---|
| symptom categories |  |  |  |  |  |
| evidence items |  |  |  |  |  |
| roadside risk triggers |  |  |  |  |  |
| decision paths |  |  |  |  |  |
| follow-up questions |  |  |  |  |  |
| repair-versus-sell factors |  |  |  |  |  |
| buyer risk flags |  |  |  |  |  |
| seller disclosures |  |  |  |  |  |

## Separation Verification

Stop and roll back if:

- Any seed row contains a case ID, customer ID, email, phone, VIN, private media reference, outcome, or repair result.
- Any customer or outcome row is inserted by the seed importer.
- A customer workflow mutates seed rows.
- Seed data is treated as confirmation of diagnosis, repair, title, safety, legality, price, or outcome.

## Rollback Plan

Preferred rollback order:

1. Stop application use of the new seed version if it was enabled separately.
2. Roll back the import transaction if still open.
3. Otherwise delete only rows carrying the exact import batch ID, in reverse import order.
4. Verify counts return to the pre-import baseline.
5. Restore from the verified backup if targeted rollback is incomplete or integrity is uncertain.
6. Record the failure, affected environment, evidence, and decision before retrying.

Never use broad table truncation or destructive commands in a database that may contain customer data.

## Post-Import Smoke Checks

- All eight seed tables contain the approved counts and version.
- Primary IDs and version uniqueness hold.
- Follow-up category references resolve.
- Safety-critical rows retain stop-now and human-review flags.
- Raw seed rows are not directly customer-visible.
- Existing diagnosis intake and health behavior remain unchanged.
- No customer/outcome table timestamps or counts changed.
- AI retrieval, if separately enabled later, is version-pinned and bounded.
- Logs contain no credentials or sensitive customer data.
- Monitoring and rollback ownership are active.

## Completion Record

Capture:

- Environment and database identifier.
- Source commit and manifest checksum.
- Migration version.
- Import batch ID.
- Expected and actual counts.
- Backup and restore-test references.
- Operator and approvers.
- Start/end timestamps.
- Smoke-check and rollback status.
