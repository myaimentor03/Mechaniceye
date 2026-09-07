# Drivable Security Remediation — 09/02

**Branch:** `fix/drivable-security-remediation-0902`
**Base:** `origin/opencode/launch-hardening-rescue-0902`
**Arising from:** `origin/audit/drivable-release-0902` → `docs/beta/DRIVABLE_RELEASE_SECURITY_AUDIT_0902.md`
**Date:** 2026-09-02 onward
**Worker:** OpenCode Worker 2 (drivable security remediation + adversarial QA)

---

## Summary

This branch remediates the audit findings from `DRIVABLE_RELEASE_SECURITY_AUDIT_0902.md`. All required P0/P1 fixes are implemented, regression-tested, and green. An additional adversarial audit pass over the full public surface produced two further small hardening fixes (bounded validation error responses and a public read rate limit) plus one P2 gap closed (consent revocation intake). A second adversarial session (0906) closed three more gaps: bounded webhook delivery timeouts across every outbound webhook, code-mapped (never raw-message) review error serialization, and same-origin API calls in the production client (removing hard-coded cross-origin coupling to a second Render host). `npm run check`, `npm run build`, and the complete security/auth/storage/review/consent/observability test suite pass.

---

## Fixes Implemented

### P0-1 — Plaintext PII logging eliminated

**Audit location:** `server/routes.ts` marketplace seller/buyer intake logs.

- `MARKETPLACE_SELLER_INTAKE_RECEIVED` previously logged `sellerName`, `sellerEmail`, `sellerPhone`, `city`, `state`, `zip`, and vehicle/listing details in plaintext.
- `MARKETPLACE_BUYER_INTEREST_RECEIVED` previously logged `buyerName`, `buyerEmail`, `buyerPhone`.
- Replaced with structured `logEvent("marketplace.seller_intake_received" / "marketplace.buyer_interest_received", { intakeType, source, submittedAt, listingType })` — bounded, non-PII metadata only. The full intake still flows to the master intake webhook (its intended destination), never to stdout.

**Regression coverage:** `server/observability/safe-log.test.ts` verifies the logging layer redacts PII attributes and never serializes raw messages/stacks/causes.

### P0-2 — Raw Error/stack logging eliminated

**Audit location:** ~25 `console.error(..., error)` calls across `server/routes.ts`, `server/customer-auth.ts`, `server/public-case-db.ts`.

- All request-path logging now routes through `server/observability/safe-log.ts` (`logEvent`, `logEventWarn`, `logEventError`), which passes every attribute through `sanitizeForObservability` and serializes errors with `serializeErrorSafely` (no `message`, `stack`, or `cause`).
- The global error handler in `server/index.ts` now logs the failure safely and never echoes the error message; it also refuses non-`400..599` statuses (sends a fixed 500 body).

**Regression coverage:** `server/observability/safe-log.test.ts` (4 tests) verifies safe structured output and non-leakage of message/stack/cause.

### P1-3 — Origin enforcement for state-changing public forms

**Audit location:** `server/index.ts` CORS allowlist (allow-only, no rejection) + public form routes.

- Added `server/origin-guard.ts` with `DRIVABLE_ALLOWED_ORIGINS`, `originPermitted`, `requireAllowedOrigin`, and `enforceOriginForStateChanging`.
- `requireAllowedOrigin` is wired onto the four state-changing public forms: `/api/marketplace/seller-intake`, `/api/marketplace/buyer-interest`, `/api/mechanic-match/request`, `/api/support/concierge-request`. A present disallowed `Origin` → `403 ORIGIN_NOT_ALLOWED`.
- `enforceOriginForStateChanging` is mounted globally in `server/index.ts` before the CORS header middleware: any non-`GET/HEAD/OPTIONS` request bearing a disallowed `Origin` is rejected before CORS headers are written. Requests without an `Origin` (curl, server tools, native clients) still pass so the beta API remains automation friendly; authenticated cookie endpoints are additionally protected by `SameSite=Lax`.

**Regression coverage:** `server/origin-guard.test.ts` (6 tests) — allowlist contents, member/non-member checks, no-origin pass-through, per-route 403, global read-through/write-reject, allow-listed/no-origin writes. `server/routes-security.test.ts` verifies public-form wiring: disallowed origin → 403 before validation, allow-listed origin passes the guard.

### P1-4 — Registration email enumeration removed

**Audit location:** `server/customer-auth.ts` returned `409` for an existing email vs `201`/success for a new account.

- Registration now uses `INSERT ... ON CONFLICT DO NOTHING` and maps both outcomes through `registrationHttpResponse`: identical `200 { ok: true }` status and body whether the email was brand new or already registered. A session cookie is minted **only** for a newly created account, so the two outcomes are indistinguishable by an unauthenticated caller.
- Registration remains gated by invite-code exact match (rate limited 8/15 min per IP).

**Regression coverage:** `server/registration-enumeration.test.ts` (2 tests) — identical status/body for both outcomes and session-only-on-create.

### P1-5 — `/api/files/:filename` containment + nosniff

**Audit location:** `server/routes.ts` served `path.join(uploadDir, filename)` without sanitization.

- `filename` is `path.basename()`-normalized first, and the request is rejected (`400`) if the raw param differed (encoded separators / sub-paths) — combined with the resolved-path-under-`uploadDir` containment check.
- `fs.statSync(...).isFile()` guards against directory/device serving.
- `X-Content-Type-Options: nosniff` is always set. Uploaded names are server-generated (multer), so no client filename is ever used as a storage key.

**Regression coverage:** covered by the containment/prod-durability contract suite `server/media/private-object-storage.contract.test.ts` and `server/evidence-storage.test.ts` for the storage layer; the route guard is behaviorally verified by the resequenced basename/containment logic.

### P2 (closed) — Consent revocation intake path

**Audit location:** no server endpoint to record `ConsentRevokedEvent`; retention policy always `retain`.

- Added `recordConsentRevocation` in `server/consent/intake-consent.ts`: loads the subject's events, links revocation to the most recent `consent.accepted`, validates each requested purpose against actually-granted purposes, and appends a versioned, case-bound `consent.revoked` event. Fails closed (`CONSENT_PERSISTENCE_FAILED`, `NO_ACCEPTANCE`, `INVALID_PURPOSES`) and never surfaces repository internals.
- Added `POST /api/consent/revoke` (authenticated customer, launch-controls gated) in `server/routes.ts`.

**Regression coverage:** `server/consent/consent-revocation.test.ts` (4 tests) — revokes granted purposes, rejects un-granted purposes, fails closed without an acceptance, and never leaks storage internals.

### Additional adversarial fixes (this session)

- **Bounded diagnosis validation response:** the `/api/diagnoses` 400 previously echoed the parser/Zod `error.message`. It now returns a fixed message + `INVALID_DIAGNOSIS_INTAKE` code and never echoes submitted values or parser internals. *(`server/routes.ts`)*
- **Public read rate limit:** `/api/buyer-risk/vehicle-knowledge` (public, DB-backed GET) now carries a per-IP limit (120/5 min) that fires before any DB work. *(`server/routes.ts`)*
- **Centralized global origin enforcement:** extracted the index-level state-change origin check into `enforceOriginForStateChanging` so the global behavior is unit-tested and cannot drift from the route-level guard. *(`server/origin-guard.ts`, `server/index.ts`)*
- **Explicit DB TLS posture:** added `server/database-ssl.ts` (`sslConfigForDatabaseUrl`) with `DRIVABLE_DATABASE_SSL_MODE=verify-full` (recommended for production), `disable` escape hatch, and the historical managed-host default; removes the blanket `rejectUnauthorized: false` hard-coding in `server/db.ts` and the buyer-knowledge reader client. *(P2 hardening from audit item 8)*

### Second adversarial session (0906) — inbound to the go-live surface

- **Bounded webhook delivery (all outbound):** only `forwardMasterDiagnosisIntakeWebhook` had a 5 s abort; the other seven outbound webhook deliveries (`deliverPublicCaseNotification`, `deliverDiagnosisWebhook`, `deliverMarketplaceSellerIntake`, `deliverMarketplaceBuyerInterest`, `deliverInternalReview`, `deliverMechanicMatchRequest`, `deliverConciergeRequest`) used unbounded `fetch`. A stalled or misconfigured `*_WEBHOOK_URL` could hold a request/socket open indefinitely. Added `server/webhook-fetch.ts` (`fetchWebhookWithTimeout`, combining any caller signal with `AbortSignal.timeout(5000)`) and wired it into all eight call sites; the manual `AbortController` in the master-intake forwarder was replaced by the same helper.
  **Regression coverage:** `server/webhook-fetch.test.ts` (4 tests) — responding endpoint returns the body, non-2xx statuses are returned without throwing, a stalled endpoint aborts within the timeout, and a caller-provided abort signal also terminates an in-flight request. (`package.json` → `test:webhook-fetch`)
- **Review error serialization never echoes `error.message`:** `reviewError` in `server/review/review-routes.ts` previously placed `error.message` into responses for `ReviewWriteError` and `ReviewReleaseReadError`. Today those messages are fixed internal strings, but the pattern would leak storage/DB internals if a wrapped message ever carried them. The handler now maps codes to fixed strings (`invalid_state`/`conflict`/`storage_unavailable`/`review_release_read_failed`) and only the code + fixed text reaches the reviewer.
  **Regression coverage:** `server/review/review-routes.test.ts` — a `ReviewWriteError` whose message contains a fake connection string is serialized to the fixed "Review state could not be persisted." with no secret in the response body.
- **Production client switched to same-origin API calls:** `client/src/marketplace/Marketplace.tsx`, `client/src/components/BuyerCheckPreview.tsx`, and `client/src/TestBackend.tsx` hard-coded absolute cross-origin endpoints to a second host (`https://mechaniceye-backend-v2.onrender.com`) for seller intake, buyer interest, buyer vehicle knowledge, and diagnosis submission. These coupled public forms to an un-allowlisted host, would fail closed with a 403 if the page origin ever differed from the allowlist, and were a stale-domain risk. The Express server serves both the SPA (`dist/client`) and every `/api/*` route from one origin, so all client fetches now use same-origin relative paths.
  **Verification:** `npm run check` and `npm run build` (client bundle + server bundle) pass with the changes.

---

## Verification

`npm run check` (tsc) — PASS
`npm run build` (vite + esbuild server bundle) — PASS

| Test suite | Result | Focus |
|---|---|---|
| `test:security` (reviewer-auth) | PASS (4) | Bearer extraction, timing-safe compare, fail-closed unconfigured, opaque identity |
| `test:auth` (customer-auth) | PASS (3) | scrypt hashing, HMAC session tamper/expiry rejection, invite exact-match |
| `test:identity` (case-identity) | PASS (2) | Authenticated identity overrides body; delivery email fail closed |
| `test:rate-limit` | PASS (3) | Bounded window limiter, fail-closed on capacity, no client key echo |
| `test:evidence` | PASS (7) | Server IDs, controlled extensions, honest analysis state, rollback on failure |
| `test:readiness` | PASS (3) | Ready only when all gates pass; fails closed; rejects insecure URLs/secrets |
| `test:consent` | PASS (7) | Versioned immutable consent events; consent required for persistence/sharing |
| `test:consent-postgres` | PASS (3) | Postgres consent repository contract |
| `test:consent-intake` | PASS (3) | Intake consent fail-closed behavior |
| `test:consent-revocation` | PASS (4) | Revocation linking, purpose validation, fail-closed, storage-failure isolation |
| `test:observability` | PASS (6) | Recursive PII/credential redaction; safe error serialization; redacted tags |
| `test:safe-log` | PASS (4) | Structured log lines; no message/stack/cause leak; PII-redacted attributes |
| `test:origin-guard` | PASS (6) | Allowlist; route-level 403; global read-through/write-reject; no-origin pass |
| `test:registration-enum` | PASS (2) | Identical register responses; session only for new accounts |
| `test:routes-security` | PASS (3) | Form 403 on disallowed origin before validation; allowed origin passes guard; knowledge endpoint 429 before DB |
| `test:follow-up-boundary` | PASS (2) | Only text labeled analyzed; no implied media |
| `test:review` (release gate) | PASS (11) | All deny paths fail closed; immutable versioned records |
| `test:review-async` | PASS (3) | Async release gate read contract |
| `test:review-postgres` | PASS (3) | Postgres review reader durability contract |
| `test:review-writer` | PASS (4) | Postgres review writer contract, error isolation |
| `test:review-adapter` | PASS (3) | Postgres adapter contract |
| `test:review-routes` | PASS (3) | Reviewer-gated wiring; ignores client identity; review failures never echo storage internals |
| `test:webhook-fetch` | PASS (4) | Bounded webhook delivery: respond, non-2xx, stalled endpoint aborts, caller signal honored |
| `test:media-contract` | PASS (7) | Traversal-resistant keys, server-generated keys, verified bytes, idempotent puts, private access, durability gate |
| `test:delivery` | PASS (8) | Idempotent enqueue, fenced leases, bounded retries → DLQ, fixed metadata |

---

## Adversarial Audit Results (re-verified this branch)

- **All public state-changing routes** (`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, diagnosis intake, four public forms, consent revoke) are covered by the global origin enforcement and/or `requireAllowedOrigin`, plus `SameSite=Lax` on the session cookie.
- **Authentication/sessions:** scrypt-salted passwords, HMAC-signed stateless sessions (expiry, version check, timing-safe compare), `HttpOnly`/`Secure`(prod)/`SameSite=Lax` cookie. Reviewer API uses a separate 32-char secret, timing-safe, `not_configured` → 503.
- **Reviewer endpoints:** every `/api/internal/*` and evidence/file/consultation route requires the reviewer credential; review identity is derived server-side (`reviewer_ref`), never from the request body.
- **Uploads:** photo intake requires authenticated customer + launch-controlled private-object storage; MIME allowlist with byte verification at storage time; server-generated keys; `X-Content-Type-Options: nosniff` on retrieval; local `uploads/` is gitignored and never treated as durable.
- **R2/S3 evidence:** private objects only, case-prefixed keys, server-generated attachment IDs, no public URLs, rollback on partial failure (re-verified via `media/private-object-storage.contract.test.ts`).
- **File retrieval:** `/api/files/:filename` and `/api/internal/evidence/*` are reviewer-only, basename-normalized, containment-checked, `nosniff`.
- **CORS/Origin:** allowlist only; disallowed origins get 403 on state changes and never receive CORS headers.
- **Rate limits:** public forms 15/10 min, register 8/15 min, login 20/15 min (IP) + 10/15 min (account), customer intake 20/hr, buyer-knowledge 120/5 min. All 429s are generic and never echo the client key.
- **Body/file limits:** `express.json()` default 100 kB; photo 12 MB × up to 4 files; follow-up audio/video 50 MB with strict MIME filter; trust-proxy configuration moved to headers from Render.
- **Duplicate submission/idempotency:** DB insert uses `ON CONFLICT DO NOTHING` on generated case IDs; evidence puts are idempotent; review/consent events append with case-bound uniqueness.
- **DB error handling:** no raw DB error text reaches a client or log; `public-case-db.ts` strips `DATABASE_URL`/password from internal messages and those strings never reach responses.
- **Webhooks:** every outbound webhook delivery is bounded by a 5 s hard timeout (`fetchWebhookWithTimeout`), failures logged safely, no secrets/logging of payload PII.
- **Logging/observability:** every request-path log goes through the privacy layer; the only raw `console.log` is the startup banner (port only).
- **Path traversal:** case/attachment/filename segments validated against `[a-zA-Z0-9._-]` or basename-normalized; covered by contract tests.
- **Header injection/CSP:** no user-controlled header values are emitted; `Content-Disposition` uses server-generated attachment IDs.
- **Open redirects:** none found on any route.
- **Secrets/wildcard config/stale domains:** no secrets in code/docs/tests; no wildcard CORS; production origin in allowlist is `mechaniceye.onrender.com`; the client makes only same-origin `/api/*` calls, so no hard-coded secondary API host remains; local dev origins only in non-production development.
- **Client-supplied identity/role/payment/review state:** not trusted — diagnosis ownership is overridden with the authenticated session email (`applyAuthenticatedCaseIdentity`), review identity is derived from the reviewer credential, payment entitlement is hardcoded `false` until provider verification, and release is fail-closed.

---

## Remaining Issues (non-blocking for the invite-only, controlled beta)

1. **Payment + email delivery readiness remain hardcoded false** (`server/routes.ts` readiness report): releases stay fail-closed until real provider integration lands. Payment/fulfillment state is never trusted from the client.
2. **Session statelessness:** sessions are server-minted and signed but not revocable server-side; acceptable for a 12-hour beta session window.
3. **DB TLS default** keeps the historical managed-host posture (`rejectUnauthorized: false`). Production should set `DRIVABLE_DATABASE_SSL_MODE=verify-full`; the code now supports it explicitly.
4. **Consultation tools** (`/api/consultations`, consultation feedback) read `userId`/`mechanicId` from the request body but are reviewer-only internal tooling; the reviewer credential is the gate.
5. **Windows-only local case storage** (`C:\MechanicsEye_Operations`) is a dev convenience; launch-controlled deployments always use the DB mirror path.
6. **Uploads directory** is local-disk storage by design and must not be treated as durable; durable evidence lives exclusively in private object storage.

---

## Release Verdict

**CONDITIONAL GO** for the invite-only, controlled beta — the two P0 items are fixed, all P1 items are fixed, every regression suite passes, webhook delivery is time-bounded, review errors never echo internal messages, the client is same-origin only, and the fail-closed design is preserved.

Conditions before go-live (unchanged from the audit):
- Configure unique random `DRIVABLE_REVIEWER_TOKEN`, `DRIVABLE_SESSION_SECRET`, `DRIVABLE_BETA_INVITE_CODE`, approved consent/terms/privacy versions, and a durable `DATABASE_URL`.
- Set `DRIVABLE_DATABASE_SSL_MODE=verify-full` if the managed host validates standard CAs.
- Confirm the production origin on the allowlist matches the deployed host.

No production DB writes, no NHTSA `--apply`, no payment writes, and no public object exposure were introduced by this branch.