# Make Master Router Cutover Plan V1

## Purpose

Define the test, approval, production cutover, and rollback gates for moving Drivable intake traffic to the Make Master Intake Router without losing records, misrouting requests, or emailing real customers during testing.

Use this plan with:

- `MAKE_MASTER_INTAKE_TEST_PAYLOADS_V1.md`
- `MAKE_MASTER_INTAKE_ROUTER_FIELD_MAPPING_V1.md`
- `MAKE_MASTER_ROUTER_TEST_CHECKLIST_V1.md`
- `MAKE_ROUTE_PASS_FAIL_LOG_TEMPLATE_V1.md`
- `MAKE_EMAIL_TESTING_GUIDE_V1.md`

## When Not to Cut Over

Do not change the production `MASTER_INTAKE_WEBHOOK_URL` when any of the following is true:

- Any required route is not marked final `PASS`.
- A route fires the wrong branch or more than one branch.
- The live buyer intake contract is unresolved between `buyer-interest` and `marketplace-buyer-interest`.
- Raw JSON retention or the route's AI summary cannot be verified.
- Required workbook fields, identifiers, or controlled statuses are missing.
- Admin notification has not reached a monitored Glenn-owned inbox.
- A customer email module can reach a real customer during testing.
- Customer copy contains unreviewed AI output, internal notes, promises, or diagnostic certainty.
- Duplicate processing, duplicate email behavior, or the error path is untested.
- The existing production scenarios are unavailable as a backup.
- The proposed master webhook URL, environment owner, or rollback value is unknown.

## Required Route Pass Checklist

Record every run in `MAKE_ROUTE_PASS_FAIL_LOG_TEMPLATE_V1.md`. A route passes only when all applicable checks below are verified:

- [ ] The matching test payload was used.
- [ ] The webhook received exactly one bundle.
- [ ] Only the correct branch fired.
- [ ] No wrong or sibling branch fired.
- [ ] The route's own OpenAI module produced the intended result.
- [ ] The expected sheet or approved destination received exactly one record.
- [ ] Minimum contact, vehicle, scenario, report, message, and identifier fields were populated where applicable.
- [ ] The controlled status was populated correctly.
- [ ] Original raw JSON was retained in Make execution history, a Make Data Store, or another approved secure archive.
- [ ] The AI summary or draft was stored in the correct route-specific field.
- [ ] Admin notification reached only the approved monitored inbox.
- [ ] Customer email was disabled or redirected only to a Glenn-owned test inbox.
- [ ] No real customer, seller, or buyer received a test message.
- [ ] Errors were captured without secrets or false success messages.
- [ ] Duplicate-run behavior was checked.
- [ ] The route has a final documented `PASS`.

## Required Route Sign-Off

| Route | Required result | Primary evidence |
|---|---|---|
| `support-concierge-request` | Must pass | `Support_Concierge` row, raw JSON, same-route AI summary, admin/test email |
| `marketplace-seller` | Must pass | `Seller_Intake` row, raw JSON, same-route AI summary, admin/test email |
| `diagnosis` | Must pass | Existing diagnosis flow remains intact, approved row/log, raw JSON, confidence-rated AI result |
| `buyer-interest` | Must pass | `Buyer_Interest` row, raw JSON, same-route AI summary, contract value confirmed |
| `internal-diagnosis-response` | Must pass | `Internal_Review_Log` row, raw JSON, internal draft/summary, no customer send |

## Email Verification Gate

- [ ] Admin notification recipient is a monitored admin email or Glenn-owned test inbox.
- [ ] Test subject lines include `[TEST]` and the route name.
- [ ] `To`, `Cc`, and `Bcc` contain only approved test recipients.
- [ ] Customer email modules are disabled, draft-only, or hard-coded to a Glenn-owned test inbox.
- [ ] Customer recipients are not mapped to `sellerEmail`, `buyerEmail`, `customer.email`, `customerEmail`, or `email` during testing.
- [ ] Internal notes and unreviewed AI output cannot enter customer copy.
- [ ] The sender and reply-to behavior are intentional and verified.

## Pre-Cutover Gate

- [ ] All five required routes have a final `PASS`.
- [ ] Admin email/test inbox behavior is verified.
- [ ] Customer email is disabled or verified only with a Glenn-owned test inbox.
- [ ] Raw JSON storage is verified for every route.
- [ ] AI summary storage is verified for every route.
- [ ] Old scenarios remain on and available as backup.
- [ ] The current production `MASTER_INTAKE_WEBHOOK_URL` value is recorded securely for rollback.
- [ ] The new master webhook URL is verified without placing it in docs, sheets, email, or source control.
- [ ] Cutover owner, observer, date, and rollback decision-maker are named.

## Production Cutover

1. Put the master scenario in the approved production-ready state.
2. Confirm the old scenarios remain enabled as backup and cannot duplicate customer email.
3. Confirm customer-facing modules are still disabled unless separately approved route by route.
4. Change production `MASTER_INTAKE_WEBHOOK_URL` only after every pre-cutover check passes.
5. Submit one controlled production test using a Glenn-owned email.
6. Verify the correct branch, destination row, raw JSON, AI summary, status, and admin notification.
7. Monitor the first production runs for unmatched routes, duplicates, mapping errors, and email recipients.
8. Keep old scenarios available until the agreed observation period is complete.

## Rollback Steps

1. Stop or disable the master scenario's customer-facing send modules first.
2. Restore the previously recorded production `MASTER_INTAKE_WEBHOOK_URL`.
3. Confirm the old scenario or scenarios are active and receiving traffic.
4. Run one controlled test with a Glenn-owned inbox through the restored path.
5. Confirm the expected record, admin notification, and no duplicate customer email.
6. Preserve failed master-router runs, raw JSON references, timestamps, and safe error details.
7. Mark affected route logs `FAIL` and document the failure and rollback time.
8. Fix and retest the affected route in `Run once` mode before proposing another cutover.
9. Do not delete the master scenario or test evidence during rollback.

## Cutover Record

- Cutover owner:
- Observer:
- Approved by:
- Cutover date/time:
- Previous webhook value stored securely by:
- Controlled production test run ID:
- Observation period:
- Final result: `PASS` / `ROLLBACK`
- Notes:
