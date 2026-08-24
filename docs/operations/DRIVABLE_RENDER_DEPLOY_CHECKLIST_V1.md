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

- [ ] Backend health endpoint responds, if one exists and applies to the deployed flow.
- [ ] Frontend requests target the intended backend.
- [ ] Render services show no obvious startup or crash loop.
- [ ] Environment variables have not been changed casually or copied into logs/docs.
- [ ] `DRIVABLE_REVIEWER_TOKEN` is set to a unique random secret in Render and is not present in the repository or logs.
- [ ] `DRIVABLE_SESSION_SECRET` is set to a different random value of at least 32 characters.
- [ ] `DRIVABLE_BETA_INVITE_CODE` is set and registration rejects a missing or incorrect invite.
- [ ] `DRIVABLE_PHOTO_UPLOAD_ENABLED=false` until durable private object storage and authenticated reviewer retrieval pass; set it `true` only for the verified launch environment.
- [ ] The deployed database has the reviewed `users` table and stores only `scrypt$...` password hashes for new beta accounts.
- [ ] Registration, sign-in, refresh, sign-out, and wrong-password behavior pass using disposable owner test accounts.
- [ ] An unauthenticated visitor cannot submit a Drivable case.
- [ ] A submitted case database record contains the authenticated owner’s user ID.
- [ ] A crafted request-body email cannot override the signed-in account email in case storage or downstream delivery.
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
