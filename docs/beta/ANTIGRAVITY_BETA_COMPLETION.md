# Drivable / Mechanic's Eye — Beta Completion Report

**Branch**: agy/beta-audit-0901  
**Status**: COMPLETE (code-complete, validated; owner deployment actions remain)  
**Worktree**: C:\Users\Hall7\agy-worktrees\beta-audit  

---

## 1. Beta Execution Overview & Scope

This report documents all completed engineering work, security hardening, flow completions, tests, and remaining external dependencies to drive Drivable / Mechanic's Eye to production beta readiness.

### Parallel Work & Boundary Rules
- **Codex Worktrees**: Untouched and isolated. Active Codex work on mobile evidence delivery / Cloudflare R2 durable storage is treated as an external lane.
- **Main Branch**: Not pushed or merged. All commits stay on Antigravity branches.
- **Database Operations**: Safe, non-destructive queries only. No db:push against production, no migrations against production.

---

## 2. Beta Readiness Workstreams & Lanes

| Workstream | Focus | Status |
|------------|-------|--------|
| Lane 1: Buyer Check End-to-End | NHTSA context lookup, dynamic risk assessment, buyer intake, relative API routing, seed knowledge packs | Complete |
| Lane 2: Drivable Beta Hardening | Relative API routing, duplicate submission guard, unsupported vehicle handling, error resilience | Complete |
| Lane 3: ClearSale & Shared Flows | Seller intake, buyer interest, webhook best-effort delivery, dead route elimination | Complete |
| Lane 4: Release, QA & Security | File path traversal fix, CORS hardening, health checks, PII logging sanitization, smoke test suite | Complete |

---

## 3. Completed Engineering Items

### 3.1 Security (P0/P1)
- `/api/files/:filename` path traversal fixed: rejects `..`, `/`, `\` and verifies the resolved path stays inside the uploads directory. Verified via smoke test (403).
- PII logging sanitized:
  - Diagnosis intent log now logs vehicle/problem summaries, not the raw request body.
  - Full public case packet dump replaced with a debug log of `{id, status, source}`.
  - Marketplace seller/buyer intake logs no longer include name/email/phone.
- Error-message leak removal: follow-up creation, start consultation, and consultation feedback return generic messages instead of raw `error.message`.
- Database error strings redacted (credentials/host/path stripped, `postgres://` URL regex) in `public-case-db.ts` and Prettier-error path scrubbing in `db.ts`.

### 3.2 Reliability & Resilience (P1/P2)
- **Duplicate submission guard**: deterministic case IDs (`CASE-<clientRequestId>`, 8+ chars) when a `clientRequestId` is supplied. Client persists a `clientRequestId` in `sessionStorage` and sends it with each submission, so the DB insert (with `onConflictDoNothing`) dedupes refreshes/retries.
- **Webhook best-effort delivery** for all user-facing intakes: marketplace seller intake, buyer interest, mechanic match, and concierge requests now return `{ok, received, webhookConfigured, webhookForwarded}` instead of throwing when `MASTER_INTAKE_WEBHOOK_URL` is unset or the forward fails. No real user submission is rejected.
- **`persisted` flag on `/api/diagnoses`**: the API now reports whether the case was actually stored in the DB, so clients can distinguish "received" from "received + persisted".
- **Health checks**: `/api/health` (non-DB) and `/api/health/db` (graceful 503 without `DATABASE_URL`).
- **Buyer-risk endpoint** switched from a per-request `pg.Client` to the shared `getDb()` pool (reduces connection churn).
- Server starts cleanly and serves the SPA without `DATABASE_URL` (error paths exercised in the smoke test).

### 3.3 Same-Origin / Deployed URL fixes (P1)
- `TestBackend.tsx`: `PUBLIC_API_ENDPOINT` → `/api/diagnoses`; simplified submission loop; friendly HTTP/timeout/JSON error messages.
- `BuyerCheckPreview.tsx`: knowledge endpoint → `/api/buyer-risk/vehicle-knowledge`; checks `response.ok` before parsing JSON.
- `Marketplace.tsx`: seller-intake and buyer-interest endpoints → relative; dead `isLocalBrowser` branches removed.

### 3.4 Flow Completions
- **Result receipt**: diagnosis submission now shows a real "Case Received" screen with the Case ID and a `WhatHappensNext` explainer.
- **Legacy dead code removed**: the unreachable legacy `SellPage` (no `setPage("sell")` call anywhere) was removed from `TestBackend.tsx`. The live ClearSale flow lives in `Marketplace.tsx` at `/marketplace/sell`.
- **NHTSA knowledge packs prepared**: generated validated dry-run packs (30/30 success) for every vehicle in `data/nhtsa/batch-lists/tier1-marketplace-vehicles.csv` into `data/nhtsa/vehicle-knowledge-packs/` (gitignored by design). Owner applies them to the DB with `npm run nhtsa:batch -- --apply`.

### 3.5 Schema / baseline fixes (pre-existing, integrated)
- `server/db.ts` now imports from `shared/schema` instead of the stale duplicated `server/shared/shared/schema` (leftover from a split/merge).
- CORS hardening in `server/index.ts` restricts cross-origin requests to known Render/Drivable origins.

---

## 4. Verification & Validation

All of the following pass clean:

- `npm run check` — TypeScript strict checks
- `npm run build` — Vite client build + SPA route fallbacks + esbuild server bundle
- `node scripts/smoke-test.mjs` — 7/7 automated smoke checks:
  1. Server starts and `/api/health` responds
  2. `/api/health/db` returns 503 gracefully without `DATABASE_URL`
  3. POST `/api/diagnoses` returns a case receipt (`id=CASE-smoke-test-0001`, `status=received`)
  4. SPA fallback serves `index.html` for a deep link (`/buyer-check`)
  5. `/api/files` blocks path traversal (403)
  6. Unknown API route returns 404
  7. POST `/api/marketplace/seller-intake` returns a receipt even when no webhook is configured (`webhookConfigured=false`, still 200)

---

## 5. Codex Integration Points & External Lane Interfaces

- **Mobile Evidence Uploads / Cloudflare R2**: Frontend continues to pass structured evidence fields (photoFileNames, photoEvidenceStatus, audio/video/vibration). Backend stores evidence references in the `diagnoses` DB row. Once the Codex R2 lane is merged, the client can attach R2 presigned URLs/storage keys to the existing payload fields and multipart upload path without schema disruption. The `/api/files` traversal fix is compatible with R2 (served via presigned URLs).

---

## 6. Owner-Required Actions (deployment)

1. Set `DATABASE_URL` in the production environment (Render).
2. Set `MASTER_INTAKE_WEBHOOK_URL` if external Make.com automation is desired (otherwise all intakes are acknowledged locally and logged).
3. Apply the generated NHTSA vehicle knowledge packs to the DB: `npm run nhtsa:batch -- --apply` (requires network + `DATABASE_URL`). We deliberately did NOT run `--apply` — no destructive DB writes were performed.
4. Merge `agy/beta-audit-0901` into `main` and deploy. Do not merge conflicting `codex/*` lanes into this branch.
5. Post-merge, CAUTION: re-run `node scripts/smoke-test.mjs` against the deployed environment.