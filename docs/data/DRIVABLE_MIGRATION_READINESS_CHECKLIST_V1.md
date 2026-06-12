# Drivable Migration Readiness Checklist V1

## Current Verdict

**NO-GO as of June 12, 2026.**

Use this checklist before generating, reviewing, or running any real migration. A fail or unknown on a required item is a stop condition.

| Readiness item | Current | Pass evidence required |
|---|---|---|
| Schema path confirmed | **FAIL** | One documented authoritative schema path |
| Drizzle config points to correct schema | **FAIL** | Inspection script shows the configured schema exists and matches runtime imports |
| Migration output directory confirmed | **FAIL** | One approved path exists and is used by the sole config |
| Local/staging `DATABASE_URL` separated from production | **UNKNOWN** | Named environments, separate credentials, and operator proof |
| Production `DATABASE_URL` protected | **UNKNOWN** | Restricted secrets, least privilege, confirmation gate, and no routine local exposure |
| Backup plan exists | **PARTIAL** | Provider-specific procedure, owner, backup ID format, and retention |
| Rollback plan exists | **PARTIAL** | Tested migration-down/restore or exact forward-recovery plan |
| Current deployed app works | **UNKNOWN** | Dated production smoke-test evidence |
| Make router tested | **UNKNOWN** | All required routes pass with email behavior verified |
| Seed validation passes | **PASS** | `npm run validate:seed-data` exits zero |
| Preview import passes | **PASS** | `npm run preview:seed-import` exits zero and reports dry run |
| Local skeleton passes | **PASS** | `npm run local:seed-import:skeleton` exits zero and reports no DB connection |
| Migration reviewed before run | **FAIL** | Generated artifact, peer review, owner approval, and target environment recorded |
| Seed/customer/outcome tables separated | **DESIGN PASS / IMPLEMENTATION FAIL** | Approved migrated schema plus permission and query verification |

## Alignment Gate

- [ ] One authoritative TypeScript schema is selected.
- [ ] Runtime imports and Drizzle config target that same file.
- [ ] Duplicate Drizzle config is removed or formally retired.
- [ ] Generated JavaScript schema ownership is documented or the file is removed through a reviewed change.
- [ ] Disabled schema copies are archived outside executable paths or clearly documented.
- [ ] The deployed schema is compared with repository definitions using approved read-only access.
- [ ] Existing table ownership and migration history are understood.

## Environment Gate

- [ ] Local database is disposable and contains no production customer data.
- [ ] Staging has separate credentials and a clearly identifiable host/database name.
- [ ] Production credentials are unavailable to routine local scripts.
- [ ] Commands print the target environment without printing credentials.
- [ ] Production-like host markers trigger refusal unless an explicit approved production procedure is used.
- [ ] Database roles use least privilege.
- [ ] SSL requirements are provider-reviewed.

## Recovery Gate

- [ ] Backup is created before schema changes.
- [ ] Backup restore has been tested outside production.
- [ ] Rollback owner and decision deadline are named.
- [ ] Migration rollback or forward-recovery command is documented.
- [ ] Seed import rollback is limited to the exact import batch.
- [ ] Destructive broad rollback is prohibited where customer data may exist.

## Migration Review Gate

- [ ] Migration is generated from the approved schema and config.
- [ ] Migration is committed and reviewed before execution.
- [ ] SQL is checked for drops, rewrites, locks, defaults, nullability, and irreversible changes.
- [ ] Existing production tables are not recreated by accident.
- [ ] Local apply, rollback, and reapply pass.
- [ ] Staging apply and smoke tests pass.
- [ ] Production maintenance window and monitoring are approved.

## Seed Import Gate

- [ ] All eight seed datasets validate.
- [ ] Preview counts match the frozen release counts.
- [ ] Manifest table names match migrated tables exactly.
- [ ] `importAllowedNow` remains false until execution approval.
- [ ] Import role can write only to seed tables.
- [ ] Seed rows cannot contain customer or outcome identifiers.
- [ ] Import is idempotent and records version, source, and batch ID.
- [ ] Local and staging row counts and samples pass manual review.
- [ ] Production import is last, not first.

## Application and Operations Gate

- [ ] Current deployed intake and DB health behavior is documented.
- [ ] Public diagnosis insert path is tested against staging after migration.
- [ ] Local-storage-backed routes remain behaviorally unchanged.
- [ ] Make router routes and email destinations pass.
- [ ] Customer-send safety gate remains enforced.
- [ ] No high-risk guidance can auto-send.
- [ ] Post-migration logs and monitoring are active without exposing credentials or customer data.

## Final Approval

Production remains blocked until every required item is pass and the following are recorded:

- Source commit.
- Migration ID and checksum.
- Target environment and database identifier.
- Backup and restore evidence.
- Local and staging test evidence.
- Expected schema and seed row counts.
- Operator, reviewer, safety/privacy approvers, and rollback owner.
