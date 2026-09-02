# Drivable Render Deploy Checklist V1

## Purpose

Verify deployed frontend and backend behavior before any tester traffic. This checklist does not authorize Render configuration or environment changes.

## Deployment Record

- Date/time:
- Reviewer:
- Expected commit:
- Deployed commit:
- Frontend URL:
- Backend URL:

## Frontend Checks

- [ ] Latest intended commit is deployed.
- [ ] `/preview-hub` opens.
- [ ] `/start` opens.
- [ ] `/help` opens.
- [ ] `/report-preview` opens.
- [ ] `/roadside-preview` opens.
- [ ] `/send-safety-preview` opens.
- [ ] Navigation and next actions on the tested flow are usable.
- [ ] Mobile viewport has no obvious overflow or blocked controls.
- [ ] No obvious browser console crash appears on the checked routes.

## Backend / Integration Checks

- [ ] Public liveness endpoint `/api/health/live` returns `200` with no configuration or customer details.
- [ ] Reviewer-authenticated readiness endpoint `/api/health/readiness` returns `200`; any `503` keeps tester traffic off until every reported gate is resolved.
- [ ] Frontend requests target the intended backend.
- [ ] Render services show no obvious startup or crash loop.
- [ ] Environment variables have not been changed casually or copied into logs/docs.
- [ ] `DRIVABLE_REVIEWER_TOKEN` is set to a unique random secret in Render and is not present in the repository or logs.
- [ ] `DRIVABLE_SESSION_SECRET` is set to a different random value of at least 32 characters.
- [ ] `DRIVABLE_BETA_INVITE_CODE` is set and registration rejects a missing or incorrect invite.
- [ ] `DRIVABLE_PUBLIC_ORIGIN` is the exact canonical HTTPS origin with no path.
- [ ] `DRIVABLE_TERMS_VERSION`, `DRIVABLE_PRIVACY_VERSION`, and `DRIVABLE_CONSENT_VERSION` identify the approved launch documents and consent contract.
- [ ] `DRIVABLE_PHOTO_UPLOAD_ENABLED=false` until durable private object storage and authenticated reviewer retrieval pass; set it `true` only for the verified launch environment.
- [ ] The evidence bucket blocks all public access and uses least-privilege application credentials scoped to the intended bucket/prefix.
- [ ] S3-compatible bucket, region, endpoint, and credential variables are configured without appearing in logs or repository files.
- [ ] Upload, reviewer-only retrieval, partial-upload rollback, and case deletion pass against a disposable staging case.
- [ ] Missing/invalid storage configuration keeps the public photo capability off.
- [ ] The deployed database has the reviewed `users` table and stores only `scrypt$...` password hashes for new beta accounts.
- [ ] The reviewed launch-control migration has been applied in staging only after backup/rollback review; consent and review tables, constraints, and append-only triggers are verified before runtime capability gates can turn green.
- [ ] `DRIVABLE_LAUNCH_CONTROLS_ENABLED=true` is set only after the staging schema verification above; reviewer draft/final/approve/reject/supersede routes return `503` when the flag or schema is incomplete.
- [ ] Review approvals record the opaque identity derived from the authenticated reviewer credential; any request-body `reviewerRef` is ignored.
- [ ] Stored consent and review records are runtime-validated on read; malformed booleans, versions, identities, timestamps, or bindings fail closed.
- [ ] Registration, sign-in, refresh, sign-out, and wrong-password behavior pass using disposable owner test accounts.
- [ ] An unauthenticated visitor cannot submit a Drivable case.
- [ ] A submitted case database record contains the authenticated owner’s user ID.
- [ ] Repeated registration/login attempts return `429` without revealing whether an email exists.
- [ ] Repeated public-form and authenticated-intake submissions are throttled and include a retry interval.
- [ ] Before running more than one web-service instance, replace the process-local limiter with a shared atomic rate-limit store.
- [ ] A crafted request-body email cannot override the signed-in account email in case storage or downstream delivery.
- [ ] Follow-up audio/video is labeled reviewer evidence—not model-analyzed input—and vibration payloads are rejected without storage or synthetic readings.
- [ ] Application logs contain no full public case packet or customer complaint/email dump.
- [ ] Internal routes reject a missing or incorrect reviewer token and accept the configured token over HTTPS.
- [ ] Public users cannot list cases, open case details, mutate consultations, or retrieve legacy uploads.
- [ ] `MASTER_INTAKE_WEBHOOK_URL` points to the intended controlled target before any cutover.
- [ ] Make remains off or in the approved test state until router testing begins.

## Result

- Frontend result: `PASS` / `FAIL`
- Backend result: `PASS` / `FAIL` / `NOT APPLICABLE`
- Issues logged:
- Tester traffic allowed: Yes / No
- Approved by:

## Rollback Note

If the deployed commit is wrong, a route crashes, backend health fails, or the webhook target is uncertain, stop tester traffic. Restore the last known-good deploy or webhook value through the approved owner, preserve logs and commit IDs, and rerun this checklist before resuming.
