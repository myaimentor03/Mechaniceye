# Drivable Outcome Data Model V1

## Why Outcomes Are the Real Moat

Seed knowledge helps Drivable start consistently, but it cannot show whether guidance was correct, useful, safe, or well calibrated. The durable advantage is permissioned, linked evidence showing the original symptoms, available evidence, recommendation, confidence, customer action, and what was later confirmed.

High-quality outcomes can reveal which questions narrow a case, which evidence changes a recommendation, where confidence was too high or low, and when human or in-person review should happen earlier. Volume without provenance and verification is not a moat.

## Seed Knowledge vs. Verified Outcomes

| Seed knowledge | Verified outcome data |
|---|---|
| General taxonomy and prompts | A real event linked to a specific case and report |
| Written before customer use | Captured after guidance and action |
| Not proof of a cause or result | May confirm or disprove a recommendation |
| Versioned by dataset release | Versioned by event, source, and verification level |
| Contains no customer identity | Requires consent, privacy, access, and retention controls |
| Helps structure questions | Helps evaluate calibration, usefulness, and safety |

Customer recollection is useful but is not automatically a verified outcome. Record whether evidence is customer-reported, reviewer-confirmed, shop-documented, or otherwise supported.

## Proposed Customer Outcome Fields

| Field | Purpose |
|---|---|
| `caseId` | Required stable relationship to the original intake |
| `recommendationGiven` | Exact delivered recommendation or immutable report reference |
| `customerActionTaken` | What the customer reports doing after guidance |
| `vehicleDrivenAfterAdvice` | `yes`, `no`, or `unknown`; never used to imply driving was recommended |
| `towUsed` | `yes`, `no`, or `unknown` |
| `shopInspected` | `yes`, `no`, or `unknown`, with inspection source when known |
| `actualCauseFound` | Confirmed, reported, suspected, or unknown cause with verification level |
| `actualRepairPerformed` | Repair, temporary action, inspection only, no repair, sold, walked away, or unknown |
| `actualCost` | Amount, currency, paid/quoted status, and source |
| `didAdviceHelp` | `yes`, `no`, `partly`, or `unknown` |
| `customerNotes` | Customer-provided context preserved as reported |
| `reviewerNotes` | Internal quality and safety observations |
| `confidenceCorrection` | Whether original confidence was appropriate, too high, too low, or unknown |
| `followUpDate` | ISO 8601 date/time for collection or next follow-up |

Recommended companion metadata includes `outcomeId`, `reportId`, `sourceType`, `verificationLevel`, `capturedAt`, `reviewedAt`, `outcomeStatus`, consent reference, and supporting evidence references.

## Example Outcomes

### Brake Rotor Example

- Original guidance: Brake rotor or wheel/tire path suspected with moderate confidence.
- Customer action: Limited driving and scheduled a shop inspection.
- Outcome: Shop confirms warped front rotors and measures related brake wear.
- Learning: Rotor-path questions and braking-speed evidence were useful; confidence may remain moderate until measurement.

### Battery/Charging Example

- Original guidance: Battery or charging-system issue suspected.
- Customer action: Requested an electrical inspection.
- Outcome: Actual cause was a loose battery terminal; no alternator replacement required.
- Learning: Add or prioritize a safe parked visual/connection question before broad charging recommendations.

### Buyer Title Example

- Original guidance: Title inconsistency flagged as high buyer risk.
- Customer action: Buyer requested proof, did not receive it, and walked away.
- Outcome: No title defect was independently confirmed, but the risk flag changed the decision.
- Learning: Measure decision usefulness separately from mechanical or legal confirmation.

### Overheating Example

- Original guidance: Cooling-system failure possible; stop if temperature rises and seek inspection.
- Customer action: Used a tow.
- Outcome: Shop confirms a failed radiator fan.
- Learning: Fan-operation evidence and overheating-at-idle questions may improve follow-up selection without claiming remote certainty.

## Preventing Unsafe Certainty

- Preserve the exact recommendation and confidence delivered at the time.
- Never rewrite the original draft after the outcome is known.
- Separate suspected cause from confirmed cause.
- Attach a verification level and source to every outcome claim.
- Do not label advice successful solely because one possible cause matched.
- Review cases involving continued driving, wrong tow advice, missed high-risk signals, unnecessary expense, or customer harm.
- Use calibrated language and permit `unknown`, partial, contradictory, and no-response outcomes.
- Evaluate changes on held-out cases before they affect production guidance.
- Require human and legal review before outcome-derived rules affect high-risk guidance.

## Improving Follow-Up Questions

Outcome analysis can identify questions that:

- Consistently separate confirmed causes.
- Reveal stop-now or tow conditions earlier.
- Reduce unnecessary evidence requests.
- Expose contradictions between symptoms, seller claims, and later findings.
- Improve confidence calibration.
- Predict when remote guidance is insufficient.

A question should change only through a versioned proposal that records the supporting cases, bias and safety review, expected benefit, test results, and approval. Outcomes should improve what Drivable asks, not turn correlations into diagnosis.
