# Drivable MVP Readiness Checklist V1

## Purpose

Use this checklist before Glenn considers the first real external tester or customer flow. Every required item should be verified with a page, Make run, stored record, test email, or documented plan. An unchecked stop-line item means **do not launch**.

## 1. Customer UX Readiness

- [ ] `/start` exists and gives the user a clear starting choice.
- [ ] The tested flow has no dead-end pages.
- [ ] An evidence checklist exists.
- [ ] A missing-information request path exists or has an approved implementation plan.
- [ ] A customer report preview exists.
- [ ] A roadside guidance preview exists.
- [ ] Safety and limitation language is visible where risk decisions appear.
- [ ] Every tested page has a clear next action.

## 2. Make / Router Readiness

- [ ] All five `intakeType` routes have a documented final `PASS`:
  - `support-concierge-request`
  - `marketplace-seller`
  - `diagnosis`
  - `buyer-interest`
  - `internal-diagnosis-response`
- [ ] Original raw JSON is stored in an approved location for every route.
- [ ] The route-specific AI summary or draft is stored in the intended field.
- [ ] Expected sheet rows and required mapped fields are verified.
- [ ] Admin notification or test email reaches the approved Glenn-owned inbox.
- [ ] Customer emails are disabled, draft-only, or restricted to a Glenn-owned test inbox.
- [ ] Old scenarios remain available as a tested backup.
- [ ] The cutover owner, production target, rollback value, and cutover plan are ready.

## 3. Safety / Send Readiness

- [ ] The send safety gate exists.
- [ ] Only `approved_to_send` authorizes customer delivery.
- [ ] High-risk diagnosis, roadside, title, structural, and high-cost cases require human review.
- [ ] Roadside guidance includes clear stop-now warnings.
- [ ] No high-risk guidance can be sent automatically.

## 4. Report Readiness

- [ ] A customer report preview exists.
- [ ] An internal review path exists.
- [ ] A missing-information path exists.
- [ ] Initial report packages and their boundaries are defined.
- [ ] Customer-facing language uses possible causes, confidence, missing evidence, and next checks.
- [ ] Customer-facing language avoids certainty, safety clearance, repair guarantees, and promises of outcome.

## 5. Outcome / Data Moat Readiness

- [ ] An outcome-capture plan exists.
- [ ] The learning loop from intake through real-world outcome is defined.
- [ ] Customer follow-up fields and controlled outcome statuses are identified.
- [ ] Actual inspection, repair, result, cost, customer action, and usefulness capture are planned.
- [ ] Outcomes can be linked to the original case, evidence, recommendation, confidence, and reviewer.

## 6. Stop Line

Stop work before launch if any condition below is true:

- [ ] The Make router is untested or any required route lacks a final `PASS`.
- [ ] Customer email routing or recipients are uncertain.
- [ ] No human review and approval gate exists.
- [ ] Report language is too vague, certain, reassuring, or risky.
- [ ] Raw JSON cannot be captured and traced to the resulting record.
- [ ] There is no credible way to learn what happened after guidance.
- [ ] The production webhook target, owner, or rollback value is uncertain.

**Launch rule:** every stop-line box must remain unchecked. If one becomes true during testing, pause the flow, disable customer-facing sends, preserve the evidence, and correct the issue before continuing.

## 7. First Tester Criteria

1. Run the complete flow first with a Glenn-owned identity and test email.
2. Verify the route, stored raw JSON, AI summary, sheet record, review status, report, and email recipient.
3. Run the same controlled flow with one trusted human tester who understands that this is an early informational product.
4. Review the tester's experience, safety language, report usefulness, and outcome follow-up before expanding.
5. Do not accept paid public traffic until the route, email, review, report, and follow-up flow has passed end to end.

## MVP Decision

- Decision: `NOT READY` / `READY FOR GLENN-OWNED TEST` / `READY FOR ONE TRUSTED TESTER`
- Approved by:
- Approval date:
- Evidence or run references:
- Remaining risks:
