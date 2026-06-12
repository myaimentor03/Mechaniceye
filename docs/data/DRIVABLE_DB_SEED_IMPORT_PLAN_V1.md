# Drivable DB Seed Import Plan V1

## Purpose

Define a safe, reviewable path for eventually loading Drivable's versioned seed knowledge into a non-production database. This plan does not authorize a migration or import and does not change live application behavior.

## Seed Data Sources

The source files are the eight reviewed JSON/CSV pairs in `docs/seed-data/`:

1. Symptom categories
2. Evidence items
3. Roadside risk triggers
4. Decision paths
5. Follow-up questions
6. Repair-versus-sell factors
7. Buyer risk flags
8. Seller disclosure prompts

`docs/seed-data/seed_import_manifest_v1.json` records each source, proposed table, primary key, required fields, order, visibility, and AI-use restriction. JSON is the proposed machine-readable import source. CSV remains a review aid.

## Dry-Run Only

This lane is dry-run only because:

- No reviewed database schema or migration exists for these tables.
- Make/router and live intake behavior are still being proved.
- Backup, restore, access, retention, and deployment ownership are not yet approved.
- Seed rows are general product taxonomy, not verified repair facts.
- Direct AI use needs prompt, safety, and human-review controls.

**Do not import this data into production yet.** `importAllowedNow` must remain `false` for every manifest entry until a separately approved production change.

## Recommended Import Order

| Priority | Dataset | Reason |
|---:|---|---|
| 1 | Symptom categories | Foundational taxonomy referenced by follow-up questions and intake classification |
| 2 | Evidence items | Defines safe evidence requests used across categories and reports |
| 3 | Roadside risk triggers | Establishes safety escalation vocabulary before decision support |
| 4 | Decision paths | Defines possible next moves and workflow relationships |
| 5 | Follow-up questions | Depends on stable symptom category IDs |
| 6 | Repair-versus-sell factors | Adds decision-support factors after core categories and paths |
| 7 | Buyer risk flags | Adds buyer-specific screening guidance |
| 8 | Seller disclosure prompts | Adds seller/listing support with legal and safety boundaries |

Within a future transaction, import into empty staging tables first, validate, review, and only then promote through a separately approved process.

## Validation Rules

- Manifest parses as a non-empty JSON array.
- Every manifest entry contains the required metadata.
- `importAllowedNow` is exactly `false`.
- Dataset names and import priorities are unique.
- Every referenced JSON file exists and contains a non-empty array.
- Every row is an object.
- Every required field exists and is not null or an empty string.
- Primary keys are non-empty strings and unique within each dataset.
- Foreign references, especially `follow_up_questions.symptomCategoryId`, resolve before any future import.
- Row counts and a sample record are reviewed before approval.
- Future staging validation should also enforce data types, allowed values, version, provenance, and checksums.

Run:

```text
npm run validate:seed-data
npm run preview:seed-import
```

Both commands are read-only.

## Rollback Strategy

Before any future non-production or production import:

1. Record the exact source commit, manifest version, row counts, and checksums.
2. Take and verify a restorable database backup.
3. Import into isolated staging tables or a transaction.
4. Tag imported rows with dataset version and import batch ID.
5. Verify counts, keys, references, and representative records.
6. Roll back the transaction or delete only the identified import batch if validation fails.
7. Never use a broad destructive rollback against customer tables.
8. Prove restore steps outside production before production approval.

## Support for AI and Reports

Seed data can eventually help normalize intake categories, select safe follow-up questions, identify missing evidence, organize possible decision paths, and structure confidence-rated reports. It should be retrieved as versioned context, not copied into prompts without limits.

Seed rows must never be treated as confirmation of a cause, repair, cost, safety condition, title status, or outcome. Customer-facing output still needs case evidence, uncertainty language, safety escalation, and the required human review.

## Intake Field Connections

| Intake field or concept | Seed connection |
|---|---|
| `problemCategory`, symptoms, original symptoms | Symptom categories |
| photos/video available, codes, warning lights | Evidence items |
| warning lights, risk signals, drivability, roadside mode | Roadside risk triggers |
| customer goal, report type, scenario | Decision paths |
| missing information and clarification | Follow-up questions |
| mileage, repair history, cost/value goal | Repair-versus-sell factors |
| seller claims, title status, remote evidence | Buyer risk flags |
| known issues, condition summary, listing goal | Seller disclosure prompts |

Matching should retain both the customer's original wording and the normalized seed IDs. Do not overwrite raw intake text.

## Outcomes Must Be Separate

Seed knowledge belongs in versioned reference tables. Customer cases, media, AI drafts, reviews, reports, and outcomes belong in separate operational tables linked by stable IDs.

Do not add customer observations or repair outcomes back into seed rows. A reviewed learning process may propose a new seed version, but it must preserve provenance, verification level, evaluation evidence, and approval history.

## Privacy and Safety

- Seed files should contain no customer identity, contact details, VINs, precise locations, or private media.
- Customer outcomes require consent, access controls, retention rules, correction/deletion paths, and source-quality labels.
- Separate identity/contact data from analysis data where practical.
- Never ask a customer to drive, recreate danger, record while driving, touch hot/moving parts, or approach fuel, smoke, fire, or traffic hazards.
- Treat seller claims, customer recollections, AI drafts, and unverified costs as unconfirmed.
- Protect media, repair records, title information, and location context.

## Human Review Gate

Before AI uses seed data directly:

1. Product, safety, privacy, and technical owners review the dataset and retrieval rules.
2. Safety-critical and legal-adjacent rows receive qualified review.
3. Prompt tests prove seed rows are not cited as certainty.
4. High-risk cases route to human or in-person review.
5. Customer-ready text remains behind the approved send gate.
6. Evaluation confirms useful calibration without increased unsafe confidence.
