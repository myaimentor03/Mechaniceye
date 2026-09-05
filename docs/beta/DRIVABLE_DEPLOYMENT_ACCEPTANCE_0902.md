# Drivable Deployment Acceptance — Beta Smoke 0902

**Date:** 2026-09-02
**Branch:** `qa/drivable-production-smoke-0902`
**Purpose:** Production deployment verification system for the integrated Drivable beta.

---

## 1. Render Single-Service Deployment

Drivable runs as a **single Render Web Service**:

- **Build command:** `npm install && npm run build`
  - Vite bundles the React SPA into `dist/client/`
  - esbuild bundles the Express server into `dist/server/index.js`
  - SPA route fallbacks are generated into `dist/client/` for client-side routes
- **Start command:** `node dist/server/index.js`
- **Port:** `PORT` environment variable (Render default: `10000`)

### How it works in production

1. Express serves static files from `dist/client/`
2. Any `GET` request with `Accept: text/html` for a non-`/api` route without a file extension is served `index.html` (SPA fallback)
3. All `/api/*` routes are handled by the Express backend
4. No separate frontend service or CDN is required

### Deploy steps

1. Push to the branch connected to the Render service
2. Render auto-builds and deploys
3. Run the smoke script against the deployed URL
4. Verify readiness endpoint returns 200
5. Begin controlled tester traffic

---

## 2. Domain Configuration

### Primary domains

| Domain | Purpose |
|--------|---------|
| `getdrivable.com` | Primary customer-facing domain |
| `www.getdrivable.com` | Canonical redirect to `getdrivable.com` |

### Render service

- The Render service URL (e.g., `https://your-service.onrender.com`) is the origin
- Custom domains are added in Render Dashboard → Settings → Custom Domains
- Render provisions TLS certificates automatically
- DNS must point `getdrivable.com` and `www.getdrivable.com` to Render's DNS target

### Checklist

- [ ] `getdrivable.com` resolves to Render
- [ ] `www.getdrivable.com` redirects to `getdrivable.com` (or serves same content)
- [ ] TLS certificate is active (check in Render Dashboard)
- [ ] `DRIVABLE_PUBLIC_ORIGIN=https://getdrivable.com` is set in Render env vars
- [ ] No mixed-content warnings (all assets load over HTTPS)

---

## 3. Environment Variable Checklist

### Required for all deployments

| Variable | Description | Source |
|----------|-------------|--------|
| `PORT` | Render sets this automatically | Render |
| `DATABASE_URL` | Neon PostgreSQL connection string | See §5 |
| `DRIVABLE_REVIEWER_TOKEN` | Bearer token for reviewer endpoints (min 32 chars) | Generate randomly |
| `DRIVABLE_SESSION_SECRET` | Session signing secret (min 32 chars) | Generate randomly |
| `DRIVABLE_BETA_INVITE_CODE` | Invite code for new registrations | Set manually |
| `DRIVABLE_PUBLIC_ORIGIN` | Canonical HTTPS origin, e.g. `https://getdrivable.com` | Set manually |

### Feature flags

| Variable | Default | Description |
|----------|---------|-------------|
| `DRIVABLE_AI_MODE` | `mock` | `mock` or `live`; live requires `OPENAI_API_KEY` |
| `DRIVABLE_PHOTO_UPLOAD_ENABLED` | `false` | Set `true` only after R2/storage verified |
| `DRIVABLE_LAUNCH_CONTROLS_ENABLED` | `false` | Enable after review migration verified in staging |

### Legal / consent

| Variable | Description |
|----------|-------------|
| `DRIVABLE_TERMS_VERSION` | Version tag for terms of service |
| `DRIVABLE_PRIVACY_VERSION` | Version tag for privacy policy |
| `DRIVABLE_CONSENT_VERSION` | Version tag for consent contract |

### Webhook / integration

| Variable | Description |
|----------|-------------|
| `MASTER_INTAKE_WEBHOOK_URL` | Make.com webhook for master intake forwarding |
| `OPENAI_API_KEY` | Required only for `DRIVABLE_AI_MODE=live` |

### Object storage (R2 / S3)

| Variable | Description |
|----------|-------------|
| `DRIVABLE_EVIDENCE_S3_BUCKET` | Bucket name for evidence uploads |
| `DRIVABLE_EVIDENCE_S3_REGION` | AWS region |
| `DRIVABLE_EVIDENCE_S3_ENDPOINT` | S3-compatible endpoint URL |
| `DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID` | Access key |
| `DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY` | Secret key |
| `DRIVABLE_EVIDENCE_S3_FORCE_PATH_STYLE` | `false` for AWS S3; `true` for MinIO/compatible |

---

## 4. R2 / Object Storage Configuration Checklist

Private object storage is required for photo evidence uploads.

### Setup steps

1. Create an S3-compatible bucket (Cloudflare R2, AWS S3, or compatible)
2. **Block all public access** on the bucket
3. Create IAM credentials with least-privilege access scoped to the bucket and prefix
4. Set the six `DRIVABLE_EVIDENCE_S3_*` environment variables in Render
5. Set `DRIVABLE_PHOTO_UPLOAD_ENABLED=true` only after verification

### Verification

- [ ] Bucket exists and blocks public access
- [ ] IAM credentials are scoped to the specific bucket (not `*`)
- [ ] Upload works via the customer intake flow (test with `TEST_WRITE=true`)
- [ ] Reviewer retrieval works via `/api/internal/evidence/:caseId/:attachmentId`
- [ ] Missing/invalid storage config keeps photo upload disabled (check `/api/capabilities`)
- [ ] No S3 credentials appear in logs, repository, or client-side responses

---

## 5. DATABASE_URL Check

Drivable uses **Neon PostgreSQL** with the `pg` driver and Drizzle ORM.

### Verification

1. Confirm `DATABASE_URL` is set in Render environment variables
2. Connection string format: `postgresql://user:password@host/database?sslmode=require`
3. Run the smoke test — if `/api/health/db` returns 200 (requires reviewer token), the connection is healthy
4. Verify migrations are current: check that the `users`, consent, and review tables exist
5. Check that `users.password` contains only `scrypt$...` hashes (no plaintext)

### Common issues

| Symptom | Likely cause |
|---------|-------------|
| `/api/health/db` returns 503 | Connection refused — check Neon project is active |
| Migration errors on startup | Schema out of date — run `npm run db:push` in staging |
| Slow cold starts | Neon compute may be suspended — check Neon dashboard |

---

## 6. Rollback Steps

### If the deployed commit is wrong

1. **Immediately** in Render Dashboard: go to the service → Events → find the last known-good deploy → click **Rollback**
2. Verify the rollback deployed: check that the service URL returns expected content
3. Run the production smoke script against the rolled-back deploy
4. If using custom branch deploys: re-deploy the known-good branch

### If the backend crashes on startup

1. Check Render service logs for the error
2. Common causes: missing env var, database unreachable, bad migration
3. Rollback to the last working deploy via Render Dashboard
4. Fix the issue in the branch, test locally, then re-deploy

### If webhook target is wrong

1. Update `MASTER_INTAKE_WEBHOOK_URL` in Render env vars to point to the correct target
2. The change takes effect on the next request (no redeploy needed)

### Rollback record

- Date/time of rollback:
- Commit rolled back from:
- Commit rolled back to:
- Reason:
- Verified by:

---

## 7. iPhone / Mobile Acceptance Checklist

Drivable targets iPhone Safari as the primary mobile experience.

### Device checklist

- [ ] **iPhone 15/16 (iOS 17+)**: Homepage loads, vehicle selectors work, form is usable
- [ ] **iPhone SE (small screen)**: No content overflow, buttons are tappable (min 44px touch target)
- [ ] **iPad / tablet**: Layout is usable, no broken columns

### Functional checks

- [ ] Vehicle year/make/model dropdowns are scrollable and selectable
- [ ] Photo upload opens camera roll and allows multi-select
- [ ] Photo previews display correctly after selection
- [ ] Consent checkboxes are tappable and visually checked
- [ ] Form submission works (with `DRIVABLE_PHOTO_UPLOAD_ENABLED=true` if testing photo flow)
- [ ] No horizontal scroll on any screen
- [ ] No overlapping text or buttons
- [ ] Safe area (notch/Dynamic Island) does not obscure content

### Performance

- [ ] First contentful paint < 3 seconds on 4G
- [ ] No layout shift after initial render
- [ ] Images/photos load progressively

### Accessibility

- [ ] Text is readable without zoom (min 16px body text)
- [ ] Form inputs have associated labels
- [ ] Color contrast meets WCAG AA
- [ ] VoiceOver can navigate the intake form

---

## 8. Running the Production Smoke Script

### Read-only (default)

```bash
BASE_URL=https://getdrivable.com node scripts/production-smoke.mjs
```

### With reviewer token (for auth-gated health checks)

```bash
BASE_URL=https://getdrivable.com \
DRIVABLE_REVIEWER_TOKEN=<your-token> \
node scripts/production-smoke.mjs
```

### With write/intake tests (opt-in)

```bash
BASE_URL=https://getdrivable.com \
DRIVABLE_REVIEWER_TOKEN=<your-token> \
TEST_WRITE=true \
node scripts/production-smoke.mjs
```

### What the script tests

| Check | Method | Auth required | Safe for production |
|-------|--------|---------------|---------------------|
| Homepage returns HTML | GET / | No | Yes |
| SPA fallback (/start, /help, /buyer-check) | GET | No | Yes |
| /api/health/live | GET | No | Yes |
| /api/health/readiness | GET | Yes (Bearer) | Yes |
| /api/health/db | GET | Yes (Bearer) | Yes |
| /api/capabilities | GET | No | Yes |
| Unknown API route → 404 | GET | No | Yes |
| CORS: unknown origin rejected | GET | No | Yes |
| CORS: allowed origin reflected | GET | No | Yes |
| Security headers | GET | No | Yes |
| /api/subscription/tiers | GET | No | Yes |
| /api/mechanics | GET | No | Yes |
| POST marketplace seller intake | POST | No | **Only with TEST_WRITE=true** |
| POST buyer interest | POST | No | **Only with TEST_WRITE=true** |
| POST mechanic match request | POST | No | **Only with TEST_WRITE=true** |
| POST concierge request | POST | No | **Only with TEST_WRITE=true** |

### Exit codes

- `0` — all checks passed
- `1` — one or more checks failed

---

## 9. Post-Deploy Verification Flow

1. Run smoke script (read-only) → all GET checks pass
2. Run smoke script with `DRIVABLE_REVIEWER_TOKEN` → readiness returns 200
3. Open `https://getdrivable.com` on iPhone Safari → homepage loads
4. Complete iPhone / mobile acceptance checklist (§7)
5. Run smoke script with `TEST_WRITE=true` → POST validation checks pass
6. Manually test one full intake flow with a test case
7. Verify no sensitive data in Render logs
8. Open controlled tester traffic
