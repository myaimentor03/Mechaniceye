# Drivable Pre-Launch Go / No-Go V1

## Decision Levels

Evaluate each level separately. Passing a first-tester gate does not approve paid testing or public launch.

## Core Go Criteria

- [ ] Current production build passes.
- [ ] Tested user flow has no dead ends and clear next actions.
- [ ] All five Make routes have documented final `PASS` evidence.
- [ ] Raw JSON, AI result, sheet row, status, and email behavior are traceable.
- [ ] Human review and the `approved_to_send` gate are enforced.
- [ ] Safety and limitation language is present.
- [ ] Issue and outcome capture processes are ready.
- [ ] Rollback owner and previous webhook value are known.

## Core No-Go Criteria

- Any required route is untested or failing.
- Email recipients, webhook target, or production owner are uncertain.
- Customer-facing output can bypass review.
- Raw JSON or route outcomes cannot be traced.
- A critical/high blocker is open without an approved containment plan.
- The build, changed route, duplicate behavior, or error path is unverified.

## First Tester Go

- [ ] A complete Glenn-owned test passed first.
- [ ] One trusted tester and test purpose are identified.
- [ ] Tester email behavior is explicitly approved.
- [ ] Human review is available during the session.
- [ ] Session, issue, and follow-up logs are ready.
- [ ] No paid traffic or broad invitation is enabled.

## Paid Test Go

- [ ] Multiple controlled flows have passed without recipient or routing errors.
- [ ] Report scope, price, turnaround, refund handling, and support owner are defined.
- [ ] Payment verification has an approved source of truth.
- [ ] Customer terms, privacy, consent, and fulfillment language are reviewed.
- [ ] Outcome follow-up can be linked to the paid case.

No placeholder price or customer-entered payment claim is proof of paid-test readiness.

## Public Launch No-Go

Public launch remains `NO-GO` when any of the following is true:

- Only Glenn-owned or one-person testing has been completed.
- Route reliability, support capacity, privacy, retention, or outcome handling is unresolved.
- Payment, tax, refund, entitlement, or customer support operations are undefined.
- High-risk guidance or customer email can be sent without a controlled review trail.

## Safety No-Go

- Stop-now warnings are absent or unclear.
- High-risk diagnosis, roadside, title, structural, or high-cost guidance can auto-send.
- Output implies certainty, safety clearance, guaranteed repair, or no need for inspection.
- No qualified human can review a flagged case.

## Email No-Go

- `To`, `Cc`, `Bcc`, sender, or reply-to is uncertain.
- Testing can map incoming customer data directly to a live recipient.
- Internal notes or unreviewed AI text can enter customer copy.
- A failed sheet write or review can still send a success email.

## Make / Router No-Go

- Any of the five routes lacks final `PASS` evidence.
- Wrong or multiple branches fire.
- `buyer-interest` versus `marketplace-buyer-interest` is unresolved.
- Duplicate and error-path behavior is untested.
- Old scenarios are unavailable before controlled cutover completion.

## Data Capture No-Go

- Raw JSON is not retained.
- AI summary/draft and final recommendation cannot be distinguished.
- Case, report, reviewer, and outcome cannot be linked.
- Actual action, repair/result, cost, and whether advice helped have no capture plan.
- Sensitive data access, consent, correction, deletion, or retention remains undefined for the proposed launch level.

## Decision Record

- Decision level: `NO-GO` / `GLENN-OWNED TEST` / `FIRST TRUSTED TESTER` / `PAID TEST` / `PUBLIC LAUNCH`
- Result: `GO` / `NO-GO`
- Approved by:
- Date/time:
- Evidence:
- Open blockers:
- Conditions or limits:
- Next review date:
