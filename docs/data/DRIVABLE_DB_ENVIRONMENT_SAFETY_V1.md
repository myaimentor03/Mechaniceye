# Drivable DB Environment Safety V1

## Non-Negotiable Rule

Never generate against, migrate, push, reset, import, or repair a production database without explicit approval for the exact command, commit, target, backup, and rollback plan.

`npm run db:push` is not an inspection command. It can change the database identified by `DATABASE_URL` and must not be used during audit or planning.

## Required Environment Order

1. Disposable local PostgreSQL database.
2. Isolated staging database with separate credentials.
3. Production only after local and staging evidence is reviewed and approved.

Production must never be the first environment used to discover whether a migration or importer works.

## Recognizing Risky Database URLs

Treat a URL as production-like when its hostname, database, username, query parameters, or labels contain provider or environment indicators such as:

- `render.com` or `render`
- `amazonaws`
- `neon.tech`
- `supabase`
- `railway`
- `production`
- `prod`
- a known public application or company domain
- a provider project ID that maps to the live service

Provider names alone do not prove production, because staging may use the same provider. When uncertain, stop and verify through the provider console and a second person.

Never print the full URL. Logs must redact username, password, hostname, database name, and query credentials where they are sensitive.

## Why the Render/Production Database Must Be Protected

- The active application can already insert diagnosis records.
- A schema push could alter tables used by live intake.
- There is no tracked migration baseline to prove what Drizzle will consider new or changed.
- A wrong target could expose, lock, rewrite, or delete customer data.
- Production credentials may have broader privileges than an import job should receive.
- Rollback can be difficult or lossy after a direct schema push.

The production URL should be held in deployment secret storage, not routine developer shells. Local tooling should use clearly named non-production variables or an approved wrapper that refuses ambiguous targets.

## Pre-Change Environment Check

Before any future schema command:

- Record the intended environment.
- Resolve and display only a redacted hostname/database fingerprint.
- Verify the database role and permissions.
- Confirm the command uses the reviewed config and schema.
- Confirm the migration commit and checksum.
- Confirm backup ID and restore owner.
- Require a second-person target check for production.
- Stop if any value is missing, ambiguous, or unexpectedly production-like.

## Backup Requirement

Before schema changes in any shared persistent environment:

1. Create a provider-supported backup.
2. Record environment, database, backup ID, time, and operator.
3. Verify backup completion.
4. Test restore into a separate non-production database.
5. Confirm retention covers the migration and observation window.

A backup without a proven restore path is not sufficient.

## Rollback Requirement

Every approved migration must include:

- Exact stop conditions.
- Exact rollback or forward-recovery command.
- Expected duration and lock implications.
- Owner authorized to trigger rollback.
- Data-preservation impact.
- Restore procedure if rollback is unsafe or incomplete.

Do not improvise destructive rollback commands during an incident.

## Seed Import Controls

- Seed imports may write only to the eight approved seed reference tables.
- Never import seed rows into customer case, media, draft, review, report, or outcome tables.
- Never add customer identifiers, VINs, contacts, private media, repair results, or transaction outcomes to seed rows.
- Use a restricted import role and one import batch ID.
- Keep dataset version, source file, checksum, and row count.
- Stop on missing fields, duplicate IDs, reference failures, or count mismatches.
- Do not disable constraints to make an import pass.

## Row Count Verification

After every future import, compare:

- Source rows.
- Attempted rows.
- Inserted rows.
- Existing/skipped rows.
- Failed rows.
- Final table rows for the imported version and batch.

Sample records from every table and verify primary IDs, version, safety fields, and source metadata. Any unexplained difference is a rollback/stop condition.

## Post-Migration Smoke Tests

At minimum:

- Database health check behaves as expected.
- Public diagnosis insert succeeds once and remains conflict-safe.
- Existing diagnosis reads and local-storage-backed routes behave unchanged.
- Application starts and builds from the migration commit.
- Expected tables, columns, constraints, and indexes exist.
- No unexpected tables or columns changed.
- Seed/customer/outcome separation holds.
- Logs contain no database credentials or sensitive customer data.
- Make/router and customer email safety behavior remain unchanged.

## Production Stop Line

Do not proceed when:

- Schema/config paths are not aligned.
- Deployed schema is unknown.
- Migration is unreviewed or untracked.
- Target environment is ambiguous.
- Backup or restore evidence is missing.
- Rollback ownership is missing.
- Local or staging tests failed.
- Row counts are uncertain.
- Seed and customer/outcome boundaries are unclear.
- The operator cannot prove the command will not use an unintended `DATABASE_URL`.
