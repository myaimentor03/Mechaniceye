# Make Outcome Capture Plan V1

## Purpose

Plan a structured follow-up record of what actually happened after Drivable guidance. The outcome record should connect the original intake and recommendation to the customer's action, the confirmed repair or cause, cost, safety choices, and whether the guidance helped.

This is a planning document. Add a workbook tab, database destination, or Make route only through a separately reviewed schema and automation change.

## Proposed Outcome Fields

| Field | Purpose or format |
|---|---|
| `caseId` | Stable link to the original case; required when available |
| `intakeType` | Original intake type, normally `diagnosis` for roadside outcomes |
| `vehicle` | Structured year, make, model, trim, mileage, and safe vehicle identifier fields |
| `original symptoms` | Customer's original observations, preserved without rewriting |
| `Drivable recommendation` | Exact approved recommendation or versioned reference to it |
| `confidence` | Confidence level at the time guidance was delivered |
| `human reviewer` | Reviewer name or internal reviewer ID; blank only when no review occurred |
| `customer action taken` | What the customer reports doing after receiving guidance |
| `actual repair performed` | Repair completed, temporary action, inspection only, or no repair |
| `actual cause found` | Confirmed cause from a qualified inspection/repair record or customer report |
| `actual cost` | Currency amount and currency code when known; distinguish estimate from paid amount |
| `tow used yes/no` | Controlled value: `yes`, `no`, or `unknown` |
| `did customer drive yes/no` | Controlled value: `yes`, `no`, or `unknown` |
| `did advice help yes/no/unknown` | Controlled value: `yes`, `no`, or `unknown` |
| `follow-up notes` | Customer-safe context, unresolved questions, and source of outcome information |
| `outcome status` | Controlled workflow status |
| `learning notes` | Internal observations for prompt, workflow, taxonomy, or reviewer improvement |

## Recommended Outcome Status Values

- `FOLLOW_UP_DUE`
- `CUSTOMER_REPLIED`
- `AWAITING_REPAIR_RESULT`
- `OUTCOME_CONFIRMED`
- `PARTIAL_OUTCOME`
- `NO_RESPONSE`
- `CLOSED_UNKNOWN`

## Capture Workflow

1. Create the outcome request only after an original case and approved guidance exist.
2. Use `caseId` as the primary relationship key and preserve `intakeType`.
3. Pre-fill the vehicle, original symptoms, recommendation, confidence, and reviewer from the case record.
4. Ask the customer only for the action taken and result; do not imply that Drivable's recommendation was correct.
5. Separate customer-reported outcomes from repair-order, inspection, or qualified professional evidence.
6. Record whether the customer drove or used a tow without encouraging driving for evidence.
7. Allow `unknown` and partial outcomes. Do not force certainty.
8. Keep `learning notes` internal and out of customer emails.
9. Restrict access to contact details, repair documents, and sensitive notes.
10. Define retention, correction, deletion, and consent rules before production collection.

## Quality Rules

- Preserve the original recommendation and confidence as delivered; do not overwrite history.
- Record who supplied the outcome and when.
- Distinguish confirmed cause from suspected cause.
- Distinguish quoted cost from actual paid cost.
- Do not infer that advice helped solely because a repair matched a possible cause.
- Do not treat no response as a successful outcome.
- Review safety-critical mismatches, unnecessary driving, incorrect tow guidance, and high-cost misses promptly.
- Use structured controlled values where possible and raw notes only for supporting context.

## Why This Is the Data Moat

Most intake systems stop at symptoms and generated advice. Outcome capture closes the loop between the original evidence, Drivable's recommendation, confidence, human review, customer behavior, and the real-world result.

Over time, this linked data can show which symptom and evidence patterns predict actual causes, where confidence was calibrated well or poorly, which next steps reduced unnecessary cost or risk, and when human review changed the outcome. That feedback can improve prompts, routing, safety escalation, reviewer playbooks, and product decisions.

The moat is not raw volume by itself. It is trustworthy, permissioned, consistently structured, outcome-linked data with provenance. Its value depends on privacy controls, honest uncertainty, correction workflows, and clear separation between customer reports and verified repair evidence.

## Implementation Decisions Required Later

- Approved storage destination and exact headers/schema
- Follow-up timing and maximum number of reminders
- Customer consent and privacy language
- Evidence source and verification level
- Access control and retention period
- Controlled values for cause, action, repair, and outcome
- Reporting rules for safety and quality review
- Whether outcome collection is manual, customer-submitted, or both
