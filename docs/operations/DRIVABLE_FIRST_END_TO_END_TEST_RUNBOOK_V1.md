# Drivable First End-to-End Test Runbook V1

## Purpose

Use this runbook when Glenn has uninterrupted time to prove the five Make Master Intake Router branches. Test one route at a time and record every run.

## Pre-Checks

- [ ] Run `git pull --rebase origin main` and confirm the tested commit matches latest `origin/main`.
- [ ] Run `git status --short` and account for every local change.
- [ ] Confirm the latest intended commit is deployed to Render or the applicable frontend/backend host.
- [ ] Confirm Render/frontend loads and backend status or health endpoint responds, if applicable.
- [ ] Use only test identities and a Glenn-owned test inbox.
- [ ] Open the master router, test payloads, field mapping, route checklist, and pass/fail log.
- [ ] Confirm old scenarios remain available as backup.
- [ ] Record the current production webhook target securely for rollback; do not paste it into docs.
- [ ] Confirm the master webhook and scenario owner.
- [ ] Disable customer email modules or hard-code them to a Glenn-owned test inbox.
- [ ] Inspect `To`, `Cc`, `Bcc`, sender, reply-to, and `[TEST]` subject lines.
- [ ] Confirm the approved raw JSON storage location.
- [ ] Confirm the expected sheet tabs and that duplicate test rows can be identified.
- [ ] Confirm the Make scenario is off or in `Run once`, not freely processing production traffic.

## Make Setup

1. Turn on Make `Run once`.
2. Send only one matching test payload.
3. If Make does not expose the expected fields, redetermine the webhook data structure using the exact current test payload.
4. Recheck every mapping after redetermining. Do not assume old tokens still point to the correct fields.
5. Do not redetermine using real customer data.

## Evidence Required for Every Route

- Exactly one webhook bundle received.
- Only the expected branch fired.
- No sibling branch fired.
- The route's OpenAI module ran and produced the intended route-specific result.
- Exactly one expected sheet row or approved destination record was created.
- Required fields and controlled status were populated.
- Raw JSON and the AI summary/draft were stored.
- Admin/test email reached only the approved inbox.
- Customer email was disabled, draft-only, or delivered only to the Glenn-owned test inbox.
- No false success occurred after a failed write.
- Make run ID, screenshots, row reference, and email evidence were logged.

## What to Save

- Screenshot of the webhook bundle and selected route.
- Screenshot of sibling routes not firing.
- OpenAI module input/output or safe execution evidence.
- Google Sheets row number and screenshot with sensitive values minimized.
- Raw JSON storage reference.
- Admin/test email showing `To`, subject, and delivery time.
- Customer email module state or Glenn-owned test recipient.
- Make run ID, test timestamp, payload name, and final PASS/FAIL log.

## Pass / Fail Definition

`PASS` means every applicable evidence item is verified in one controlled run, no unintended branch or recipient is involved, and the expected record is complete.

`FAIL` means any required check is missing or wrong, including a misrouted branch, duplicate record, missing raw JSON, wrong AI result, incomplete sheet row, uncertain recipient, unintended email, false success, or untraceable run. Do not mark a partial run as `PASS`.

## Route 1: support-concierge-request

1. Send the matching `support-concierge-request` payload.
2. Verify only that branch fires.
3. Verify a useful support summary from the same branch's OpenAI module.
4. Verify one `Support_Concierge` row with contact, topic, urgency, message, scenario, report context, and `New Support Request`.
5. Verify raw JSON, stored AI summary, admin/test email, and no real customer email.
6. Record `PASS` or `FAIL`.

## Route 2: marketplace-seller

1. Reset Make to `Run once`.
2. Reopen the email module and confirm it is not mapped to `sellerEmail`.
3. Send the matching `marketplace-seller` payload.
4. Verify only that branch fires and its OpenAI result is a seller/condition summary.
5. Verify one `Seller_Intake` row with seller, vehicle, known issues, repairs, title, listing type, and `New Seller Intake`.
6. Verify raw JSON, stored summary, admin/test email, and no real seller email.
7. Record `PASS` or `FAIL`.

## Route 3: diagnosis

1. Reset Make to `Run once`.
2. Confirm customer email is not mapped to `customer.email`.
3. Send the matching `diagnosis` payload.
4. Verify only that branch fires.
5. Verify the OpenAI result uses possible causes, confidence, missing evidence, and next checks without certainty or guarantees.
6. Verify the existing diagnosis flow remains intact and the intended row/log is created without overwriting its status incorrectly.
7. Verify raw JSON, stored result, admin/test email, and no real customer email.
8. Record `PASS` or `FAIL`.

## Route 4: buyer-interest

1. Reset Make to `Run once`.
2. Confirm the live contract value is `buyer-interest`; stop if `marketplace-buyer-interest` remains unresolved.
3. Confirm customer email is not mapped to any incoming buyer/customer email field.
4. Send the matching `buyer-interest` payload.
5. Verify only that branch fires and its OpenAI result is a buyer-risk summary.
6. Verify one `Buyer_Interest` row with listing ID, buyer, vehicle, questions, scenario, report type, and `New Buyer Interest`.
7. Verify raw JSON, stored summary, admin/test email, and no real buyer email.
8. Record `PASS` or `FAIL`.

## Route 5: internal-diagnosis-response

1. Reset Make to `Run once`.
2. Confirm customer email is disabled.
3. Send the matching `internal-diagnosis-response` payload.
4. Verify only that branch fires.
5. Verify the intended internal draft/summary is generated and internal notes remain internal.
6. Verify one `Internal_Review_Log` row with case ID, reviewer, confidence, recommendation, decision paths, customer-ready summary, and `New Internal Review`.
7. Verify raw JSON, draft success status, admin/test draft or email, and no customer send.
8. Record `PASS` or `FAIL`.

## Cutover Gate

Do not cut over until all five routes have a documented final `PASS`, raw JSON and AI storage are verified, email recipients are proven, duplicates and error behavior are checked, old scenarios remain available, and the production target and rollback owner are known.

## Rollback Notes

If a production-controlled test fails:

1. Disable customer-facing send modules first.
2. Restore the recorded previous webhook value.
3. Confirm the old scenario receives traffic.
4. Run one Glenn-owned test through the restored path.
5. Preserve failed run IDs, raw JSON references, rows, timestamps, and screenshots.
6. Mark the affected route `FAIL`.
7. Fix and retest in `Run once` before another cutover attempt.

## Session Result

- Tester:
- Date/time:
- Master scenario:
- Test inbox:
- Routes passed:
- Routes failed:
- Issues logged:
- Cutover decision: `NO-GO` / `READY FOR CONTROLLED CUTOVER`
- Notes:
