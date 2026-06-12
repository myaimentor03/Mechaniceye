# Drivable DB Migration Warning V1

## Current Position

Do not create or deploy database migrations for Drivable seed or outcome data while Make/router and live intake behavior remain unstable or incompletely tested.

## Required Warnings

- Do not import seed data into production without a verified backup and restore plan.
- Do not mix seed knowledge with real customer case or outcome data.
- Do not treat seed examples as verified facts, repair confirmations, safety clearance, legal advice, or guaranteed outcomes.
- Do not let AI cite a seed row as certainty.
- Require product, safety, technical, and human review before connecting AI directly to seed data.
- Require privacy and legal review before storing customer outcomes, media, contact information, location context, repair documents, or title information.
- Require a batch-specific rollback plan before any production import.
- Do not overwrite customer history, AI drafts, human decisions, delivered reports, or outcomes during reference-data updates.
- Do not use production as the first import test.

## Minimum Gate Before a Future Migration

1. All relevant Make routes and customer-send controls have documented passing evidence.
2. A reviewed schema separates seed reference tables from customer operational tables.
3. Migration and rollback scripts are peer reviewed and tested against a disposable environment.
4. Backup restoration is proven.
5. Manifest, checksums, versions, counts, and primary-key behavior are recorded.
6. Access, consent, retention, correction, deletion, and audit requirements are approved.
7. AI retrieval and prompt behavior are evaluated for unsafe certainty.
8. High-risk output remains behind human review.
9. A named owner approves the maintenance window, monitoring, and rollback decision.

Until those gates pass, use only the read-only validator and preview command.
