# Drivable Controlled Paid Beta Program V1

## Purpose

Run a small, owner-operated beta that earns honest early revenue while proving that Drivable can safely intake, review, deliver, support, and learn from real vehicle decisions.

This program does not approve a public launch. Drivable provides informational, confidence-rated decision support based on information supplied by the customer. It is not a confirmed diagnosis, inspection, repair authorization, emergency service, warranty, or safety clearance.

## Program Owner and Operating Rule

Glenn is the beta owner unless another named person is recorded in the case log. The owner controls admission, payment verification, human review, delivery, support, refunds, follow-up, incident response, and each expansion decision.

Operate one case at a time until the applicable cohort gate is passed. Never use beta demand to waive a safety, privacy, review, or capacity control.

## Beta Sequence

| Stage | People | Charge | Purpose | Maximum active cases |
|---|---|---:|---|---:|
| 0. Owner-operated tests | Glenn-owned identities and inboxes | No | Prove routing, records, review, delivery, follow-up, and rollback | 1 |
| 1. Trusted unpaid testers | 3-5 known people, invited one at a time | No; record `Comped` | Find misunderstanding and fulfillment failures on real, stable cases | 1 |
| 2. First paid cohort | 5 eligible customers | Yes | Validate willingness to pay and the complete service obligation | 2, subject to capacity formula |
| 3. Controlled paid expansion | Next 10 paid customers | Yes | Test repeatability without public or uncapped traffic | Capacity formula, maximum 3 |

Do not skip a stage. The broader tester counts in the local launch plan remain future milestones; this plan controls the narrower path to the first paid evidence.

## Narrow First Paid Offer

### Offer

**First Look Report — controlled paid beta**

Eligible use: an owner has one stable, non-emergency current vehicle concern and wants a clearer next step before speaking with a shop or deciding what evidence to gather.

Included:

- Submitted vehicle and concern summary.
- Confidence-rated possible cause paths, not a confirmed diagnosis.
- Supporting and conflicting evidence.
- Missing evidence and the smallest useful next questions.
- Safety/urgency rating, including unknown when evidence is insufficient.
- Conservative next checks and a short mechanic script.
- Clear limitations and in-person inspection recommendation where appropriate.
- One correction request for a factual input or clear report error submitted within seven calendar days.

Not included:

- A Full Decision Report, repair-versus-sell analysis, buyer review, seller pack, title review, repair estimate, parts recommendation, live call, emergency response, inspection, certification, or ongoing chat.
- A promise to identify the cause, approve driving, replace a mechanic, or produce a particular financial result.

Eligibility requires one vehicle, one current concern, adequate safe evidence, a monitored email address, acceptance of the beta limitations and privacy notice, and agreement to a short follow-up. Decline or redirect cases outside this scope before taking payment.

### Price Hypothesis — Not a Market Fact

**Hypothesis:** charge **$24 USD** for each of the first five paid First Look Reports. This is a test price selected from the repository's `$19-$29` planning range; it is not evidence of market value, competitive pricing, or customer willingness to pay.

Do not discount within the first five paid cases. If Drivable caused material delay or service failure, resolve it under the refund policy rather than changing price informally.

Validate the hypothesis with behavior, not compliments:

- Record eligible offers made, accepted, abandoned, paid, refunded, and completed.
- Ask every paid customer after delivery whether the value was lower than, about equal to, or higher than $24, and why.
- Ask unpaid testers what they would pay before revealing the test price, but keep those answers separate from paid conversion.
- Record review minutes, total fulfillment minutes, payment cost, support minutes, and refunds per case.
- After five completed paid cases, retain, raise, lower, or reject the hypothesis only in a written decision record.

No price conclusion is valid if fewer than five eligible people were actually offered the same scope and price, if the scope varied materially, or if friends felt pressured to buy.

## Admission, Rejection, and Escalation

### Accept only when all are true

- The case fits the narrow offer and is not an emergency.
- The customer can gather evidence without driving, recreating danger, crawling under the vehicle, touching hot parts, or opening a pressurized system.
- No active critical trigger is reported.
- The intake can be linked to one case ID without mixing records.
- Human review capacity exists inside the promised turnaround.
- Consent is recorded before collecting or using submitted media.

### Reject before payment

- Emergency, crash, active roadside danger, reported harm, insurance/litigation dispute, fraud, or urgent legal/title question.
- Request for safety clearance, a guaranteed diagnosis or repair, a precise cost promise, or permission to drive.
- High-value transaction, structural issue, title conflict, or pre-purchase inspection substitute.
- Multiple vehicles or materially separate concerns.
- The customer will not accept limitations, consent terms, or follow-up expectations.
- Safe evidence and minimum vehicle/symptom context are unavailable.
- Capacity is full or the turnaround cannot be met.

Use a plain rejection: the case is outside this beta's remote scope; no diagnostic or safety conclusion is being made; qualified in-person, roadside, emergency, inspection, legal, or other help may be appropriate.

### Escalate and stop ordinary fulfillment

Set `needs_human_review` or `do_not_send`, do not send a normal report, and contact the owner immediately for:

- Brake failure or severe braking loss; steering loss, binding, or control problems.
- Overheating or active coolant loss; fuel leak or strong fuel odor; smoke, fire, arcing, or burning odor.
- Oil-pressure warning, wheel/tire/hub/suspension separation risk, violent shaking, severe instability, or unpredictable operation.
- New high-risk facts, contradictory evidence, low/insufficient confidence with likely reliance, or a high-cost decision.
- Wrong recipient, mixed record, exposed data, duplicate charge, payment dispute, threat, reported harm, or near harm.

For immediate danger, advise the person to prioritize a safe location and qualified emergency or roadside help. Drivable must not decide whether driving or towing is safe remotely.

## Case Workflow and Human Review

1. **Recruit and screen.** Give the exact scope, price or comped status, turnaround, limitations, and eligibility questions before collecting sensitive material.
2. **Consent and case creation.** Record case ID, cohort, consent version/time, contact channel, scenario, promised turnaround, and payment status. Never store full card data.
3. **Payment verification.** For paid cases, use the approved provider's record as source of truth. A screenshot, email, customer claim, webhook text, or sheet edit alone does not prove `Paid`.
4. **Intake check.** Confirm one vehicle/concern, safe evidence, completeness, identity separation, and risk signals. Request only the minimum missing information once; do not extend the deadline until the customer responds and the new due time is acknowledged.
5. **Draft.** Preserve submitted facts separately from AI or human inferences. Preserve the original draft and its mode. Mock output is internal test data and can never be customer-sent.
6. **Human review.** The named reviewer checks every beta report; there is no automatic send.
7. **Review checklist.** Verify vehicle/case match, observations versus conclusions, possible-cause wording, supporting/conflicting/missing evidence, confidence rationale, urgency, stop-driving triggers, safe evidence requests, next checks, mechanic script, scope, limitations, and absence of certainty or internal notes.
8. **Approval.** Only an explicit `approved_to_send` with reviewer, timestamp, and final version authorizes delivery. `needs_more_info`, `needs_human_review`, `do_not_send`, mock, or missing status blocks delivery.
9. **Delivery.** Recheck `To`, `Cc`, `Bcc`, sender, reply-to, attachment/link, case ID, and final version. Send only to the customer recorded on the case. Log delivery time and evidence.
10. **Support and correction.** Acknowledge questions within the support window, preserve the original report, and version any correction.
11. **Outcome follow-up.** At 3-7 days, and again at 21-30 days when an outcome remains pending, record action, inspection/repair result, cost if volunteered, evidence level, usefulness, and interview responses.
12. **Close.** Record final status, fulfillment/support time, payment/refund state, privacy requests, issues, and whether the case counts toward a gate.

### Reviewer authority and competence

Before paid testing, name the reviewer and document what qualifies that person to review the offered scope. If no qualified reviewer is available for a flagged case, decline/refund and refer to in-person help; do not substitute confident wording for competence.

## Turnaround and Capacity

### Promise

Promise a reviewed report within **two business days after a complete eligible intake and verified payment**. This is an operating hypothesis, not a permanent service level. Do not advertise same-day or emergency service.

Business hours and holidays must be stated wherever the promise is made. Tell the customer promptly if intake is incomplete or a case is declined.

### Capacity formula

At the start of each day calculate:

`available case slots = floor(review minutes available before all open deadlines / 60)`

Use 60 minutes per new case until five completed paid cases establish an observed planning value. Reserve at least 20 additional minutes per open case for support, correction, and logging. The active-case cap in the cohort table still applies even if the formula returns more.

Stop accepting cases when any deadline is at risk, the owner cannot monitor safety/support, a reviewer is unavailable, or two cases in the last five required more than 90 minutes each. Publish or send a waitlist message rather than accepting an unserviceable obligation.

## Privacy, Consent, and Retention Requirements

Paid beta is `NO-GO` until an appropriate owner or adviser approves customer-facing privacy, consent, terms, and retention language for the places served. This plan identifies operational needs; it is not legal advice.

The customer must see, before submission/payment:

- What Drivable provides and does not provide.
- What contact, vehicle, VIN, location, media, records, communications, payment reference, report, review, and outcome data may be collected.
- Why each category is needed for fulfillment, safety, support, evaluation, or an optional learning use.
- Who can access it and what service providers process it.
- Whether follow-up and optional learning use are separate from service delivery.
- How to request access, correction, deletion, or withdrawal/opt-out where applicable.
- The defined retention periods and exceptions for disputes, safety, accounting, or legal obligations.
- A warning to remove unrelated faces, plates, addresses, documents, account numbers, and other personal information from uploads.

Required controls:

- Separate required service consent from optional permission to use a de-identified case for product learning. Refusal of optional learning cannot block the paid service.
- Record notice/consent version, timestamp, channel, and optional-learning choice.
- Collect only necessary information; never request full payment-card data.
- Restrict case access to named operators/reviewers and prevent cross-customer links or attachments.
- Keep customer-reported, reviewer-confirmed, and document-supported facts distinct.
- Define and approve a written retention schedule before paid intake. Do not use “keep forever.” The schedule must cover raw intake/media, reports/review history, support, outcome data, consent records, and payment/accounting records.
- Test correction, deletion, and opt-out handling using an owner-operated case before inviting a paid customer.
- Do not claim that Drivable learns from every case. Use optional outcome data only under the approved consent and evaluation process.

## Recruiting Scripts

### Trusted unpaid tester

> I am running a small, owner-reviewed beta of Drivable for people with a real, stable, non-emergency vehicle concern. It organizes the information you provide into possible cause paths, confidence, missing evidence, next checks, and a mechanic script. It is not a confirmed diagnosis, inspection, or safety clearance. I will comp the report in exchange for direct feedback and a short follow-up about what you did and what a shop later found, if known. Please do not take any risk to collect evidence. Would you like me to screen your case for fit?

### First paid cohort

> I am opening five owner-reviewed paid beta spots for Drivable's First Look Report. It is for one stable, non-emergency vehicle concern and includes confidence-rated possible cause paths, evidence gaps, conservative next checks, and a mechanic script. The beta price is $24 and the target is delivery within two business days after a complete eligible intake and verified payment. It is informational only—not a confirmed diagnosis, inspection, repair guarantee, emergency service, or statement that the vehicle is safe to drive. Every report is reviewed by a person, and I will ask for a short follow-up. If that fits, I can screen the concern before payment.

Do not recruit through emergency-help posts, imply endorsements or mechanic partnerships, or collect case details publicly in comments. Obtain group moderator permission where required.

## Structured Feedback Interview

Ask after the customer has read the report. Record the answer as close to verbatim as practical without pressuring for praise.

1. What decision were you trying to make before using Drivable?
2. Before the report, what did you think Drivable would and would not do?
3. Where did intake feel confusing, unnecessary, unsafe, or too personal?
4. In your own words, what did the confidence rating mean?
5. Which part gave you the clearest next step? Which part did not help?
6. Did anything sound like a confirmed diagnosis, guarantee, or permission to drive?
7. What action did you take, if any, and did the report influence it?
8. What did a mechanic or inspection later confirm or contradict? What evidence supports that?
9. Was the two-business-day promise clear and met?
10. Was the report worth less than, about, or more than $24? Why?
11. What would have caused you to request a correction or refund?
12. Would you recommend this exact offer to someone with a similar concern? Why or why not?

The interviewer must not explain away confusion before recording it. Separate observed behavior, customer opinion, and verified outcome.

## Outcome Tracking

For every accepted case record:

- Case ID, cohort, acquisition source, eligibility result, scenario, and dates.
- Offer version, price offered, payment status/source reference, discount/comp reason, refund, and fees when known.
- Consent version and optional-learning choice.
- Intake completeness, missing-information request, risk level, evidence types, and safe-evidence exception.
- Draft mode/version, confidence, safety/urgency, review status, reviewer, edits, escalation, and final version.
- Intake-to-complete, review, total fulfillment, delivery, support, and correction times.
- Delivery recipient check and evidence.
- Customer understanding, next-action clarity, value response, referral intent, complaint, correction, and refund.
- Action taken and outcome: customer-reported, reviewer-confirmed, or document-supported.
- Actual finding, repair/result, cost if volunteered, advice helped (`yes`, `no`, `unknown`), and follow-up completeness.
- Issue/incident IDs, containment, and whether the case is excluded from metric claims.

Do not overwrite the original intake, draft, recommendation, or report when later facts arrive.

## Success Metrics

Use counts with denominators; small beta percentages are directional, not market claims.

### Safety and control — must all pass

- 0 wrong-recipient sends, mixed records, review bypasses, mock sends, or false payment confirmations.
- 0 customer-facing claims of confirmed diagnosis, safety clearance, guaranteed repair, or unnecessary inspection.
- 100% of delivered reports have recorded human approval and final-version traceability.
- 100% of critical/high-risk signals are blocked or escalated according to policy.
- 100% of paid cases have recorded consent and verified payment before fulfillment.

### Service quality

- At least 4 of 5 paid reports delivered within the promised window.
- At least 4 of 5 paid customers can state the next action without an owner call.
- At least 4 of 5 paid customers interpret confidence as uncertainty, not certainty.
- At least 4 of 5 paid cases receive the first follow-up; at least 3 yield a meaningful action or outcome update.
- Median owner fulfillment time is 60 minutes or less and no unresolved deadline/capacity breach remains.

### Commercial signal

- Record conversion for every eligible person offered the same $24 scope; do not set a market-wide conversion claim from this sample.
- At least 3 of 5 completed paid customers rate value “about” or “more than” $24.
- No more than 1 of 5 paid cases is refunded, and no refund indicates harm, misleading scope, privacy failure, or systematic quality failure.
- At least 3 of 5 paid customers say they would recommend the exact offer to a similar person.

## Support, Correction, Cancellation, and Refund Policy

- **Support:** monitored during stated business hours. Acknowledge ordinary messages within one business day. Safety messages receive immediate conservative triage when seen, but Drivable is not emergency monitoring or dispatch.
- **Clarification:** explain the delivered report's wording without inventing new conclusions or expanding scope.
- **Correction:** one request within seven calendar days for a factual input or clear report error. Preserve the original, verify the change, repeat human review, issue a versioned correction, and state what changed. New symptoms or a new concern require a new case.
- **Customer cancellation:** full refund if requested before substantive review begins. After review begins, the owner may decline a refund unless the service was not delivered as promised; disclose this rule before payment and conform it to applicable law/provider rules.
- **Drivable decline:** full refund when Drivable accepts payment and later determines the case is ineligible or lacks reviewer capacity.
- **Service failure:** full refund for non-delivery, wrong scope, missed promised turnaround without customer-approved extension, material privacy/delivery failure, or a report that cannot responsibly be completed.
- **Dissatisfaction:** owner reviews the report, intake, expectation-setting, and interview. Offer correction when correctable; refund when the scope was misleading or the deliverable materially failed. Never condition a refund on silence, a positive review, or waiver of rights.
- **Duplicate payment:** refund the duplicate after verification.

Log every cancellation, correction, dispute, and refund with reason, owner, timestamps, provider reference, and policy version. Never promise provider settlement timing.

## Go / No-Go Gates and Exact Expansion Evidence

### Gate A — owner-operated test to trusted unpaid testers

Required evidence, all passing:

- One complete owner-owned eligible case and one intentionally high-risk test case.
- For the eligible case: screenshots/references proving correct route, one record, raw intake, separate draft, human review, `approved_to_send`, correct final version/recipient, delivery, support path, and linked outcome follow-up.
- For the high-risk case: proof that normal content and customer send were blocked and escalation language appeared.
- One owner-owned correction request and one deletion/opt-out test completed and logged.
- Current scope, safety language, consent notice, retention schedule, support/refund policy, reviewer, rollback owner, and prior routing/webhook value recorded.
- All applicable MVP stop lines unchecked and every required route for this offer has documented PASS evidence.

### Gate B — trusted unpaid testers to first five paid customers

Required evidence, all passing:

- At least 3 completed eligible trusted-tester cases, invited one at a time.
- Case-level proof for each: consent, route/record trace, human approval, correct recipient, delivery time, interview, and follow-up attempt.
- 0 critical safety, recipient, privacy, mixed-record, payment, or review-bypass failures.
- At least 3 of 3 testers can identify the next action; any diagnostic-certainty or safety-clearance misunderstanding is corrected and retested.
- Observed fulfillment and support time supports two business days at the first-paid cap.
- Named qualified reviewer and backup/decline rule; approved payment source of truth; customer-facing terms/privacy/consent/retention and correction/refund text reviewed for the paid scope.
- A successful owner-operated payment, refund, duplicate prevention, correction, deletion/opt-out, and incident rollback exercise with references.
- Written `PAID TEST / GO` decision using the pre-launch decision record.

### Gate C — first five paid customers to next ten paid customers

Required evidence, all passing:

- Five eligible, verified-paid, completed cases offered the same $24 scope, with no friends-and-family coercion and every declined/abandoned eligible offer counted.
- A case index linking all five to consent, payment proof, intake, draft, review approval, final report, recipient proof, delivery time, support/correction/refund record, interview, and outcome follow-up.
- Every safety/control metric passes; service and commercial thresholds above pass or have a written containment and retest that does not weaken safety.
- A price decision memo showing conversion denominator, customer value responses, fulfillment/support cost and time, refunds, and the resulting price hypothesis. Label conclusions as beta evidence, not market fact.
- Capacity evidence showing the next-ten cap fits observed review time with support reserve and a named owner schedule.
- Issue log shows no open critical/high issue and no repeated unresolved issue affecting more than 10% of recent cases.
- Privacy requests, retention, access, payment, support, correction, refund, and outcome-linking processes were exercised successfully or were not triggered and have current owner-run test evidence.
- Written `GO` decision specifying exact cohort size, offer, price, channels, daily cap, reviewer, dates, and rollback conditions.

### Gate D — any broader/public launch

This plan does not authorize it. Require a separate launch review with evidence across the larger tester milestones, legal/privacy/payment/tax review, reliable review staffing, public support expectations, outcome quality, and all repository public-launch gates.

Any missing evidence is a `NO-GO`; memory, verbal assurance, an unlinked screenshot, or a partial run does not count.

## Incident Pause and Rollback

Immediately pause intake and disable customer-facing sends for wrong recipient, mixed records, exposed data, route misfire, duplicate processing/charge, lost raw intake, false success/payment state, high-risk review bypass, mock send, production crash, reported harm/near harm, or uncertain routing target.

1. Put personal safety first; advise qualified emergency, roadside, in-person, or other appropriate help without giving remote clearance.
2. Stop new recruiting/payment and disable customer sends. Do not delete evidence.
3. Record incident time, reporter, cases, systems, data, recipients, payment state, and owner. Preserve run IDs, raw records, versions, messages, and screenshots with access restricted.
4. Prevent further exposure or processing; restore the recorded prior safe route/webhook when applicable and verify it with an owner-owned test.
5. Identify affected people and use the approved privacy, payment, and legal escalation process. Do not improvise admissions, concealment, or unsupported assurances.
6. Refund affected paid cases when policy requires; preserve provider evidence.
7. Determine cause, impact, containment, correction, and prevention. Mark affected route/case `FAIL`.
8. Re-run the exact failure path plus an eligible happy path and high-risk block. Resume only with linked PASS evidence and a written owner approval.

After reported harm, privacy exposure, wrong recipient, or safety-bypass, return at least one cohort stage and obtain appropriate qualified review before resuming.

## 30-Day Execution Calendar

| Day | Action and required output |
|---:|---|
| 1 | Freeze the narrow offer, $24 hypothesis, eligibility, exclusions, owner, and active-case cap. |
| 2 | Name reviewer; document qualifications, availability, backup/decline rule, and review checklist. |
| 3 | Draft paid-scope terms, privacy/consent choices, optional-learning choice, and retention schedule for appropriate review. |
| 4 | Finalize support, correction, cancellation, refund, and rejection messages. |
| 5 | Prepare case index, outcome fields, metric sheet, incident record, and evidence naming convention. |
| 6 | Run owner-owned eligible intake through route, draft, review, approval, delivery, and recipient checks. |
| 7 | Run owner-owned high-risk block and rollback drill; log evidence and issues. |
| 8 | Run owner-owned payment/refund/duplicate-prevention exercise using the approved source of truth. |
| 9 | Run owner-owned correction, deletion, and optional-learning opt-out exercises. |
| 10 | Resolve failures; complete Gate A evidence audit and decision record. |
| 11 | Invite trusted tester 1 using the script; screen before intake. |
| 12 | Fulfill tester 1; record all time, edits, delivery, and issues. |
| 13 | Interview tester 1; capture follow-up and fix any safety/scope misunderstanding. |
| 14 | Invite and screen trusted tester 2 only if tester 1 produced no stop trigger. |
| 15 | Fulfill and interview tester 2; update issue and time records. |
| 16 | Invite and screen trusted tester 3 only if capacity and controls remain passing. |
| 17 | Fulfill and interview tester 3; initiate outcome follow-ups for all three. |
| 18 | Fix/retest issues; add testers 4-5 only if needed to establish three eligible completed cases. |
| 19 | Audit Gate B: consent, privacy, payment, capacity, safety, reviewer, support, outcomes, and exact evidence. |
| 20 | Record paid `GO` or `NO-GO`. If `NO-GO`, fix and repeat the failed evidence; do not recruit paid users. |
| 21 | If `GO`, announce only five paid spots through direct, controlled outreach; count every eligible offer. |
| 22 | Screen and accept paid customer 1; verify consent/payment; fulfill within capacity. |
| 23 | Fulfill/interview customer 1; accept customer 2 only if no pause trigger exists. |
| 24 | Fulfill/interview customer 2; review price/value and time without changing scope or price. |
| 25 | Accept/fulfill customer 3; run first follow-ups and reconcile payment/support records. |
| 26 | Accept/fulfill customer 4; inspect every report for certainty, safety, and next-action comprehension. |
| 27 | Accept/fulfill customer 5 if capacity allows; otherwise extend the calendar rather than compress review. |
| 28 | Complete interviews, refund/correction actions, and first follow-ups; request no positive review. |
| 29 | Calculate metrics and prepare the price, capacity, issue, privacy, outcome, and cohort evidence index. |
| 30 | Hold Gate C review; record `NO-GO`, `REPEAT FIVE`, or `GO FOR NEXT TEN` with exact limits and evidence links. |

The calendar is sequence-driven. A pause, incomplete intake, slow recruitment, incident, or missed evidence moves later work; it never justifies stacking cases or skipping a gate.

## Daily Owner Checklist

### Open

- [ ] Confirm the current approved cohort, offer version, price, active-case cap, reviewer, and business-hour message.
- [ ] Check for safety, support, privacy, payment dispute, correction, refund, or incident messages before recruiting.
- [ ] Confirm routing, monitored inbox, customer-send control, payment source of truth, and prior rollback value are known.
- [ ] List open cases by deadline and calculate available case slots with the support reserve.
- [ ] Pause recruiting if any critical/high issue, overdue case, unavailable reviewer, or uncertain recipient/routing condition exists.

### For every case

- [ ] Screen eligibility and risk before payment; reject or escalate out-of-scope cases.
- [ ] Verify case ID, identity separation, notice/consent version, optional-learning choice, offer, due time, and payment status.
- [ ] Request only safe, necessary missing evidence; never encourage symptom recreation.
- [ ] Keep submitted facts, draft, review edits, final report, and later outcomes separate and versioned.
- [ ] Complete the human-review checklist and require `approved_to_send`.
- [ ] Recheck recipient and final version immediately before delivery.
- [ ] Log delivery, review/fulfillment time, support, correction/refund, interview, and next follow-up date.

### Close

- [ ] Reconcile accepted, declined, abandoned, paid, comped, refunded, delivered, and overdue cases.
- [ ] Review metric denominators and issue patterns; do not turn a small sample into a market claim.
- [ ] Follow up on open outcomes without pressuring disclosure or optional-learning consent.
- [ ] Restrict evidence access and process any correction, deletion, or opt-out request.
- [ ] Confirm backups/rollback records and preserve incident evidence; do not delete original case versions.
- [ ] Record tomorrow's capacity, deadlines, owner/reviewer coverage, recruitment permission, and explicit `GO` or `PAUSE`.

## Daily Decision Record

- Date:
- Current cohort and offer version:
- Active/open/completed cases:
- Available case slots:
- Reviewer coverage:
- Safety/privacy/payment/support alerts:
- Deadlines at risk:
- New issues and incident IDs:
- Metric changes:
- Recruitment decision: `GO` / `PAUSE`
- Owner and timestamp:

## Source Alignment

This program operationalizes the existing First Paid Offers, Vehicle Decision Engine, Mock AI Safety Rules, Learning Data Loop, MVP Readiness Checklist, Pre-Launch Go/No-Go, End-to-End Test Runbook, Customer Support Triage, First Tester Outreach, One-Page Positioning, Website Copy Blocks, and Local Launch Plan. If those controls become stricter, the stricter rule applies until this document is revised.
