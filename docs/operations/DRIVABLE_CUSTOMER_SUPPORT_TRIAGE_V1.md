# Drivable Customer Support Triage V1

## Purpose

Help Glenn classify tester and customer messages, ask for the minimum useful information, avoid unsupported promises, and route safety-critical cases to human or in-person help.

Log every case in the approved support/test issue record with the case ID, category, assigned status, owner, and next action.

## Triage Table

| Category | What to ask | What not to promise | Human / in-person trigger | Where to log | Suggested status |
|---|---|---|---|---|---|
| Stuck/roadside | Safe location, vehicle state, warning lights, smoke/odor/leak, braking/steering, whether help is already present | That driving, waiting, a temporary action, or towing is definitely safe | Any danger, active traffic exposure, brake/steering loss, overheating, fuel leak, smoke/fire, severe instability, or uncertainty | Support record plus issue log for product failures | `needs_human_review`; use `do_not_send` for unsafe/unreviewed drafts |
| Diagnosis/report question | Case ID, vehicle, exact report section, symptom change, evidence or mechanic findings | Confirmed diagnosis, guaranteed repair, safety clearance, or that inspection is unnecessary | New high-risk symptom, conflicting evidence, high-cost decision, or customer reliance concern | Case/support log; outcome log when results exist | `needs_more_info` or `needs_human_review` |
| Missing info response | Case ID, requested item, safe details/media supplied, what cannot be provided | That more media will prove the cause or that unsafe evidence collection is required | Customer would need to drive, crawl under, touch hot parts, or recreate danger | Original case and missing-info record | `needs_more_info`; move to `ai_draft_ready` only after intake is adequate |
| Buyer risk review | Listing ID, seller claims, title/ownership evidence, inspection access, records, red flags, customer decision | Verified title, ownership, mileage, seller honesty, condition, or purchase outcome | High-value purchase, title conflict, structural/safety concern, pressure to skip inspection | Buyer interest/case log and issue log if routing failed | `needs_more_info` or `needs_human_review` |
| Seller/as-is listing | Vehicle facts, known issues, repairs, title status, evidence, disclosure questions | Certification, guaranteed sale, buyer, price, title/legal result, or complete disclosure compliance | Title/ownership uncertainty, safety defect, legal dispute, or misleading claim | Seller intake/case log | `needs_more_info` or `needs_human_review` |
| Payment/status | Case ID, offer, payment reference, provider evidence, expected deliverable | That customer-entered proof means paid, guaranteed refund timing, or entitlement without verification | Dispute, duplicate charge, refund request, fraud concern, or unclear payment source | Approved payment/support log; never store full card data | `needs_human_review`; do not mark paid without verification |
| Technical issue | Page/route, device/browser, timestamp, steps, screenshot, visible error, whether submission may have succeeded | Immediate fix, data recovery, or that retrying cannot duplicate a submission | Possible duplicate, data exposure, wrong customer record, broken submission, or production outage | Test issue log and blocker board when material | Operational `Open`/`Investigating`; report status unchanged until verified |
| Unsafe/high-risk symptoms | Current location, immediate danger, brake/steering control, temperature/oil warnings, smoke/fire/fuel odor, wheel/tire failure, severe knocking or instability | Permission to drive, diagnosis, tow/no-tow certainty, or remote safety clearance | Immediately require qualified in-person/emergency help when danger is present or control is uncertain | Safety case record and issue log for any product miss | `needs_human_review` or `do_not_send`; never auto-send |

## Response Rules

1. Put immediate safety before collecting more product information.
2. Use plain uncertainty language: "based on the information provided," "possible," and "in-person help is recommended."
3. Keep internal notes and learning notes out of customer replies.
4. Do not move a report to `approved_to_send` without the required human approval.
5. Link follow-up outcomes to the original case without rewriting the original recommendation.
6. Escalate privacy, wrong-recipient, mixed-record, payment dispute, or reported-harm issues immediately.

## Triage Record

- Received at:
- Customer/tester alias:
- Case ID:
- Category:
- Immediate safety concern: Yes / No / Unknown
- Questions asked:
- Information received:
- Assigned status:
- Human owner:
- In-person/emergency referral:
- Log location:
- Next action:
- Follow-up due:
