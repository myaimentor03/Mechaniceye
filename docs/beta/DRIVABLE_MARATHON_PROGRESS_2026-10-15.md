# Drivable marathon progress ledger — 2026-10-15

This is a separate progress record; `MARATHON_TASK.txt` is the requirements source and is not to be edited. Each requirement below must end in exactly one status: **Verified complete**, **Needs implementation**, **Blocked**, or **Superseded**. A previous report alone is not evidence. Keep payments and customer-content release closed.

## Starting checkpoint

- Checkout: `C:\Users\Hall7\opencode-next\integration`
- Branch: `integration/drivable-beta-0902`
- HEAD: `716e213ac2f25558ee11411342beee6e59233a05`
- Initial full status: dirty; pre-existing user changes listed by Git and preserved. No staged paths; no merge in progress.
- `MARATHON_TASK.txt` initial SHA-256: `4F4B6CD51FA56DC4A99167DF04490F9494524A77B0F4E8E20F467B8773A7BCC9`
- Applicable `AGENTS.md`: none found in the checkout or its parent directories.
- No database access, migration, live-service configuration, Stripe transaction, push, or deployment is authorized. The October 15 continuation work order authorizes reviewed local commits on this existing branch only.

## Requirements

### Resume and source-lane reconciliation

- **Verified complete** — Starting branch/HEAD/status, staged-path list, merge-state check, recent log/reflog recorded in this session. Evidence: terminal snapshot in this run.
- **Verified complete** — All eight named source refs are ancestors of the current HEAD; no unique source commits or paths remain to integrate. The separate paid-delivery branch is not merged; its delivery-consumer idea was adapted selectively after code review, without wholesale merge/cherry-pick. Validation: agent read-only reconciliation plus independent current-ref ancestry check.
- **Verified complete** — `git fetch --quiet origin` completed successfully without changing the checkout or remote. All eight required source refs were rechecked afterward and remain ancestors of current HEAD.

### Security must-fixes

- **Verified complete** — Seller/buyer request logs use redacted structured events; safe-log tests cover contact data and errors. Regression coverage: `server/routes-security.test.ts`; observability tests.
- **Verified complete** — Production error serialization omits raw message, stack, cause, and unsafe codes. Validation: `server/observability/safe-log.test.ts`, `server/observability/observability.test.ts`.
- **Verified complete** — Global state-changing Origin guard and explicit public-intake guard are mounted; route tests cover hostile origins. Validation: auth/security suite and local production-smoke mocks.
- **Verified complete** — Registration response resists email-account enumeration; current tests cover response equivalence. Validation: `server/registration-enumeration.test.ts` in the 30-test auth/security run.
- **Verified complete** — `/api/files/:filename` basename/containment and `nosniff` are implemented; a positive authorized-file response test was added alongside traversal coverage. Validation: `server/routes-security.test.ts` 12/12.

### Evidence, ownership, persistence, review, and approval

- **Verified complete** — Runtime capability reporting now checks the actual configured EvidenceStore adapter rather than the unused legacy R2 configuration helper; a false-positive capability test was added. The legacy module still exists, but it no longer independently advertises upload capability.
- **Verified complete** — Existing S3 private-object storage validates keys, content types/sizes, rollback and missing config; local S3 stub E2E passed, and evidence/storage contract suite passed. No real bucket exercised.
- **Verified complete** — Auth, ownership, consent, limits, reviewer release and persistence contracts have focused coverage; route/auth/evidence/commerce/review suites passed as listed below.
- **Verified complete** — Existing approval binding and stale-version release checks were verified through review and paid-eligibility contract tests; simulated tests only.
- **Verified complete** — Diagnosis intake now cleans up already-uploaded earlier modality objects on a later modality or metadata/public-case persistence failure. Synthetic multipart regression confirms no orphaned local case directory after a later invalid media type. If attachment metadata deletion cannot be confirmed, it fails closed as cleanup-incomplete and retains objects rather than claiming successful cleanup. Real DB behavior remains blocked.
- **Needs implementation** — Fully consolidate or remove the now-unused legacy `server/r2-evidence-storage.ts` implementation; first prove there are no external imports/compatibility requirements and preserve existing media support.
- **Verified complete** — Customer intake client request IDs and Journey evidence IDs no longer rely on `Math.random`; browser request IDs use `crypto.randomUUID()`, and server evidence IDs use Node cryptographic UUID/bytes. Validation: Journey state-machine 81/81, TypeScript no-emit, final production build.

### Buyer Check and commerce

- **Verified complete** — Free Buyer Check remains a non-payment preview with explicit lookup failure/retry behavior and browser state; client draft tests passed. Durable recovery and a generated/persisted Buyer report are not in the frozen scope for this batch.
- **Verified complete** — Paid eligibility denies nonpaid/refunded/mismatched/stale/unapproved or non-durable states; order/review/commerce contract tests passed using fakes. Added a reusable delivery consumer that rechecks release eligibility and durable approval-bound job authorization immediately before provider handoff, records durable receipts before fenced acknowledgement, and rejects non-idempotent/ephemeral dependencies at construction.
- **Blocked** — Production customer delivery remains deliberately disabled. The new durable context resolver, stable-key provider adapter boundary, last-moment entitlement/approval checks, receipt-before-ACK consumer, and opt-in one-shot worker composition are implemented and covered by database-free fakes. Exact prerequisites before enabling: real PostgreSQL restart/replay/rollback validation in an isolated database, a named provider with verified durable idempotency semantics, and end-to-end approval/payment/delivery tests. `POSTGRES_PAYMENT_VALIDATION.verified` remains false; do not enable customer-content release.
- **Blocked** — Real PostgreSQL validation is prohibited in this batch. Exact prerequisite: separately authorized isolated test database with verified `current_database() === "drivable_commerce_test"`; never use `mechaniceye_db`.
- **Blocked** — Payment-provider end-to-end validation is prohibited. Exact prerequisite: separate owner-authorized Stripe test-mode procedure; no real transaction is allowed here.

### Database static review

- **Verified complete** — Static schema/migration parity passes without a database, including the new manual delivery receipt table. The parity script was corrected to document the durable receipt table. No migration was applied.
- **Verified complete** — `node scripts/scan-for-destructive-sql.mjs` passed over current migrations and the local dry-run SQL preview; it is a static scan only and did not connect to a database.
- **Verified complete** — Static review covered consent persistence/revocation, reviewer release persistence, case DB calls, vehicle-knowledge schema/query, and migration shape. Contract tests/parity checks pass; none of these checks connected to PostgreSQL. Four older readiness/security reports and the final integration report now carry dated supersession notices; their underlying historical text remains intact.

### Isolated PostgreSQL validation preparation

- **Verified complete** — Database scripts now require the exact `drivable_commerce_test` name, an explicit isolated-test opt-in, a credential-free URL fingerprint, a separately verified provider instance ID attestation, and an expected server address before client construction. Scripts that connect verify `current_database()` and `inet_server_addr()` before further SQL; the PostgreSQL commerce test verifies identity before creating its temporary schema. Direct `db:push` is disabled because its internal DDL path cannot run the post-connect identity assertion. Validation: `node --test scripts/lib/db-target-safe.test.mjs` 6/6; `node --check` on all guarded scripts. No database was connected.
- **Blocked** — Real database validation remains unverified. Exact external prerequisite: owner-approved isolated `drivable_commerce_test` service ID, matching endpoint fingerprint and server address independently confirmed, plus separate authorization for the serial PostgreSQL test/migration procedure. Never use `mechaniceye_db`.

### Test marathon

- **Verified complete** — Database-free focused test matrix run: auth/security 30/30; evidence/consent/storage/follow-up 75/75; commerce/review/outbox 101/101; paid-delivery consumer/receipt 21/21; Buyer draft/diagnosis submission 6/6; route security after regression additions 12/12; observability/webhook/readiness/load-cert 26/26; production smoke 8/8; beta E2E with local stubs 8/8; public navigation 6/6. PostgreSQL-named contract tests used mocked executors only; the opt-in commerce DB test was excluded.
- **Verified complete** — TypeScript no-emit check exited 0; `npm run build` completed successfully. Build emitted only stale Browserslist data and large client-chunk advisories.
- **Verified complete** — Scoped Git whitespace check passed using `core.whitespace=cr-at-eol` to account for existing CRLF files; `MARATHON_TASK.txt` was excluded and remains byte-identical.
- **Blocked** — Any test requiring a real database or external live service remains blocked pending an explicitly isolated, authorized test environment.

### Local production-like boot

- **Verified complete** — Stubbed production-like beta E2E boot starts a local built server with empty DB URLs and isolated S3/webhook stubs, then validates SPA/API/health/auth/evidence fail-closed behavior. This is not a real production boot or PostgreSQL verification.
- **Blocked** — Live local `/api/health/db` and any DB-backed readiness route cannot be exercised under the no-database-access constraint. Exact prerequisite: separately authorized isolated DB configured as `drivable_commerce_test`.
- **Blocked** — `/api/health/db` or any route that queries PostgreSQL is blocked by the no-database-access constraint.

### Continued launch-blocker review

- **Verified complete** — Scoped search confirmed the explicit mock-report path is labeled mock/test-only and requires human review, mechanics directory refuses fabricated inventory, and upload capability is tied to the actual EvidenceStore. Intake/evidence `Math.random` identifiers were replaced and tested. Remaining disabled/ungrounded diagnosis-results tabs/actions stay disabled/unwired; no readiness flag was raised.
- **Blocked** — Personalized step-by-step repair guide, fix history, chat export, mechanic directory and result actions shown in the older results screen are not production capabilities. Exact prerequisites: safety-reviewed repair content and supported delivery/export implementation; a verified mechanic/provider directory with persisted match workflow; and owner-approved product behavior. Keep controls gated/hidden in a release build until implemented; do not enable feature flags.
- **Verified complete** — Reconciled the final integration report and four older beta readiness/security reports with current local-only evidence; prior percentages and CONDITIONAL GO claims are clearly superseded.
- **Blocked** — Master Intake blueprint cannot be made import-ready safely: the local export still contains live webhook/customer email/sheet references and local workbook headers cannot prove production Google Sheet headers. Exact prerequisites: isolated test webhook, internal-only destinations, verified live tab/column headers, and confirmation of intended handling for unsupported `mechanic-match-request`. No candidate blueprint was created.
- **Verified complete** — Local frontend validation was run without modifying the Make scenario: Buyer draft/diagnosis submission tests, public navigation contracts, typecheck/build, and local stubbed beta E2E all passed. No live Make configuration was changed.
- **Superseded** — Earlier batch instruction forbidding all commits is superseded by the October 15 continuation work order authorizing reviewed local commits on this existing branch. Push remains expressly prohibited.
- **Superseded** — Checklist demand for a readiness percentage/GO claim is superseded by the explicit requirement that payment readiness and customer-content release remain closed; state gates and evidence instead of inventing a percentage.

## Work log

- 2026-10-15 — Starting checkpoint captured. Before changing dirty files, recoverable copies were saved outside the checkout at `C:\Users\Hall7\opencode-next\marathon-recovery-20261015`; pre-existing work remains present. Only two read-only helpers were used.
- 2026-10-15 — Confirmed and fixed the diagnosis evidence cleanup gap, false-positive upload capability gate, and missing positive file-response security assertion. Added the paid-result delivery consumer and durable receipt repository/migration by selective adaptation; did not start a worker or release customer content.
- 2026-10-15 — Migration parity initially failed on the receipt table; updated its optional-manual-table registry after preserving the pre-existing dirty script. Parity then passed.
- 2026-10-15 — Updated the historical final integration report to withdraw its stale percentage/CONDITIONAL GO claims and point to current local-only evidence and closed release policy. Replaced `Math.random` intake/evidence IDs with cryptographic identifiers.
- 2026-10-15 — TypeScript no-emit check passed; production build passed; safe focused suites passed with totals recorded above. No database, live Make/Render/DNS, payment transaction, commit, push, or deployment was used.
- 2026-10-15 — Final built-server E2E with local S3/webhook stubs passed 8/8 after the identifier changes; scoped whitespace check passes with CRLF recognized as end-of-line. The default `git diff --check` reports CRLF as whitespace in pre-existing Windows-style files, so it was not used as a formatter and no broad line-ending rewrite was made.
- 2026-10-15 — Refreshed remote-tracking refs read-only and revalidated all eight source-lane ancestry relationships; branch and HEAD did not change. Statically inspected consent, review, vehicle-knowledge schema/routes/migrations; no DB was opened.
- 2026-10-15 — Paid-result delivery slice: added a strict canonical Journey case read, a durable paid-delivery context resolver bound to current order/case/review state, canonical case-artifact and recipient binding reuse, an idempotency-key provider adapter, a default-off one-shot worker composition gate, and a second authorization/content reread immediately before provider handoff. Database-free tests cover paid/refund/failure states, approval revoke/supersession, changed content, stable-key replay after simulated restart/ambiguous provider response, and disabled worker composition. These tests do not verify PostgreSQL or a real provider contract.
- 2026-10-15 — Read-only reviewers examined the paid-delivery source at branch `integration/drivable-beta-0902`, HEAD `716e213ac2f25558ee11411342beee6e59233a05`. One confirmed coordinator defect: a reduced noncanonical digest blocked normal approval binding, and case-read errors were swallowed. Fixed the coordinator to reuse the review bridge's canonical full-case digest and recipient binding and `getStrict`; added a strict-read regression test. Added canonical PostgreSQL worker composition using existing order, case, review, outbox, receipt, and eligibility repositories. It remains inert by default with the immutable database validation gate false. Focused delivery tests passed 22/22; no database/provider was accessed.
- **Verified complete** — Paid-release coordinator canonical approval binding and strict case-read behavior are aligned with the review bridge; implementation: `server/commerce/paid-release-coordinator.ts`; regression: `server/commerce/paid-release-coordinator.test.ts`; focused delivery suite passed 22/22.
- **Verified complete** — Canonical PostgreSQL worker composition wires current durable repositories but remains disabled by default; implementation: `server/jobs/paid-result-delivery-runtime.ts`; database-free disabled/zero-query regression in `server/jobs/paid-result-delivery-components.test.ts`.
- **Blocked** — Real provider remains an external prerequisite: no named provider/account contract supplied. The adapter requires provider-enforced stable idempotency; synthetic sink tests do not prove provider behavior, and exactly-once delivery is not claimed.
- **Verified complete** — Paid-delivery foundation is committed locally as `900817d78cd0a03437f69121a3fb70b1ea01fc44`; focused tests, typecheck, and production build passed against the full dirty source. Production routing/provider enablement and real PostgreSQL validation remain blocked.
- **Verified complete** — Local isolated-database guards, fake identity checks, and serial runbook are implemented; see the Isolated PostgreSQL validation preparation section above.
- 2026-10-15 — Latest local export rechecked: `C:\Users\Hall7\Downloads\Drivable - Master Intake Router V1.blueprint.json` (2026-10-14 10:57:43). Five route filters are present before OpenAI; branch 1 still uses `buyer-interest`; branch 2 and 3 Sheets filters have leading spaces; all email modules still reference `{{2.result}}` despite branch OpenAI module IDs 30/40/50/10/20. No candidate blueprint was changed or created because the export retains production-facing references and no isolated webhook/internal-only destination or verified live sheet headers are available. Keep `mechanic-match-request` in the internal-review fallback pending its dedicated workflow verification.
- 2026-10-15 — Added the newly reported Make findings: the configured marketplace workbook is reported to lack `Internal_Review` and `Concierge_Requests`; reported tab sizes are Buyer_Interest 27 headers, Seller_Intake 73, and Diagnosis_Cases_v2/Sheet1 27 versus 73 seller-style router mappings. These configured/live-workbook counts remain unverified. The available local operations workbook is a different artifact: it contains `Internal_Review_Log` and `Support_Concierge` rather than those exact tab names, and its Buyer_Interest/Seller_Intake first-row populated counts are 16/25. Do not treat either local workbook as proof of live Google Sheets headers.
- 2026-10-15 — Post-slice validation passed: focused delivery/outbox/receipt/eligibility/Journey tests 66/66; `npx tsc --noEmit --incremental false --pretty false`; `npm run build` (only stale Browserslist-data and >500 kB client-chunk advisories). Tests used fake/in-memory repositories and an isolated synthetic idempotency sink only. No PostgreSQL, Make, Sheets, Render, DNS, or payment provider was contacted. `POSTGRES_PAYMENT_VALIDATION.verified` remains false.
- 2026-10-15 — Final protected-file check before follow-on local commits: branch `integration/drivable-beta-0902`; HEAD then `716e213ac2f25558ee11411342beee6e59233a05`; `MARATHON_TASK.txt` SHA-256 remains `4F4B6CD51FA56DC4A99167DF04490F9494524A77B0F4E8E20F467B8773A7BCC9`. This is a historical checkpoint; later authorized local commits are recorded in subsequent lines.
- 2026-10-15 checkpoint update: paid-delivery focused tests passed 22/22; `npx tsc --noEmit --incremental false --pretty false` passed. The production build is running. All checks use the dirty local checkout and fakes; real PostgreSQL/provider validation remains unverified.
- Delivery checkpoint: implementation commit `900817d78cd0a03437f69121a3fb70b1ea01fc44` (`feat(commerce): add disabled paid-result delivery foundation`) is local on `integration/drivable-beta-0902`; no push/deployment. Remaining dirty and untracked paths are preserved. HEAD at that checkpoint was `900817d78cd0a03437f69121a3fb70b1ea01fc44`; `MARATHON_TASK.txt` SHA-256 was `4F4B6CD51FA56DC4A99167DF04490F9494524A77B0F4E8E20F467B8773A7BCC9`.
- **Next exact task:** obtain owner-approved isolated PostgreSQL test infrastructure; confirm `current_database() === "drivable_commerce_test"` before any authorized DB test, then verify migrations, order/refund replay, approval revocation, outbox restart, and receipts. Separately select a named delivery provider and prove its durable idempotency contract using a non-customer test sink. Keep the production validation constant false and worker disabled until both gates pass. Make scenario corrections remain blocked on the exact configured workbook/live header confirmation and a separate test webhook with internal-only email destinations.
