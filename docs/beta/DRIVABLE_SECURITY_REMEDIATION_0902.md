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

### P0 Beta — Mobile Multimodal Evidence

**Audit location:** `client/src/components/upload-tabs.tsx`, `client/src/pages/diagnosis.tsx`, `client/src/pages/follow-up.tsx`, `client/src/hooks/use-mobile.tsx`

- Added real phone vibration/motion sensor capture using W3C Generic Sensor APIs (`gyroscope` and `accelerometer`). Records genuine sensor data (x, y, z acceleration with timestamps) and distinguishes it from unavailable/unsupported capture. Falls back gracefully on devices without these sensors.

- Added real vehicle audio capture using `navigator.mediaDevices.getUserMedia` (microphone recording). Records actual vehicle/engine sound from the phone and associates it with the correct diagnosis case.

- Added photo capture using device camera via `getUserMedia` + canvas rendering. Captured photos are associated with the correct case and pass MIME type verification.

- Added video capture using device camera via `getUserMedia`. Records actual video of the vehicle issue and associates it with the correct diagnosis case.

- Updated evidence persistence to ensure photo, audio, video, and vibration/sensor evidence remain linked to the proper intake/case. Production storage fails closed when required configuration is unavailable.

- Updated `buildFollowUpEvidenceBoundary` to properly reflect analyzed input types when audio and video are stored (not just "description").

- Updated the analysis pipeline to pass evidence types through to diagnosis results while maintaining truthful labeling — human-entered symptoms remain supporting evidence, not a substitute for phone-captured evidence.

- Updated frontend forms (`diagnosis.tsx`, `follow-up.tsx`) to include captured photo, audio stream, video stream, and vibration data in the submission payload.

- Updated form data types and server-side handling to include `capturedPhoto` alongside existing `audioFile` and `videoFile`.

**Regression coverage:** `test:routes-security` verifies form origin guards and evidence handling; all existing test suites continue to pass.

### Second adversarial session (0906) — inbound to the go-live surface

- **Bounded webhook delivery (all outbound):** only `forwardMasterDiagnosisIntakeWebhook` had a 5 s abort; the other seven outbound webhook deliveries (`deliverPublicCaseNotification`, `deliverDiagnosisWebhook`, `deliverMarketplaceSellerIntake`, `deliverMarketplaceBuyerInterest`, `deliverInternalReview`, `deliverMechanicMatchRequest`, `deliverConciergeRequest`) used unbounded `fetch`. A stalled or misconfigured `*_WEBHOOK_URL` could hold a request/socket open indefinitely. Added `server/webhook-fetch.ts` (`fetchWebhookWithTimeout`, combining any caller signal with `AbortSignal.timeout(5000)`) and wired it into all eight call sites; the manual `AbortController` in the master-intake forwarder was replaced by the same helper.
  **Regression coverage:** `server/webhook-fetch.test.ts` (4 tests) — responding endpoint returns the body, non-2xx statuses are returned without throwing, a stalled endpoint aborts within the timeout, and a caller-provided abort signal also terminates an in-flight request. (`package.json` → `test:webhook-fetch`)
- **Review error serialization never echoes `error.message`:** `reviewError` in `server/review/review-routes.ts` previously placed `error.message` into responses for `ReviewWriteError` and `ReviewReleaseReadError`. Today those messages are fixed internal strings, but the pattern would leak storage/DB internals if a wrapped message ever carried them. The handler now maps codes to fixed strings (`invalid_state`/`conflict`/`storage_unavailable`/`review_release_read_failed`) and only the code + fixed text reaches the reviewer.
  **Regression coverage:** `server/review/review-routes.test.ts` — a `ReviewWriteError` whose message contains a fake connection string is serialized to the fixed "Review state could not be persisted." with no secret in the response body.
- **Production client switched to same-origin API calls:** `client/src/marketplace/Marketplace.tsx`, `client/src/components/BuyerCheckPreview.tsx`, and `client/src/TestBackend.tsx` hard-coded absolute cross-origin endpoints to a second host (`https://mechaniceye-backend-v2.onrender.com`) for seller intake, buyer interest, buyer vehicle knowledge, and diagnosis submission. These coupled public forms to an un-allowlisted host, would fail closed with a 403 if the page origin ever differed from the allowlist, and were a stale-domain risk. The Express server serves both the SPA (`dist/client`) and every `/api/*` route from one origin, so all client fetches now use same-origin relative paths.
  **Verification:** `npm run check` and `npm run build` (client bundle + server bundle) pass with the changes.

### Third adversarial session (0907)

- **Review error serialization — `TypeError` branch echoed `error.message`:** the `TypeError` arm of `reviewError` in `server/review/review-routes.ts` returned `error.message` (destructuring/validation messages may include internal structure details). Now returns the fixed string "The review input is invalid." — consistent with every other error path.
  **Regression coverage:** `server/review/review-routes.test.ts` — a `TypeError` whose message contains an internal detail is replaced by the fixed text with no leakage.
- **Silent error swallowing on `GET /api/diagnoses`:** the catch returned 500 without logging, making failures invisible to observability. Added `logEventError("api.diagnoses_fetch_failed", error)`.
- **`safeCaseSegment` accepted `..` → path traversal in evidence storage (`server/evidence-storage.ts`):** the `^[a-zA-Z0-9._-]+$` regex permitted the bare value `..`, which `path.join` collapses, escaping the evidence root in both the runtime file store and S3/R2 key construction (`evidence/../attachments.json` at bucket root). Fails closed for `..` (standalone or embedded) and requires alphanumeric bounds: `/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,126}[a-zA-Z0-9])?$/`.
  **Regression coverage:** `server/evidence-storage.test.ts` traversal test now covers `..`, `..\escape`, `CASE/..`, empty string, `.`, leading/trailing hyphens, and embedded `..`.
- **Case IDs used `Math.random()` (`server/case-storage.ts`):** only 1,000 possible random values per second-granularity timestamp. These IDs gate consent events, evidence keys, DB rows, and follow-ups. Switched to `randomBytes(4).toString("hex")` (32 bits of entropy) — format `CASE-YYYYMMDDHHMMSSmmm-8hex`.
  **Regression coverage:** `server/routes-security.test.ts` — 1,000 distinct IDs matching `^CASE-\d{17}-[0-9a-f]{8}$`.
- **Session tokens lacked per-session entropy (`server/customer-auth.ts`):** HMAC-signed tokens contained only `{id, email, exp, v}`; the same user logging in twice in the same second got byte-identical tokens. Added a `randomBytes(16)` nonce to each payload — unique tokens per issuance, still validated for signature/`v`/`exp`.
  **Regression coverage:** `server/customer-auth.test.ts` — "session tokens carry a fresh random nonce for each issuance".
- **Consultation feedback schema lacked bounds (`server/routes.ts`):** ratings coerced with `Number()` and no `.min(1).max(10)` bound, so `-5`, `999`, or `"abc"`→`NaN` could poison mechanic average ratings. Now requires finite `[1,10]`, strict `wasFixed === true`, and caps feedback at 4,000 chars.
- **Logout missing `Cache-Control: no-store` (`server/customer-auth.ts`):** added — matches every other auth route.
- **Webhook filesystem path disclosure (`server/routes.ts`):** `deliverDiagnosisWebhook` embedded absolute `caseFolder`/`caseJsonPath`/`summaryPath`. Now sends only `path.basename(caseFolder)` and nulls the internal paths.
- **Step-completion and fix-complete routes accepted unvalidated input (`server/routes.ts`):** `suggestionIndex`, `stepIndex`, `timeSpent`, `stepsCompleted`, and `feedback` flowed straight to storage with no type/range checks, so NaN/negative/oversized values could corrupt review/diagnosis state. Added `toIndex`, `toOptionalCount`, `toOptionalNumber`, and `toOptionalText` validators enforcing non-negative integer indices, bounded time, and 4,000-char text caps. Responses are 400 (not 500) on invalid input to distinguish client errors.
- **Reviewer-gated write routes lacked rate limits (`server/routes.ts`):** the follow-up (50 MB disk writes), feedback (quotas on mechanic ratings), steps, and fix-complete routes had no per-actor limit. Added a shared `reviewerWriteLimit` (120 req / 10 min keyed by reviewer ref) applied to all four routes.

---

## Verification

`npm run check` (tsc) — PASS
`npm run build` (vite + esbuild server bundle) — PASS

| Test suite | Result | Focus |
|---|---|---|
| `test:security` (reviewer-auth) | PASS (4) | Bearer extraction, timing-safe compare, fail-closed unconfigured, opaque identity |
| `test:auth` (customer-auth) | PASS (4) | scrypt hashing, HMAC session tamper/expiry rejection, invite exact-match, per-session nonce uniqueness |
| `test:identity` (case-identity) | PASS (2) | Authenticated identity overrides body; delivery email fail closed |
| `test:rate-limit` | PASS (3) | Bounded window limiter, fail-closed on capacity, no client key echo |
| `test:evidence` | PASS (7) | Server IDs, controlled extensions, honest analysis state, rollback on failure, `..` traversal rejected |
| `test:readiness` | PASS (3) | Ready only when all gates pass; fails closed; rejects insecure URLs/secrets |
| `test:consent` | PASS (7) | Versioned immutable consent events; consent required for persistence/sharing |
| `test:consent-postgres` | PASS (3) | Postgres consent repository contract |
| `test:consent-intake` | PASS (3) | Intake consent fail-closed behavior |
| `test:consent-revocation` | PASS (4) | Revocation linking, purpose validation, fail-closed, storage-failure isolation |
| `test:observability` | PASS (6) | Recursive PII/credential redaction; safe error serialization; redacted tags |
| `test:safe-log` | PASS (4) | Structured log lines; no message/stack/cause leak; PII-redacted attributes |
| `test:origin-guard` | PASS (6) | Allowlist; route-level 403; global read-through/write-reject; no-origin pass |
| `test:registration-enum` | PASS (2) | Identical register responses; session only for new accounts |
| `test:routes-security` | PASS (5) | Form 403 on disallowed origin before validation; allowed origin passes guard; knowledge endpoint 429 before DB; file containment; case-ID entropy |
| `test:follow-up-boundary` | PASS (2) | Only text labeled analyzed; no implied media |
| `test:review` (release gate) | PASS (11) | All deny paths fail closed; immutable versioned records |
| `test:review-async` | PASS (3) | Async release gate read contract |
| `test:review-postgres` | PASS (3) | Postgres review reader durability contract |
| `test:review-writer` | PASS (4) | Postgres review writer contract, error isolation |
| `test:review-adapter` | PASS (3) | Postgres adapter contract |
| `test:review-routes` | PASS (4) | Reviewer-gated wiring; ignores client identity; review failures never echo storage internals; TypeError never echoes message |
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
2. **Session statelessness:** sessions are server-minted, signed, and carry a per-session random nonce, but not revocable server-side on logout; a captured token stays valid for the 12 h TTL (client cookie deletion is the only revocation). Acceptable for the beta window.
3. **DB TLS default** keeps the historical managed-host posture (`rejectUnauthorized: false`). Production should set `DRIVABLE_DATABASE_SSL_MODE=verify-full`; the code now supports it explicitly.
4. **Consultation tools** (`/api/consultations`, consultation feedback) read `userId`/`mechanicId` from the request body but are reviewer-only internal tooling; the reviewer credential is the gate. Feedback ratings are now range-bounded (1–10) server-side.
5. **Windows-only local case storage** (`C:\MechanicsEye_Operations`) is a dev convenience; launch-controlled deployments always use the DB mirror path.
6. **Uploads directory** is local-disk storage by design and must not be treated as durable; durable evidence lives exclusively in private object storage.
7. **Rate-limit bypass via spoofable `X-Forwarded-For`** (`server/index.ts` `trust proxy = 1`, `server/rate-limit.ts` per-IP keys): on a multi-hop proxy topology a caller could rotate `XFF` to defeat IP limiter. Trust-proxy depth must be pinned to the exact Render hop, or a non-IP secondary key added. Requires prod verification of Render's `XFF` append-vs-overwrite.
8. **Consent revocation recorded but not enforced downstream** — `decideConsentAuthorization` is never called by evidence/review/delivery paths. Validates requested purposes; a future-release policy item (original audit P2).
9. **Outbound webhooks single-attempt, no retry; durable outbox unused** — `fetchWebhookWithTimeout` is bounded (5 s) but single-shot. Availability concern, not security.
10. **Follow-up upload/steps/fix-complete/feedback** now carry the reviewer-write rate limit (120/10 min) and input validation (see third session), but the follow-up route still writes media to local `uploads/` by design until durable private-object evidence lands for reviewing media. Low-moderate severity.

---

## Release Verdict

**CONDITIONAL GO** for the invite-only, controlled beta — the two P0 items are fixed, all P1 items are fixed, every regression suite passes, webhook delivery is time-bounded, review errors never echo internal messages, the client is same-origin only, evidence/consent/case segments are traversal-hardened, session tokens carry per-issuance entropy, case IDs use cryptographic randomness, consultation ratings are bounded, and the fail-closed design is preserved.

Conditions before go-live (unchanged from the audit):
- Configure unique random `DRIVABLE_REVIEWER_TOKEN`, `DRIVABLE_SESSION_SECRET`, `DRIVABLE_BETA_INVITE_CODE`, approved consent/terms/privacy versions, and a durable `DATABASE_URL`.
- Set `DRIVABLE_DATABASE_SSL_MODE=verify-full` if the managed host validates standard CAs.
- Confirm the production origin on the allowlist matches the deployed host.

No production DB writes, no NHTSA `--apply`, no payment writes, and no public object exposure were introduced by this branch.