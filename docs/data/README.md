# Drivable Data Readiness Docs

- `DRIVABLE_DB_SEED_IMPORT_PLAN_V1.md` - Dry-run import order, validation, rollback, AI-use, intake mapping, and review gates.
- `DRIVABLE_SEED_DATA_TABLE_MAPPING_V1.md` - Proposed table boundaries for eight seed datasets and nine future real-data flows.
- `DRIVABLE_OUTCOME_DATA_MODEL_V1.md` - Outcome fields, verification rules, examples, and responsible learning use.
- `DRIVABLE_MEDIA_DATA_MODEL_V1.md` - Case-linked media fields, provenance, consent, licensing, safety, and privacy controls.
- `DRIVABLE_DB_MIGRATION_WARNING_V1.md` - Explicit no-go conditions and minimum gates for any future migration or import.

Related machine-readable contract:

- `../seed-data/seed_import_manifest_v1.json` - Read-only dataset manifest with sources, keys, required fields, proposed order, and imports disabled.

Related commands:

```text
npm run validate:seed-data
npm run preview:seed-import
```

These commands read and report only. They do not connect to or modify a database.
