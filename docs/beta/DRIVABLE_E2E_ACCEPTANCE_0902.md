# Drivable Beta E2E Acceptance — DRIVABLE_E2E_ACCEPTANCE_0902

**Date:** 2026-09-06
**Branch:** `qa/drivable-marathon-e2e-0902`
**Purpose:** Local, fail-closed end-to-end acceptance of the integrated Drivable beta — deployment, routing, CORS, transport guards, session/consent/launch-control gates, private object-storage boundary, buyer-check, reviewer auth, marketplace forwarding, and repository hygiene.

The harness runs against a **built** bundle (`dist/server/index.js` + `dist/client/`) with stubbed S3 and webhook targets and, in the default configuration, **no database** — which is exactly how the beta fails closed when production is not yet wired. Running with a real `DATABASE_URL` unlocks the DB-dependent happy paths (documented at §6), including new opt-in checks that flip into the success path.

---

## 1. Harness Layout

| File | Purpose |
|------|---------|
| `scripts/beta-e2e-smoke.mjs` | Full 92-check smoke matrix; spawns servers, marshals S3/webhook stubs, owns the check/assert/report loop |
| `scripts/lib/spawn-server.mjs` | `findFreePort`, `spawnDrivableServer` (scoped env + `PORT` override), `waitForHttp`, `stopProcess`/`waitForExit`, REPO_ROOT/SERVER_ENTRY |
| `scripts/lib/s3-stub.mjs` | In-memory S3 stub: path-style bucket/key, `Expect: 100-continue`, ops log, `failAllPuts` (500 outage), `failPutIndex` (one-shot 400, non-retryable mid-upload failure) |
| `scripts/lib/webhook-stub.mjs` | Records POST bodies (path, headers, parsed JSON), `failNext`/`failAlways` fault injection, `/health` |
| `scripts/lib/session-token.mjs` | `mintSessionToken` + `sessionCookieHeader` — base64url payload `{id,email,exp,v:1}` + HMAC-SHA256, matching `server/customer-auth.ts` |
| `tests/beta-e2e-smoke.test.mjs` | `node:test` wrapper (smoke in auto mode) + unit tests for session-token and S3-stub failure injection |

### How servers are started

- **Main server:** `node dist/server/index.js` with `NODE_ENV=production`, launch controls **enabled** (`DRIVABLE_LAUNCH_CONTROLS_ENABLED=true`), S3 stub endpoint + webhook stub endpoint, and **no `DATABASE_URL`**. This exercises the fail-closed beta surface truthfully.
- **Legacy server:** same bundle without launch-controls env — the pre-controls path used to prove photo-upload rollback protects the object store even when review controls are off.
- **Weak-token server:** `DRIVABLE_REVIEWER_TOKEN` shorter than 32 chars → every reviewer endpoint must return 503 `REVIEWER_ACCESS_NOT_CONFIGURED`.

All spawned stderr/stdout is captured; checks assert **no PII and no stack traces** ever appear in server output.

---

## 2. Running the Harness

```bash
npm run build        # once, so dist is current
npm run smoke:beta-e2e      # direct run: prints matrix + RESULT: PASS/FAIL
npm run test:beta-e2e       # node:test wrapper (smoke + helper unit tests)
```

- Exit code `0` = every check passed; `1` = one or more failed.
- Add `DATABASE_URL` to the environment to drive the DB-dependent happy paths (§6). No configuration needed for the S3/webhook stubs — the harness sets its own endpoints.

---

## 3. Check Matrix (92/92 passing as of this acceptance)

### Local E2E — deployment, routing, CORS, transport guards
- `GET /` serves the built SPA; SPA deep links (`/clearsale`, `/buyer-check`, `/mechanic-match`, `/marketplace`, `/start`, `/help`) and client-rendered routes return `index.html`
- `GET /api` (unknown API path) → 404 JSON; **`GET /api/health` (bare) → 404** (gap vs convention, see §5)
- `/api/health/live` → 200 `ok:true` with `no-store`
- Readiness without reviewer token → 401; with token + no DB → `ready:false` (fail-closed, truthful)
- `/api/health/db` with token + no DB → 503
- `/api/capabilities` advertises `photoUpload` only when `DRIVABLE_PHOTO_UPLOAD_ENABLED=true`, with `no-store`
- Bundled JS asset from `index.html` is actually served
- CORS: known origin echoes `Access-Control-Allow-Origin`; **`DRIVABLE_PUBLIC_ORIGIN`-derived origin is allowed**; unknown origin gets no ACAO; preflight OPTIONS → 204 for allowed origin; **preflight from a disallowed origin → 204 but never echoes ACAO**; **`Origin: null` (sandboxed iframe / file protocol) never echoed**; **denied-origin responses still set `Vary: Origin`** so a shared cache can never serve one origin's CORS state to another
- Content-type guard for unknown `/api/*`; unsupported method on a live route → 404 JSON; malformed JSON → 400; body over 100 KB (Express default) → 413
- Error responses do not leak stack traces; no PII in server stdout while serving pages

### Drivable intake — fail-closed session, consent, media boundary, rollback
- No session → 401 `CUSTOMER_AUTH_REQUIRED`; tampered cookie → 401; expired session → 401 (HMAC in `server/customer-auth.ts`)
- Text-only intake with valid session + no DB → 503 `persisted:false` (fail-closed)
- **Empty `evidenceIntake` `{}` (schema defaults applied) still fails closed → 503 `persisted:false`, never a fabricated 200**
- **Missing consent field with launch controls + no DB → 503 `persisted:false` (same fail-closed gate as the media path)**
- Intake with photos + no DB **never reaches media upload** — consent/launch controls gate first → 503 `CONSENT_CONTROLS_UNAVAILABLE` before any S3 PUT
- Non-JSON `evidenceIntake` → 400

### R2/S3 mocks — private object storage boundary (legacy-local server)
- Valid photos → objects persist, then DB insert fails → `deleteCase` rolls back every written object (503 `persisted:false`, stub left empty)
- Evidence keys are case-scoped (`evidence/<caseId>/<uuid>.<ext>` + `attachments.json`); original filenames and path-traversal segments never appear in keys
- 9 photos → 413 `LIMIT_FILE_COUNT`; single photo >12 MB → 413 `LIMIT_FILE_SIZE`; `video/mp4` part → 415; PNG bytes labeled JPEG → 507 (MIME mismatch); executable bytes labeled JPEG → 507 (content sniff); 507s write no objects
- S3 outage (`failAllPuts`) → 507 `persisted:false`, no leftovers; mid-upload `failPutIndex` → rollback of the already-written photo (401/4xx injection chosen deliberately: AWS SDK retries 5xx, so the mid-upload fault must be a non-retryable 4xx)
- **Duplicate `clientRequestId` from the same client is never idempotently collapsed or replayed at intake** — two sequential identical submissions each get a distinct case (there is intentionally no idempotency/replay guard at intake; the marker is surfaced for reviewer linkage, not dedup). Confirmed by a dedicated check.
- **S3 outage fails closed with no reroute to process-local storage** (verified in code: the media write path routes exclusively through `evidenceStore`; when object storage is not configured, photos are rejected outright rather than silently written to local files)

### Buyer check — free preview boundary
- Missing year/make/model → 400 with required list; non-integer year → 400; no DB → truthful 503, never a fabricated result
- DB mode (opt-in): an unknown year/make/model → 200 `found:false` with `fallbackPrompts` + `vinRequiredForApplicability` (never an invented pack)

### Auth / review — reviewer auth, launch controls, legacy review, follow-up
- Register: short password → 400 (pre-DB); invalid invite → 403 (pre-DB); valid invite + no DB → 503 fail-closed
- Login: structurally invalid credentials → 401 (no account probing); valid format + no DB → 503 (generic, fail-closed)
- `/api/internal/review/drafts`, release-decision, `/api/internal-review`, `/api/diagnoses/recent`: no token → 401; token + no DB → 503 (launch controls unavailable), except `/api/diagnoses/recent` which is reviewer-gated against in-memory storage → 200 `[]`
- `/api/internal-review` invalid input with token → 400; valid input forwards to webhook → 200
- Follow-up with `vibrationData` → 422 `VIBRATION_CAPTURE_UNAVAILABLE` before any DB lookup
- `/api/files/:filename` path traversal (`..%2F..%2F..`) → 404/403, never 200; plain missing file → 404
- Weak reviewer token (<32 chars) → 503 `REVIEWER_ACCESS_NOT_CONFIGURED` on every reviewer route

### Clearsale / marketplace — forwarding, rate limiting, log hygiene
- Seller intake happy path → forwards complete payload to `MASTER_INTAKE_WEBHOOK_URL` (200); missing required fields → 400; webhook outage → 502 (master intake awaited, truthful)
- `intakeType` packet values verified: seller = `marketplace-seller`, buyer = `marketplace-buyer-interest`, internal-review = `internal-diagnosis-response`
- Public-form rate limit trips at 15/10 min → 429 `RATE_LIMITED`
- No PII in server stdout during marketplace flows
- DB mode (opt-in): diagnosis intake with the master webhook down still succeeds as a stored case → 200 with `webhookForwarded:false` / `webhookConfigured:true` (best-effort forward never blocks intake)

### Repo hygiene
- Client source: zero `onrender.com` / legacy `lifeos.living` hardcoded URLs
- Server source: only allowlisted production URL references
- **Client copy regression: homepage/offer/guidance/FAQ no longer promise audio/video/vibration capture that the photo-first intake rejects** (the offending strings disappeared)
- **Buyer-interest form ships no pipelined sample/default listing title** (the old `2012 Ford F-150 XLT` default that could be submitted by mistake is gone)

---

## 4. Launch-Blocking Fixes Applied by This QA

These were verified broken in the candidate build and fixed + covered by the harness:

1. **Client hit old production origin.** `client/src/marketplace/Marketplace.tsx`, `client/src/components/BuyerCheckPreview.tsx`, and `client/src/TestBackend.tsx` hardcoded `https://mechaniceye-backend-v2.onrender.com/...`, so every marketplace/buyer-check/diagnosis POST would go to the legacy production origin instead of the deployed service. All now use same-origin relative `/api/...` (dev uses Vite proxy `/api → http://localhost:5000`). The `isLocalBrowser` fork was removed.
2. **CORS rejected the canonical production origin.** `server/index.ts` now derives an additional allowed origin from `DRIVABLE_PUBLIC_ORIGIN` (trailing slashes stripped) in addition to the existing allowlist.
3. **Logs leaked customer PII.** Marketplace seller/buyer `console.log(..._RECEIVED)` included name/email/phone/address; marketplace, internal-review, mechanic-match, concierge, diagnosis, and follow-up `console.error(...FAILED, error)` routes logged full error objects (often containing request bodies). All converted to message-only (`error instanceof Error ? error.message : String(error)`).
4. **`/api/files/:filename` path traversal.** Arbitrary file reads were possible via `..` segments; now guarded with `path.basename` + `path.resolve` containment → 404/403.
5. **Homepage/preview copy promised unsupported media capture.** The beta is photo-first (server rejects audio/video with 415, vibration with 422), but offer copy claimed "sounds, photos, video"; the Evidence Support card and FAQ promised "audio, video, and vibration inputs". Now photo-first and consistent with intake.
6. **Buyer-interest form pipelined a sample listing.** `<input name="listingTitle" defaultValue="2012 Ford F-150 XLT" required>` meant an accidental submit would create a queue entry for a fake listing; replaced with a placeholder and no default.

---

## 5. Findings / Gaps Recorded (not fixed — recommendations)

| Finding | Impact | Recommendation |
|---------|--------|----------------|
| `GET /api/health` (bare) returns 404 — only `/live`, `/readiness`, `/db` exist | Monitor probes hitting the bare path get 404 | Add `/api/health` → 200 aggregate, aligning with the ladder convention |
| The public-form rate limiter is a **single shared** `FixedWindowRateLimiter` instance (15/10 min, key `scope:public-form:sha256(ip)`) across seller-intake, buyer-interest, mechanic-match, and concierge | A burst on one form throttles every other public form from the same IP | Confirm intended; if not, key by route |
| S3 evidence store lacks retention / `delete_after` metadata on objects | Old evidence is never pruned | Add lifecycle/retention design before GA |
| Correcting prior assumption: `intakeType` for seller webhook packet is `marketplace-seller` (not `marketplace-seller-intake`) | Documentation/assets mapping | Keep `DRIVABLE_MASTER_WORKBOOK_*` docs aligned |

---

## 6. Database-Backed Mode (opt-in)

The harness defaults to no `DATABASE_URL` to prove fail-closed behavior. Set `DATABASE_URL` to a scratch/private Postgres (e.g. Neon) and the same checks run, now expecting successes in place of the 503s for: login/register success, text-only intake 200, buyer-check results, drafts/release-decision flows. Two added DB-mode checks flip into the success path and assert the post-persistence contract: (a) buyer-check for an unknown vehicle → 200 `found:false` with `fallbackPrompts` + `vinRequiredForApplicability` (never an invented pack); (b) diagnosis intake with the master webhook down → 200 `webhookForwarded:false` / `webhookConfigured:true` (a stored case happens even when forwarding is best-effort). These checks skip cleanly in auto mode (no `DATABASE_URL`). The smoke script header documents exactly which checks flip. This is intentionally manual — CI here must not need a database.

---

## 7. Mobile / iPhone Manual Checklist (still required on device)

Local automation proves transport and gating; nothing replaces a real-device pass:

- [ ] iPhone 15/16 (iOS 17+): homepage loads, vehicle year/make/model dropdowns scrollable and selectable
- [ ] Photo upload opens camera roll, multi-select works, previews render
- [ ] Consent checkboxes tappable and visually checked; submission reflects all acknowledged items
- [ ] No horizontal scroll, no overlapping text, safe area (notch/Dynamic Island) respected
- [ ] First contentful paint < 3 s on 4G; no layout shift after render
- [ ] VoiceOver can navigate the intake form; inputs have labels; contrast meets WCAG AA
- [ ] Marketplace + buyer-check pages submit to the same origin they are served from (verify in Network tab)

---

## 8. Post-Verification Flow

1. `npm run check` && `npm run build` → clean
2. `npm run smoke:beta-e2e` → 92/92 PASS
3. `npm run test:beta-e2e` → 6/6 PASS
4. All pre-existing unit suites (`test:*` scripts) still pass
5. Device manual checklist (§7) on staging
6. Wire production env vars, then run the deployment acceptance (`docs/beta/DRIVABLE_DEPLOYMENT_ACCEPTANCE_0902.md`) against the live origin