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
