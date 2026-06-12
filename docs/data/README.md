# Drivable Data Readiness Docs

- `DRIVABLE_DB_SEED_IMPORT_PLAN_V1.md` - Dry-run import order, validation, rollback, AI-use, intake mapping, and review gates.
- `DRIVABLE_SEED_DATA_TABLE_MAPPING_V1.md` - Proposed table boundaries for eight seed datasets and nine future real-data flows.
- `DRIVABLE_OUTCOME_DATA_MODEL_V1.md` - Outcome fields, verification rules, examples, and responsible learning use.
- `DRIVABLE_MEDIA_DATA_MODEL_V1.md` - Case-linked media fields, provenance, consent, licensing, safety, and privacy controls.
- `DRIVABLE_DB_MIGRATION_WARNING_V1.md` - Explicit no-go conditions and minimum gates for any future migration or import.
- `DRIVABLE_CURRENT_DB_INVENTORY_V1.md` - Inventory of current Drizzle, schema, DB-writing, migration, and unknown production state.
- `DRIVABLE_PROPOSED_DB_SCHEMA_V1.md` - Proposed seed, customer-flow, report, review, media, and outcome table design.
- `DRIVABLE_PROPOSED_SCHEMA_SQL_DRAFT_V1.sql` - PostgreSQL-style schema draft for documentation only; never run without review.
- `DRIVABLE_PROPOSED_DRIZZLE_SCHEMA_DRAFT_V1.ts` - Standalone Drizzle schema draft that is not imported by the application.
- `DRIVABLE_REAL_SEED_IMPORT_RUNBOOK_V1.md` - Approval, backup, local/staging-first, rollback, and production import controls.
- `DRIVABLE_DRIZZLE_SCHEMA_ALIGNMENT_AUDIT_V1.md` - Exact config, schema, runtime import, migration-history, and risk audit.
- `DRIVABLE_MIGRATION_READINESS_CHECKLIST_V1.md` - Pass/fail gates for schema alignment, environments, recovery, migration review, and seed import.
- `DRIVABLE_DB_ENVIRONMENT_SAFETY_V1.md` - Environment identification, backup, rollback, row-count, and production stop rules.
- `DRIVABLE_DRIZZLE_CORRECTION_PLAN_V1.md` - Recommended final layout and phased correction sequence before migrations.

Related machine-readable contract:

- `../seed-data/seed_import_manifest_v1.json` - Read-only dataset manifest with sources, keys, required fields, proposed order, and imports disabled.

Related commands:

```text
npm run validate:seed-data
npm run preview:seed-import
npm run local:seed-import:skeleton
```

These commands read and report only. They do not connect to or modify a database.

Local-only script:

- `../../scripts/local-seed-import-skeleton.mjs` - Requires `--dry-run`, validates the manifest and seed rows, rejects production-like database URLs, and never opens a database connection.
- `../../scripts/inspect-db-config.mjs` - Read-only inspection of Drizzle configs, schema candidates, package scripts, and migration directories.
