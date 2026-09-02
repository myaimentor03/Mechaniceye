# Drivable Beta Release Security Audit — 09/02

**Auditor:** OpenCode Worker 2 (Independent Release/Security Auditor)
**Worktree/branch:** `audit/drivable-release-0902` (based on `origin/opencode/launch-hardening-rescue-0902`)
**Date:** 2026-09-02
**Scope:** `opencode/launch-hardening-rescue-0902`, `agy/beta-audit-0901`, `opencode/mobile-r2-rescue-0902`, `opencode/buyer-commerce-rescue-0902`

---

## Recommendation

**CONDITIONAL GO**

The reviewed launch-hardening branch demonstrates a security-conscious design: all core authn/authz, rate limiting, evidence storage, consent, review release gating, and persistence paths fail closed and are covered by passing unit tests. However, the following must be remediated before the paid beta go-live, and none of the findings block a controlled/soft launch of the invite-only beta:

- **(P0)** PII and raw stack traces are written to stdout via raw `console.log`/`console.error` in `server/routes.ts` (bypassing the observability privacy layer).
- **(P1)** Public form endpoints have no CSRF/origin enforcement beyond per-form rate limits; email-account enumeration is distinguishable on register conflict.
- **(P1)** The `uploads/` directory is world-write-reachable by design and the `/api/files/:filename` route serves arbitrary files by reviewer token only.

---

## Summary of Tests Performed (all passing)

| Test file | Result | Focus |
|---|---|---|
| `server/reviewer-auth.test.ts` | PASS (4) | Bearer token extraction, timing-safe compare, fail-closed when unconfigured, opaque reviewer identity |
| `server/customer-auth.test.ts` | PASS (3) | Salted scrypt hashing, HMAC-signed sessions reject tampering/expiry, beta invite exact-match |
| `server/rate-limit.test.ts` | PASS (3) | Fixed-window limiter bounds, fails-closed on capacity exhaustion, 429 without echoing client key |
| `server/case-identity.test.ts` | PASS (2) | Authenticated identity overrides request-body identity; ownership/delivery email fails closed |
| `server/evidence-storage.test.ts` | PASS (7) | Photo bytes get server IDs, controlled extensions, honest analysis state; renamed executables and MIME mismatches rejected and cleaned up; case traversal/storage failure never reports success; private object storage persists/retrieves/deletes without public URLs and rolls back partial upload failures |
| `server/launch-readiness.test.ts` | PASS (3) | Ready only when every gate passes; fails closed on missing foundations; rejects insecure/non-origin public URLs and weak secrets |
| `server/follow-up-evidence-boundary.test.ts` | PASS (2) | Only text labeled as analyzed; missing media not implied to exist |
| `server/review/release-gate.test.ts` | PASS (11) | Immutable versioned records; in-memory repo rejected for production durability; opaque recipient bindings; all deny paths (unapproved, rejected, wrong-case, wrong-recipient, stale, superseded, mock, critical, unclassified, high-risk unacknowledged) |
| `server/review/review-routes.test.ts` | PASS | Reviewer-gated route wiring, error serialization |
| `server/review/async-release-gate.test.ts` | PASS | Async release gate contract |
| `server/review/postgres-review-*.test.ts` | PASS | Postgres writer/reader/adapter durability contracts |
| `server/consent/consent.test.ts` | PASS (7) | Versioned immutable consent events; media persistence/reviewer sharing fail closed without consent; stale versions rejected; case-bound; revocation blocks; optional learning independent |
| `server/consent/postgres-consent-repository.test.ts` | PASS | Postgres consent repository contract |
| `server/consent/intake-consent.test.ts` | PASS | Intake consent fail-closed behavior |
| `server/observability/observability.test.ts` | PASS (6) | Recursive PII/credential redaction; safe getter handling; request helpers retain UUIDs, replace private ids; safe error serialization (no message/stack/cause); fixed metric names, finite values, redacted tags |
| `server/media/private-object-storage.contract.test.ts` | PASS (7) | Keys resist traversal, never contain client filename; verified bytes control media type/extension; case/attachment scope isolation; idempotent puts; private access metadata; production durability gate |
| `server/jobs/delivery-outbox.contract.test.ts` | PASS (8) | Idempotent enqueue; fenced leases; bounded retries → dead letter; case-scoped isolation; repository failure never reports delivery; fixed metadata only |
| `shared/consent/consent.test.ts` | PASS (7) | (see above) |

**Note:** Some tests were initially run with a globally installable `tsx` version that could not resolve `node_modules`; re-running with the project-local `npx --package=tsx@4.19.1` resolved all pass results. `server/db.ts` refuses to build in a sandbox without a real `DATABASE_URL`; the DB-backed paths (login/register, review writes, consent persistence) are gated by `DRIVABLE_LAUNCH_CONTROLS_ENABLED`, so public intake does not require them.

---

## Findings

### P0 — LOGGED PII AND RAW ERROR OBJECTS BYPASS THE PRIVACY LAYER

**Location:** `server/routes.ts:1169-1187` (marketplace seller intake), `server/routes.ts:1246-1253` (marketplace buyer interest), and ~25 `console.error(..., error)` calls across `server/routes.ts`, `server/customer-auth.ts`, `server/public-case-db.ts`.

**Details:**
- `MARKETPLACE_SELLER_INTAKE_RECEIVED` logs `sellerName`, `sellerEmail`, `sellerPhone`, `city`, `state`, `zip` in plaintext.
- `MARKETPLACE_BUYER_INTEREST_RECEIVED` logs `buyerName`, `buyerEmail`, `buyerPhone` in plaintext.
- Numerous handlers pass the raw `error` object to `console.error`, which serializes message + stack. Error messages may contain user input, SQL fragments, file paths, or internal state.
- The fully-safe `server/observability` pipeline (`sanitizeForObservability`, `serializeErrorSafely`) exists and is tested but is **never called** from production request paths — it is effectively dead code in the running app.

**Required fix:**
- Route all request-path logging through `sanitizeForObservability` / `serializeErrorSafely` (or equivalent), or at minimum replace the PII-laden `console.log` payloads with redacted/bounded metadata only.
- Remove the plaintext PII `console.log` blocks in the marketplace handlers; log only the intake type, source, and submittedAt.

---

### P1 — PUBLIC FORM ENDPOINTS LACK ORIGIN/CSRF PROTECTION (scope-limited)

**Location:** `server/index.ts:15-31` (CORS allowlist, does not reject disallowed origins), and the public form endpoints in `server/routes.ts`: `/api/marketplace/seller-intake`, `/api/marketplace/buyer-interest`, `/api/mechanic-match/request`, `/api/support/concierge-request`.

**Details:**
- The CORS middleware only sets headers for allow-listed origins; non-listed origins are still processed (no rejection, no CSRF token).
- These are `application/json` POST forms with per-IP rate limits (`publicFormLimit`: 15/10min). JSON + SameSite-Lax cookies materially raise the bar for CSRF, and there is no state-changing authenticated action on these routes, so this is a **significant-but-not-critical** hardening gap.
- Browser `fetch` cross-origin without CORS preflight approval would be blocked from *reading* responses, but simple header-only POSTs could still be sent (form-encoded). The fixed JSON content-type is not a CSRF bulletproofing measure on its own.

**Required fix (recommended, do not necessarily block):**
- For release, enable a server-side check: if an `Origin` header is present and not in the allowlist, return `403` (CSRF/origin enforcement) for the state-changing public forms. Register the production origin in the allowlist.

---

### P1 — EMAIL ACCOUNT ENUMERATION ON PUBLIC REGISTRATION

**Location:** `server/customer-auth.ts:150-151`.

**Details:**
- `/api/auth/register` returns a distinct `409 "An account already exists for this email."` when an email is already registered, versus success for a fresh registration. This allows unauthenticated enumeration of which beta-invited emails already have accounts. (The `/api/auth/login` path correctly returns a generic `401`.)
- Mitigating factor: registration requires a valid, non-guessed `DRIVABLE_BETA_INVITE_CODE` (rate limited 8/15min per IP), so enumeration requires the shared beta code.

**Required fix (recommended):**
- Return a generic success-or-pending response for register when the account already exists (do not distinguish by status/body). This is low-cost and low-risk.

---

### P1 — /api/files/:filename SERVES ARBITRARY FILES (reviewer-only, no traversal, but no MIME/content control)

**Location:** `server/routes.ts:2235-2244`.

**Details:**
- The route requires `requireReviewer`, does `path.join(uploadDir, filename)`, and `res.sendFile` if the file exists. Because Express `req.params.filename` for `:filename` does not include `/`, simple `../` traversal is not directly reachable, but encoded separators and the lack of containment check are worth hardening. `filename` is not sanitized to a basename, and the served content is not MIME-checked (relies on the client).
- This is internal-only (reviewer token required), so it is not remotely exploitable without the reviewer credential, but it is a genuine hardening point.

**Required fix (recommended):**
- `const filename = path.basename(req.params.filename)` before join; verify the resolved path stays within `uploadDir`; add `X-Content-Type-Options: nosniff` and a restrictive `Content-Type`.

---

### P2 — CONSENT REVOCATION HAS NO INGESTION PATH; RETENTION HARDCODED TO RETAIN

**Location:** `server/consent/intake-consent.ts:84-85`; revocation types in `shared/consent/index.ts`.

**Details:**
- Full revocation architecture exists and is tested at the shared layer, but there is **no server endpoint or intake function** to record `ConsentRevokedEvent`. A user cannot actually revoke consent through the app.
- The retention policy passed to the shared engine always returns `retention: "retain"` and `deletionEligibility: "not_eligible"`, so even if revocation is recorded, it has no effect on data deletion.
- These are policy gaps for future releases rather than release blockers; the intake path correctly fails closed by requiring current consent before media persistence/sharing.

---

### P2 — REVIEW DATA PERSISTENCE NEEDS VERIFICATION BEFORE THE PAID GO-LIVE / FULFILLMENT GATING

**Location:** `server/launch-readiness.ts:35-57`; `server/routes.ts:1509-1525`.

**Details:**
- Readiness reports `verifiedPaymentEntitlement: false` and `verifiedEmailDelivery: false` unconditionally today. The release gate correctly denies all releases unless prior durable review state is present, and the gate is fail-closed. So any content release is gated irrespective of payment/fulfillment — good.
- The missing durable human-review schema / payment / email verifications surface in readiness as `503`, which is correct fail-closed behavior for a *controlled* beta.

---

### P2 — S3 TLS / ssl: rejectUnauthorized:false

**Location:** `server/db.ts:24-27`; many `scripts/*` set `ssl: { rejectUnauthorized: false }`; `server/routes.ts:1826` sets the same for the reader client.

**Details:**
- Disabling TLS certificate verification is a standard dev convenience but undermines transport-integrity guarantees in production. Standard practice on managed Postgres; flag for review but not a release blocker given managed-host TLS.

---

### Verdict on R2 / Private Access Assumptions

`S3PrivateEvidenceStore` (`server/evidence-storage.ts:136-251`) correctly:
- Requires `DRIVABLE_EVIDENCE_S3_*` credentials; refuses partial-config toggles.
- Uses server-generated `randomUUID` object keys that never contain the client filename (verified in the media contract test).
- Scopes every key under `evidence/<safeCaseId>/`; `safeCaseSegment` rejects anything outside `[a-zA-Z0-9._-]`, blocking traversal.
- `getAttachment` re-validates that the manifest entry's `storageKey` stays under the case prefix before GET.
- Rolls back written objects (and the manifest) on partial failure.
- No public URL is produced anywhere; all retrieval is server-side and reviewer-authenticated.

The R2/S3 **private-access assumption holds** subject to the bucket being non-public (default R2 private). No public-read ACL is ever set.

---

## Branch-Specific Notes

### opencode/launch-hardening-rescue-0902 (BASE — audited in depth)
Contains the security hardening: reviewer auth, customer auth, rate limits, private evidence storage, consent, review release gate, launch readiness, observability. All audited above.

### agy/beta-audit-0901
Adds extensive load-testing scaffolding (`tests/load/load-cert.mjs`, `scenarios.mjs`, `guardrails.mjs`). Non-destructive; no production writes. The load-cert test is a certification harness. No security findings beyond the base.

### opencode/mobile-r2-rescue-0902
Focuses on mobile evidence upload + R2 private object storage (contracts tested). R2 path verified above. No new destructive or public-write surfaces.

### opencode/buyer-commerce-rescue-0902
Adds `server/commerce/` (in-memory order repo, paid-fulfillment eligibility, disabled payment-provider adapter, order contract) with tests. Uses a disabled/`in-memory` payment adapter — i.e., payment is **not** wired to Stripe in this branch, and the paid fulfillment eligibility recomputes server-side fail-closed. Acceptable for a gated beta; must be connected to a real provider and verified before collecting actual payments.
- The `commercial` package also removed several security files relative to the base in the diff (those already exist in the base branch). The shared consent layer gained tests. No new exposure.

---

## Exact Fixes Required

**Must-fix before paid go-live (P0):**
1. Replace PII-laden `console.log` payloads in `server/routes.ts:1169-1187` and `1246-1253` with redacted/bounded metadata (intake type, source, submittedAt only).
2. Route production request-path logging through `sanitizeForObservability` / `serializeErrorSafely` (do not keep passing raw `error` objects to `console.error`).

**Should-fix (P1):**
3. Add origin enforcement (403 on non-allow-listed `Origin`) to the state-changing public forms in `server/routes.ts`.
4. Make `/api/auth/register` indistinguishable for already-existing emails (remove the `409` enumeration signal) in `server/customer-auth.ts:150-151`.
5. `path.basename` + containment check + nosniff on `/api/files/:filename` in `server/routes.ts:2235-2244`.

**Later (P2):**
6. Add a server-side consent-revocation intake path and an effectual retention policy (`server/consent/`).
7. Wire payment provider (currently disabled adapter) and email delivery, then flip their readiness gates on.
8. Review `ssl: rejectUnauthorized: false` usage for production.

---

## GO / CONDITIONAL GO / NO-GO

**CONDITIONAL GO** for the invite-only, controlled beta.

Condition(s):
- P0 items (1) and (2) above are fixed before go-live to stop PII/stack leakage into logs.
- Reviewers confirm the production `DRIVABLE_REVIEWER_TOKEN`, `DRIVABLE_SESSION_SECRET`, `DRIVABLE_BETA_INVITE_CODE`, `DRIVABLE_TERMS/PRIVACY/CONSENT_VERSION`, and durable `DATABASE_URL` are configured (readiness otherwise correctly returns 503, which is fail-closed safe).

This is NOT a NO-GO: every destructive/production-write path, NHTSA `--apply`, invoice/payment provider, R2 public-read, and PII log leak was checked; no unauthorized production DB writes, no NHTSA writes, no public object exposure, and no missing authn/authz gates were found. The design is fail-closed and well-tested.
