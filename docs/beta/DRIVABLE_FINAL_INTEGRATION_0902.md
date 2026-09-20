# Drivable Beta Final Integration Report 0902

**Branch:** `integration/drivable-beta-0902`
**Final SHA:** `7ae5b15` (`ci: verify integration candidate branches`)
**Base:** `opencode/launch-hardening-rescue-0902` (`8eba023`)
**Operator:** OpenCode Worker 1 (Drivable Beta Lead Integrator)
**Updated:** 2026-09-19 (integration verification session; see §9 for what changed)

---

## 1. Source Branches Integrated

| Source branch | Tip | Merged at |
|---|---|---|
| `opencode/launch-hardening-rescue-0902` | `8eba023` | Base of integration |
| `agy/beta-audit-0901` | `32e0083` | `c91532b` |
| `opencode/mobile-r2-rescue-0902` | `61a3775` | `aa3bd4f` |
| `opencode/buyer-commerce-rescue-0902` | `bcd917f` | `9c95097` |
| `opencode/launch-docs-rescue-0902` | `8069f0e` | `5213d67` |
| `fix/drivable-security-remediation-0902` | `c4ebf10` | `6dffaf3` + `2ab0cd0` |
| `qa/drivable-production-smoke-0902` | `c14ce84` | `d147735` |
| `qa/drivable-marathon-e2e-0902` | `4726b45` | `3502c1e` |
| `prep/drivable-production-data-0902` | `6ae6bdc` | `c8c0e67` |
| `audit/drivable-data-readiness-0902` | `04af448` | `6f02ad5` |

`origin/wire-frontend-prod` was **deliberately not merged** (frontend-only production concern out of scope for this beta integration).

---

## 2. Conflicts Resolved File-by-File

Deliberate hand-resolution (both/newest-safe-behavior wins), never ours/theirs wholesale.

| File | Resolution |
|---|---|
| `server/routes.ts` | Hand-resolved: single `/api/health` aggregate `{ok,live}` (QA) with `no-store`; `Vary: Origin` before origin-denied 403; photo-first intake with 413/415/507 gates; `buildDiagnosisApiResponse` 3rd arg `persisted=false`; mirror-failure logged via safe `logEventError` (no raw `console.error`); **path traversal on `/api/files/:filename` now returns 404 (Not Found) instead of 400 (Bad Request)** — preserves key secrecy, does not reveal path-detection to callers (landed via `fdb13e5`, superseding the earlier 403 turnout) |
| `server/index.ts` | Hand-resolved: CORS same-origin rules from security-remediation + default express.json/urlencoded limits (100kb) so over-limit JSON yields 413 |
| `server/origin-guard.ts` | Multi-platform `requireAllowedOrigin`/`enforceOriginForStateChanging` merged; `Vary: Origin` added to all origin-denied 403 responses |
| `client/src/TestBackend.tsx` | Deliberate hand-resolution (launch-hardening + QA behaviors merged) |
| `package.json` / `package-lock.json` | Deliberate hand-resolution (all test scripts preserved) |
| `scripts/beta-e2e-smoke.mjs` | Origin-enforcement acceptance check updated to assert 403 `ORIGIN_NOT_ALLOWED` + no ACAO + `Vary: Origin` (security mandate wins over QA's previous 200-with-Vary expect) |
| `server/case-storage.ts` | Case IDs are now always server-generated (`CASE-<epoch>-<randomBytes(4).hex>`); `createStoredDiagnosisCase`/`createPublicDiagnosisCase` no longer seed IDs from client markers, so duplicate client request IDs can never collide on case identity |
| `server/public-case-db.test.ts` | Removed leftover conflict markers + UTF-8 BOM (commit `65f47c6`) |
| `migrations/0002_drivable_core_schema.sql` | Removed 2 leftover marker hunks (BOM/mojibake only) |
| `migrations/0003_drivable_data_integrity_hardening.sql` | Removed 2 leftover marker hunks (BOM/mojibake only) |
| `scripts/acceptance-buyer-data-readiness.mjs` | Removed 4 leftover marker hunks |
| `scripts/db-push-guarded.mjs` | Removed 2 leftover marker hunks |
| `scripts/inventory-nhtsa-batch-lists.mjs` | Removed 2 leftover marker hunks |
| `scripts/lib/db-target-safe.mjs` | Removed 2 leftover marker hunks |
| `scripts/run-safe-preflight.mjs` | Removed 2 leftover marker hunks |
| `scripts/verify-migration-schema-parity.mjs` | Removed 3 leftover marker hunks |
| `docs/beta/DRIVABLE_DATA_MIGRATION_AND_IMPORT_RUNBOOK_0902.md` | 15 mojibake-only hunks → theirs; scope table (line 23) and outbox/schema-drift paragraph (line 395) hand-merged |
| `docs/beta/DRIVABLE_PRODUCTION_DATA_READINESS_0902.md` | Leftover marker hunks removed |

**Verification:** `git grep '^(<<<<<<<|=======|>>>>>>)')` reports **zero** conflict markers in the tree.

---

## 3. Build, Typecheck, and Test Results (final, at `7ae5b15`)

| Check | Result |
|---|---|
| `npm run check` (tsc) | PASS, clean |
| `npm run build` | PASS (`dist/server/index.js` 242.5kb) |
| Full safe test grid (30 package scripts) | **30/30 PASS** |
| `npm run test:safe-contracts` (broad glob) | **157/157 PASS** |
| `npm run test:beta-e2e` | **7/7 PASS** (104/104 smoke checks) |
| `npm run test:client-nav` + `npm run test:buyer-draft` | **8/8 PASS** |
| `npm run verify:migration-parity` | PASS (migrations match `shared/schema.ts`, no DB required) |
| `npm run verify:no-destructive-sql` | PASS (no destructive statements in migrations or seed preview) |

Suites included: evidence, security, auth, identity, rate-limit, readiness, consent (+postgres/intake/revocation), origin-guard, routes-security, safe-log, webhook-fetch, registration-enum, review (+async/postgres/writer/adapter/routes), follow-up-boundary, delivery, observability, media-contract, load-cert, production-smoke, storage-persistence, persistence-truth, public-case, client navigation contract, buyer evidence draft.

---

## 4. Server Startup / Health Endpoints (local production-like boot, no DB, no storage creds)

- Boot: `node dist/server/index.js` prints `Server running on port <PORT>`.
- `GET /api/health/live` → 200 `{"ok":true}`
- `GET /api/health` → 200 `{"ok":true,"live":true}` (single aggregate, `no-store`)
- `GET /api/health/readiness` → 401 without reviewer token, else 503 with the launch-readiness report while any durability gate is red (fail-closed, correct); 200 only in a fully provisioned deploy
- `GET /api/health/db` → 503 `{ok:false}` with redacted reason when `DATABASE_URL` is absent (verified no URL/credential echo)
- `GET /` → 200 `text/html` SPA fallback
- `/api/capabilities` → `photoUpload:false`, `audioUpload:false`, `videoUpload:false`, `vibrationSensorCapture:false` when storage/flag not configured (fail-closed)

---

## 5. Remaining P0 / P1 / P2 Blockers

**None at code/branch level.** All P0 findings (console.error leakage) and P1 findings (origin enforcement, registration enumeration, file-access width, duplicate case IDs, 413/415 contract) are closed in this branch. The only paces left are deployment-time provisioning (Section 6) and the documented Owner actions (Section 7) — not code blockers.

---

## 6. Environment Requirements

### DATABASE_URL
- **Required** for: registration/login, session persistence, review records, consent records, delivery outbox (migration `0004` exists, provisioning only — not wired), `/api/health/db`.
- Without it the server boots, serves the SPA, and fails closed on DB-backed routes (verified). Neon `postgresql://user:pass@host/db?sslmode=require`.
- Must run `npm run db:push` (guarded, requires explicit target confirmation) in staging once for schema, then verify `/api/health/db` 200.

### R2 / S3 object storage
- `DRIVABLE_EVIDENCE_S3_*` (bucket, region, endpoint, access key id, secret, force-path-style) required to enable photo upload. Until set, `/api/capabilities` reports `photoUpload:false` and intake rejects with 507 — the designed fail-closed behavior.
- Mobile media (audio/video/vibration) is **not supported in this release**: advertised `false` and rejected at intake with 415 (photo-first contract).

### Feature flags
- `DRIVABLE_PHOTO_UPLOAD_ENABLED=true` only after storage verified (test with `TEST_WRITE=true`).
- `DRIVABLE_LAUNCH_CONTROLS_ENABLED=true` only after review migration verified in staging.
- `DRIVABLE_AI_MODE=mock` default; `live` requires `OPENAI_API_KEY`.

---

## 7. Exact Owner Actions Before Deployment

1. Set REQUIRED env vars in Render: `DATABASE_URL`, `DRIVABLE_REVIEWER_TOKEN` (≥32 chars), `DRIVABLE_SESSION_SECRET` (≥32 chars), `DRIVABLE_BETA_INVITE_CODE`, `DRIVABLE_PUBLIC_ORIGIN`.
2. Create the S3-compatible bucket (R2/AWS), block all public access, scope IAM to bucket+prefix, set the six `DRIVABLE_EVIDENCE_S3_*` vars.
3. In staging: run `npm run db:push` (guarded) to apply schema; verify `/api/health/db` returns 200 with the reviewer token; verify `users.password` contains only `scrypt$...`.
4. Run `npm run preflight:safe` before migration; `npm run verify:migration-parity` before push.
5. Run the production smoke against the deployed URL (`npm run smoke:beta-e2e`), confirm readiness 200.
6. Confirm `/api/capabilities` toggles `photoUpload` true/false with storage env (no secrets leak in logs or client responses).
7. Enable `DRIVABLE_LAUNCH_CONTROLS_ENABLED` after staging review pass; set `DRIVABLE_PHOTO_UPLOAD_ENABLED=true` after a `TEST_WRITE=true` upload/retrieval round trip.
8. Run the iPhone mobile acceptance checklist (docs/beta/DRIVABLE_DEPLOYMENT_ACCEPTANCE_0902.md §7).
9. Begin controlled tester traffic; keep rollback steps (§6 of acceptance doc) available.

---

## 8. Verified Beta-Readiness

- **Code/branch readiness: ~95%.** All integrated work type-checks, builds, passes every safe automated suite (30/30 scripts, `safe-contracts` 157/157, beta E2E 7/7 with 104/104 smoke checks, client-nav + buyer-draft 8/8), the production-ready built server boots and serves the SPA with fail-closed security/storage/database behavior, and no conflict markers or secrets remain in the tree.
- **Remaining ~5% (owner-dependent, not code):** live Neon provision + guarded `db:push`, live R2/S3 provisioning, real (non-stub) webhook and `.onrender.com` smoke, iPhone device verification, AI live-mode validation. These are exactly the actions in Section 7.
- **Deliberate product boundaries this release:** photo-first evidence intake (no audio/video vibration), evidence upload disabled until storage is configured, and origin enforcement returns 403 (with `Vary: Origin`) for disallowed state-changing cross-origin requests. Path traversal on `/api/files` returns 404 (Not Found) to avoid revealing detection.

---

**GO / CONDITIONAL GO / NO-GO: CONDITIONAL GO**

All code and branch requirements are met. Deployment requires owner actions in Section 7 (DB provisioning, R2/S3 bucket setup, feature flag configuration). With those actions completed, the beta is ready for controlled tester traffic.

---

## 9. Integration Verification Session (2026-09-19, at `7ae5b15`)

### 9.1 Scope confirmed
Fetched `origin`, verified every candidate branch tip is already an ancestor of HEAD (0 commits behind), confirmed zero conflict markers, clean `npm run check` / `npm run build`.

### 9.2 Test-grid fixes found and applied
- **Removed corrupt untracked scratch files** `server/guided-journey.ts` and `server/guided-journey.test.ts`. They contained leaked runtime session prompts and broken syntax (they were an accidental export at some earlier point, not referenced by any import or route). They matched the `server/**/*.test.ts` glob and broke `test:safe-contracts`. **Moved, not deleted**, to `C:\Users\Hall7\AppData\Local\Temp\opencode\scratch-guided-journey\` so any wanted content is preserved. Verified zero remaining references. `test:safe-contracts` → **157/157 PASS**.
- **Root-caused `test:beta-e2e` failures to a machine-dependent path.** On an operator machine that happens to have `C:\MechanicsEye_Operations` present, `canUseLocalCaseStorage()` (win32 + ops root exists) returned `true`, so smoke scenarios took the local ops-store path (202 + retained S3 evidence) instead of the production-like fail-closed path (503 + rollback).
  - Added an explicit opt-out in `server/routes.ts`: `canUseLocalCaseStorage()` returns `false` when `DRIVABLE_DISABLE_LOCAL_CASE_STORE === "true"`. No behavior change on machines without the ops root; this makes the leeward local fallback impossible to hit by accident in test/CI environments.
  - Added `DRIVABLE_DISABLE_LOCAL_CASE_STORE: "true"` to the three spawned servers in `scripts/beta-e2e-smoke.mjs`.
  - Rebuilt the server bundle; `npm run test:beta-e2e` → **7/7 PASS** with **104/104 smoke checks**.

### 9.3 Wired two previously unwired tests
- `npm run test:client-nav` (4 tests) — public navigation contract.
- `npm run test:buyer-draft` (4 tests) — client buyer-evidence draft safety.
Both pass. Added to `package.json` so they are discoverable/runnable in future sessions.

### 9.4 Evidence storage architecture (reconciled, verified, unchanged)
- **Photos (only supported media in this release):** unified `EvidenceStore` served by `S3PrivateEvidenceStore` (`DRIVABLE_EVIDENCE_S3_*`), case-scoped keys, generated UUID filenames, verified-byte MIME typing, rollback on partial failure, retention metadata, idempotent delete. Fallback `RuntimeFileEvidenceStore` is explicitly non-durable and intake still requires `durability === "private_object_storage"` (507 otherwise) — fail-closed.
- **Mobile media (audio/video/vibration):** not supported; intake returns 415 before any storage (asserted), follow-up returns 422 for input vibration. `server/r2-evidence-storage.ts` (Cloudflare `R2_*` vars) is a **legacy seam with no reachable production path** in this release — documented, left intact for a future mobile-release wiring, not a blocker.
- **Contract + durability gate:** `server/media/private-object-storage.ts` and `assertDurableScalablePrivateStorage` guarantee any reviewer/release decision and any production capability report can never rely on process-local or non-scalable storage.
- Every grep/read confirms follow-up media is labeled "stored but never analyzed as model input" (`buildFollowUpEvidenceBoundary`), matching the customer-facing contract.

### 9.5 Security re-verification (no new findings)
P0/P1 items remain closed with regression suites: structured redaction logger (`safe-log`), PII/VIN/phone scrubbing (`privacy`), error objects never surface message/stack/cause (`errors`), origin enforcement with `Vary: Origin` (`origin-guard`), rate-limited reviewer/customer/auth + public/buyer endpoints, identical registration responses, cryptographic case IDs, `basename`+nosniff file serving returning 404 on traversal. Only console writes in the tree are the port startup line and dev-only Vite logging.

### 9.6 Database static review (no writes; no DB touched)
- `server/db.ts` redacts full URL, username, password, host, database name in every error path plus a URL-pattern fallback regex.
- `migrations/0001-0004` are idempotent (`IF NOT EXISTS`), free of destructive SQL (scanner PASSED), and migration/schema parity PASSED against `shared/schema.ts` (no database required).
- `0003` hardening constraints are `NOT VALID` (never re-scan existing rows); `0004` outbox is explicitly documented **NOT WIRED** and stores only opaque identifiers / delivery metadata (no PII, no raw bodies, no VINs).

### 9.7 Local production-like boot (built bundle, no DB, no storage creds)
Booted `dist/server/index.js` with launch flags set but no `DATABASE_URL`/S3 creds:
- `/api/health`, `/api/health/live`, `/`, `/api/capabilities` all correct (capabilities all `false`).
- `/api/health/readiness` → 401 unauthenticated, 503 with valid reviewer token while durability gates are red.
- `/api/health/db` → 503 with redacted error. Process exited cleanly on stop.

### 9.8 Backlog sweep
No TODO/FIXME/`@ts-ignore`/`@ts-expect-error` markers in server, client, commits script dirs, or tests. Client has zero localhost URLs; server has only the dev-origin allowlist and test harnesses. No stale references to the removed `guided-journey` module.

### 9.9 Known side effect to disclose (this worktree)
Before the 9.2 fix, the operator machine's earlier smoke runs briefly exercised `createStoredDiagnosisCase`, which writes case folders/tracker rows under the real `C:\MechanicsEye_Operations` ops directory. Those artifacts were created on this machine only and cannot be reverted per integration rules (no deletion of ops data); they are not part of the repo and are restricted to the operator's local ops root. All smoke runs since the fix write to the S3 stub only.

### 9.10 Files changed in this session
- `server/routes.ts` (+1): `DRIVABLE_DISABLE_LOCAL_CASE_STORE` opt-out in `canUseLocalCaseStorage()`.
- `scripts/beta-e2e-smoke.mjs` (+7): env flag on the three spawned servers.
- `package.json` (+2 scripts): `test:client-nav`, `test:buyer-draft`.
- `docs/beta/DRIVABLE_FINAL_INTEGRATION_0902.md`: this update.

---