# Drivable Beta Launch Checklist V1

**Owner:** Glenn (owner-operator)
**Prepared:** 2026-09-02
**Purpose:** Operator-ready, actionable checklist to bring **https://www.getdrivable.com/** live for a **controlled beta** (non-emergency intake). It assumes a single-service Render deployment that serves both the built frontend and the API from one Express process.

> Scope and posture
> - This checklist covers **deployment, environment, smoke, mobile acceptance, rollback, and launch-day owner actions**.
> - It does **not** authorize production database changes, NHTSA `--apply`, or irreversible brand production.
> - Reuse (do not duplicate) the existing contracts in `docs/operations/DRIVABLE_RENDER_DEPLOY_CHECKLIST_V1.md`, `docs/operations/DRIVABLE_PRE_LAUNCH_GO_NO_GO_V1.md`, `docs/operations/DRIVABLE_ENV_FLAGS_V1.md`, and `docs/operations/DRIVABLE_FIRST_END_TO_END_TEST_RUNBOOK_V1.md`.
> - A beta is not a public coordinated launch. Public mass-launch, paid traffic, and press coordination remain separate gates defined in `docs/marketing/launch/DRIVABLE_MASTER_LAUNCH_BLUEPRINT_V1.md` and `docs/marketing/launch/DRIVABLE_LIVE_SITE_MARKETING_RECONCILIATION_V1.md`.

---

## 0. Deployment Assumptions (Read First)

The repository is a **single-service app**. `server/index.ts` does the following in one process:

1. Registers API routes (`/api/*`) on an Express server.
2. Serves the built frontend from `dist/client` when that folder exists (`npm run build` produces `dist/server/index.js` and `dist/client`).
3. Listens on `process.env.PORT || 5000`.

Use `npm run build` then `npm run start`, with the build and start running in the **same Render service** so `dist/client` is present at startup.

### What is NOT available on Render (important)

| Capability | Local Windows behavior | Render (Linux server) behavior |
|---|---|---|
| Private case folders (`C:\MechanicsEye_Operations`) | Available and used when the folder exists | **Not used.** `canUseLocalCaseStorage()` returns false; intake falls back to the public database path. |
| Uploaded media (`./uploads`) | Local files persist | **Ephemeral.** Render's filesystem is not durable; uploaded bytes are lost on redeploy/restart and are not durable evidence. |
| In-memory `storage` (in `server/storage.ts`) | Session-local | Resets on restart; not durable account history. |

**Consequence:** For a trustworthy beta, durable case/evidence behavior must come from the **database** (case records) plus the **master intake webhook** (Make + downstream storage/email). Uploaded media persistence must be resolved before you promise reusable evidence. Nothing in this checklist hands that responsibility to Render's ephemeral filesystem.

---

## 1. Pre-Launch Owner Confirmation

- [ ] Confirm the canonical host is `https://www.getdrivable.com/` (with the `www.` redirect from the bare domain verified) and no stale search/email references use a different host.
- [ ] Confirm the launch is a **controlled beta**, not a coordinated public launch, and messaging reflects that (`Docs/README.md` "Current Operating Position").
- [ ] Confirm naming-review posture for **Drivable** and **ClearSale** is recorded and reversible (see `DRIVABLE_DOMAIN_AND_NAMING_RISK_REGISTER_V1.md`). Do not do irreversible brand production yet.
- [ ] Confirm emergency/safety exclusion is present before submission (non-emergency only; no driver-collect-while-moving guidance).
- [ ] Confirm support and human-review responder is available during the beta window.

---

## 2. Environment-Variable Checklist

Set these in the Render service's **Environment** section (secret storage). Never put real values in Git, docs, screenshots, logs, or test payloads.

| Variable | Required | Notes |
|---|---|---|
| `PORT` | No (default 5000) | Render injects a `PORT`; leave it. |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string used by `server/db.ts` and the buyer-knowledge route. The app degrades gracefully if absent, but intake persistence and Buyer Check depend on it. |
| `MASTER_INTAKE_WEBHOOK_URL` | **Yes (for intake routing)** | Make router URL for `MASTER_INTAKE` intake forwarding. Wrong value sends customer data to the wrong target — verify before traffic. |
| `PUBLIC_CASE_WEBHOOK_URL` | As configured | Optional public-case notification webhook. |
| `MECHANIC_EYE_INTAKE_WEBHOOK_URL` | As configured | Legacy diagnosis-path webhook; do not change casually. |
| `OPENAI_API_KEY` | Only if live AI is intended | If absent, `DRIVABLE_AI_MODE` falls back to mock. |
| `DRIVABLE_AI_MODE` | No | `mock` (default) or `live` (requires key). Keep `mock` for controlled beta unless a reviewed live workflow is proven. |

**Webhook cutover rule:** Before opening tester traffic, point `MASTER_INTAKE_WEBHOOK_URL` at the **controlled test target** and run the Make/router test checklist (`docs/automation/MAKE_MASTER_ROUTER_TEST_CHECKLIST_V1.md`). Record the intended target and the prior value for rollback.

**DATABASE_URL rule:** Do not run `npm run db:push` against a production/Render URL. Review `docs/data/DRIVABLE_DB_ENVIRONMENT_SAFETY_V1.md` and `docs/data/DRIVABLE_DB_MIGRATION_WARNING_V1.md` before any schema action.

---

## 3. Browser-Based Smoke-Test Checklist

Run against the **deployed** Render URL in a **signed-out fresh session** (private/incognito window so SPA state does not mask issues). Record URL, date, time, network, and device for each run.

### 3.1 Availability / Routing
- [ ] `https://www.getdrivable.com/` loads with no Render "service waking up" / "Application loading" interstitial lasting > a few seconds (log cold-start time). Closing cold-start is a marketing blocker (LS-001).
- [ ] Home renders the intended multi-product overview.
- [ ] Each launch path loads and its CTA is present: Drivable Check, Buyer Check, ClearSale, Mechanic Match, Help, Disclaimer, Terms, Privacy.
- [ ] **Do not** use/verify the broken `Mechanic's Eye Review` destination (renders Disclaimer today — blocker LS-002); do not link or advertise it.
- [ ] Direct URL, reload, and back/forward navigation on each launch route work.
- [ ] No browser console crash on the checked routes.

### 3.2 Intake End-to-End (non-emergency test case)
- [ ] Submit a **clearly labeled test case** (synthetic vehicle, no real private data, no real customer email) through the primary intake path.
- [ ] Confirm the response returns a case/reference and a webhook debug showing configured/forwarded state.
- [ ] Confirm the case row appears in the intended database, or that the intended downstream (Make) received it and no false success email is sent.
- [ ] Confirm no full `DATABASE_URL`, webhook, or customer-sensitive value appears in the response or logs.
- [ ] Confirm safety/non-emergency language and "possible cause, not diagnosis" boundaries are present (see `DRIVABLE_REPOSITORY_READINESS_AND_MARKETING_RELEASE_MATRIX_V1.md`).
- [ ] Upload test audio/video if advertised, and record whether the bytes are actually retained, analyzed, and delivered — or clearly state which modalities are not yet real (blocker LS-003).

### 3.3 Buy Check / Buyer Knowledge
- [ ] Buyer Check year/make/model lookup returns context when a knowledge pack exists and a clear "no pack / not vehicle-specific proof" fallback when it does not.
- [ ] Confirm `DATABASE_URL` must be present for this to return pack data.

---

## 4. iPhone / Mobile Acceptance Checklist

Test on the deployed URL using a real iPhone (Safari) and at a phone viewport via desktop dev tools. Record device model, iOS version, browser, and network.

- [ ] Site loads over cellular and Wi-Fi without layout breakage.
- [ ] Primary CTA is reachable **without scrolling through a large navigation block** (blocker LS-007 — ten-button nav currently dominates the first viewport at 390 px).
- [ ] Mobile navigation is accessible: correct focus management, labels, keyboard/dismiss, screen-reader names, zoom, and touch-target size.
- [ ] Forms are usable on a phone: inputs, selectors, file picker, date/any calendar controls, and submit all work.
- [ ] Uploads (photos/audio/video) work from a phone's camera/gallery where advertised, and failure states are visible.
- [ ] No horizontal overflow; text is readable at default zoom; contrast targets hold (see `DRIVABLE_COLOR_CONTRAST_AND_VISUAL_ACCESSIBILITY_AUDIT_V1.md`).
- [ ] Phone call/email/SMS contact fields, if present, respect platform behavior and disclosure.
- [ ] Signed-out fresh mobile session completes the primary launch path.
- [ ] Orientation (portrait/landscape) does not break the primary flow.

---

## 5. Privacy / Consent / Compliance Gate (Before Scaled Intake)

Beta is the smallest viable gate, but seller/evidence intake can still involve faces, voices, plates, VINs, locations, and contact data. Before broad beta recruitment:

- [ ] Privacy notice states retention, deletion/export, privacy contact, consent-version record, vendor/provider list, and any model-improvement choice (blocker LS-006; Terms contradict a permanent-upload/reusable-evidence promise today — LS-005).
- [ ] Terms and Privacy match the actual implemented storage behavior (they currently state permanent upload storage is not guaranteed; reconcile).
- [ ] A durable **contact-and-delivery contract** is chosen and implemented: verified email/contact delivery, a secure reference + retrieval secret, authenticated account history, or clearly ephemeral same-session output (LS-004). Do not promise "we'll email your report / track your case / return anytime" until it works.
- [ ] Evidence consent separates service processing, cross-workflow reuse, human/provider sharing, product improvement, and marketing; withdrawal/correction/deletion routes exist.
- [ ] Analytics (if enabled) use the approved minimal, privacy-safe schema from `DRIVABLE_PRIVACY_SAFE_ANALYTICS_AND_LAUNCH_DASHBOARD_CONTRACT_V1.md`.
- [ ] No secrets or private media are written to logs, docs, or commit history.

---

## 6. Rollback Checklist

Prepare **before** opening traffic. Rollback = stop customer-facing traffic and restore last known-good state.

### Pre-prepared recovery facts
- [ ] Rollback owner (Glenn) is recorded with contact and authority.
- [ ] Last known-good deploy commit is recorded and its build/start verified once.
- [ ] Prior `MASTER_INTAKE_WEBHOOK_URL` (and other webhook values) are stored so they can be restored.
- [ ] Render "deploy previous version" path is understood, or the known-good commit can be redeployed.
- [ ] A public status message is ready (see `DRIVABLE_LAUNCH_INCIDENT_AND_PUBLIC_STATUS_MESSAGES_V1.md`).

### Rollback triggers (stop traffic immediately if any)
- [ ] Wrong email/webhook recipient or route misfire (data sent to an unintended target).
- [ ] Customer output can bypass human review (`approved_to_send` not enforced).
- [ ] Raw JSON / case / report / outcome cannot be traced or linked.
- [ ] Critical data mismatch, lost raw JSON, duplicate processing, or false success email.
- [ ] Production crash, startup loop, or database insert/read regression affecting intake.
- [ ] Private data (VIN, contact, faces, voices, plates) leaks into logs, docs, or public responses.
- [ ] Uncertain webhook target or `DATABASE_URL` pointing at the wrong environment.

### Rollback procedure
1. Pause/stop inbound traffic and the inbound webhook/email path.
2. Preserve logs and commit/deploy IDs.
3. Restore the last known-good commit or webhook value through the owner.
4. Rerun Sections 3 and 4 smoke/mobile checks before resuming.
5. Log the incident and date in this checklist and the blocker board.

---

## 7. Launch-Day Owner Actions

Run from owner-only, signed-out, fresh sessions. Enter evidence for each.

- [ ] Confirm committed `SHA` == deployed `SHA` (write both here): expected `___` / deployed `___`.
- [ ] Confirm the build includes the intended frontend (`dist/client`) and start command is `npm run start`.
- [ ] Confirm the correct environment variables are set and the webhook target is the controlled test target.
- [ ] Run the Section 3 smoke test once on desktop and once on iPhone (Section 4) immediately before opening beta traffic.
- [ ] Confirm the responder (human review/support) is available for the beta window; record coverage and rotation.
- [ ] Confirm the beta traffic volume is capped (a fixed number of testers / low daily cap), not open-ended.
- [ ] Confirm no paid traffic, broad invitations, press embargo lift, creator coordination, or mass email is enabled for a beta.
- [ ] Confirm the previous webhook value and rollback facts (Section 6) are on hand.
- [ ] Record the go/no-go decision in `DRIVABLE_PRE_LAUNCH_GO_NO_GO_V1.md` with evidence.

### During launch-day window
- [ ] Watch the launch dashboard / backend health and error logs for startup, crash, latency, or webhook failures.
- [ ] Confirm first tester intake reaches the intended route and the first test case is traceable.
- [ ] Confirm no false success email and no wrong recipient.
- [ ] Log every observation in `DRIVABLE_TEST_ISSUE_LOG_V1.md` and `DRIVABLE_FIRST_TESTER_SESSION_LOG_V1.md`.

---

## 8. Not-Now / Deferred to Engineering Branches

These need engineering or product work and are intentionally **not** handled by this documentation lane. Track them on the blocker board and release them only when their own gates pass.

- [ ] Replace ephemeral `./uploads` behavior with durable, privacy-safe evidence storage (R2/object store with signed access, scanning, retention, deletion).
- [ ] Define the durable report/case delivery + retrieval contract and make Terms/Privacy match it.
- [ ] Close cold-start/waking-service behavior and prove capacity (LS-001).
- [ ] Fix or remove the `Mechanic's Eye Review` route (LS-002).
- [ ] Prove each evidence modality (photo/audio/video/vibration) actually accepts, retains, and analyzes bytes; update copy to verified modalities only (LS-003).
- [ ] Complete the privacy/data-flow/consent controls (LS-006) and accessible compact mobile navigation (LS-007).
- [ ] Any migrations, seed imports, vehicle-knowledge-pack builds, or NHTSA `--apply` (requires separate approved runbook: `docs/data/DRIVABLE_REAL_SEED_IMPORT_RUNBOOK_V1.md`, `DRIVABLE_DB_ENVIRONMENT_SAFETY_V1.md`).

---

## 9. Decision Record

- Decision level: `PUBLIC LAUNCH` / `BETA` / `FIRST TESTER` / `PAID TEST`
- Result: `GO` / `NO-GO`
- Approved by:
- Date/time:
- Expected commit:
- Deployed commit:
- Evidence summary:
- Open blockers:
- Conditions / limits (tester cap, window, excluded routes, support coverage):
- Next review date:

---

## 10. Source Facts Reviewed (this documentation pass)

- `package.json` — build/start scripts, single-service shape.
- `server/index.ts` — serves `dist/client` + `/api/*` from one Express process; `PORT` default 5000; CORS allowlist.
- `server/db.ts` / `server/public-case-db.ts` — `DATABASE_URL` usage, graceful DB degradation, redaction.
- `server/routes.ts` — intake flow, `canUseLocalCaseStorage()` gating (Windows-only private folders), webhook env vars, uploads to ephemeral `./uploads`.
- `server/case-storage.ts` — private evidence root `C:\MechanicsEye_Operations` (not available on Render).
- `server/drivable-ai-mode.ts` — mock/live selection from `DRIVABLE_AI_MODE` + `OPENAI_API_KEY`.
- Existing docs: `DRIVABLE_RENDER_DEPLOY_CHECKLIST_V1.md`, `DRIVABLE_PRE_LAUNCH_GO_NO_GO_V1.md`, `DRIVABLE_ENV_FLAGS_V1.md`, `DRIVABLE_LIVE_SITE_MARKETING_RECONCILIATION_V1.md`, `DRIVABLE_REPOSITORY_READINESS_AND_MARKETING_RELEASE_MATRIX_V1.md`, `DRIVABLE_DB_ENVIRONMENT_SAFETY_V1.md`.
