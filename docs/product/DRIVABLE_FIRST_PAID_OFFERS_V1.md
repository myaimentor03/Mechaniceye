# Drivable First Paid Offers V1

## Purpose

Define a simple first set of paid Drivable report offers without adding checkout, payment-provider, database, entitlement, or fulfillment integration.

These offers turn submitted vehicle information into clearer, confidence-rated decision support. They do not replace an in-person inspection or guarantee a diagnosis, repair, sale, purchase, title result, or vehicle condition.

## Why Start With Simple Report Offers

Report offers fit the current Drivable foundation because they:

- Build on the existing diagnosis, concierge, buyer, and seller intake flows.
- Give the customer a clear deliverable.
- Keep diagnosis as the front door while focusing value on what to do next.
- Avoid percentage-of-sale fees and transaction brokerage.
- Can begin with controlled manual review and fulfillment.
- Allow pricing, demand, turnaround time, and support needs to be tested before deeper automation.
- Keep the initial product understandable for everyday vehicle owners, buyers, and sellers.

The early offer should be a report and decision-support service, not a promise that AI replaces a mechanic.

## Recommended Early Launch Buttons

Start with two primary customer choices:

1. `First Look Report`
2. `Full Decision Report`

These buttons give users a clear low-entry option and a deeper option without presenting five competing choices at checkout.

The other offers can appear as scenario-specific options, follow-up recommendations, or manually offered add-ons during the early launch.

## Offer Summary

| Offer | Planning price range | Primary use |
|---|---:|---|
| First Look Report | $19-$29 | Quick initial understanding and next checks |
| Full Decision Report | $49-$79 | Deeper evidence and decision-path guidance |
| Human Review Add-On | $49-$99 add-on | Additional human review for higher-risk decisions |
| Buyer Remote Risk Review | $29-$59 | Remote buyer risk and red-flag review |
| Seller As-Is Listing Pack | $39-$99 | Clearer condition and disclosure-oriented listing support |

**Warning:** These are planning placeholders, not final prices.

Pricing must be reviewed after testing fulfillment time, customer expectations, support burden, payment costs, refund behavior, and legal/compliance positioning.

## Offer 1: First Look Report

**Suggested placeholder price:** `$19-$29`

**Purpose:** Give the customer a concise first read on what the available information may indicate and what to check next.

**Suggested contents:**

- Submitted vehicle and concern summary
- Possible causes
- Supporting evidence
- Missing evidence
- Confidence rating
- Safety/urgency rating
- Immediate next questions or checks
- Initial decision-path direction
- Clear limitations

**Best fit:**

- A current vehicle problem
- An early buyer question
- A sitting vehicle
- A customer who wants a lower-cost starting point

**Boundary:** This is not a confirmed diagnosis, repair approval, safety certification, or substitute for an in-person inspection.

## Offer 2: Full Decision Report

**Suggested placeholder price:** `$49-$79`

**Purpose:** Provide a deeper report focused on the practical decision: repair professionally, DIY, sell as-is, monitor/wait, or walk away.

**Suggested contents:**

- Everything in the First Look Report
- Ranked possible or likely cause paths
- Supporting and conflicting evidence
- Missing evidence and confidence limits
- Safety and urgency explanation
- Professional repair path
- DIY suitability and caution level
- Sell/list as-is path
- Monitor/wait path
- Walk-away path for buying scenarios
- Mechanic script
- Suggested questions and proof to request
- Buyer or seller guidance when applicable

**Best fit:**

- A meaningful repair decision
- A vehicle with multiple symptoms or incomplete evidence
- A keep-versus-sell decision
- A higher-cost purchase decision

**Boundary:** A Full Decision Report remains informational and based on provided information. It does not guarantee the cause, repair result, vehicle condition, or financial outcome.

## Offer 3: Human Review Add-On

**Suggested placeholder price:** `$49-$99 add-on`

**Purpose:** Add qualified human review before a higher-risk repair, safety, buying, or selling decision.

**Suggested contents:**

- Review of submitted facts and media
- Review of AI-generated possible causes and confidence
- Identification of contradictions or missing evidence
- Refined next checks and mechanic questions
- Review of safety escalation language
- Approved customer-ready summary

**Best fit:**

- Safety-related symptoms
- High-cost repair decisions
- Conflicting evidence
- Low-confidence reports
- Higher-value purchases
- Customers who want another layer of review

**Boundary:** Human review does not certify a vehicle, guarantee a diagnosis, or replace hands-on inspection and testing.

## Offer 4: Buyer Remote Risk Review

**Suggested placeholder price:** `$29-$59`

**Purpose:** Help a buyer decide whether a vehicle appears worth pursuing before investing time or money in travel, inspection, negotiation, or purchase.

**Suggested contents:**

- Listing and seller-claim summary
- Vehicle information and evidence review
- Missing photos, records, title facts, or inspection access
- Buyer red flags
- Questions to ask the seller
- Evidence to request
- Suggested independent inspection areas
- Confidence-rated pursue, pause, inspect, or walk-away guidance

**Best fit:**

- Remote marketplace vehicles
- Private-party purchases
- Incomplete listings
- Vehicles with disclosed issues
- Buyers deciding whether to arrange an inspection

**Boundary:** This is not a pre-purchase inspection. It does not verify ownership, title, mileage, seller statements, vehicle condition, or transaction legitimacy.

## Offer 5: Seller As-Is Listing Pack

**Suggested placeholder price:** `$39-$99`

**Purpose:** Help a seller turn known facts, issues, repairs, and evidence into a clearer and more honest as-is listing package.

**Suggested contents:**

- Vehicle condition summary
- Known-issue organization
- Recent repair history
- Evidence and media checklist
- Missing information prompts
- Disclosure-oriented listing language
- Buyer questions to expect
- Suggested next evidence or inspection steps
- Listing-ready summary for seller review

**Best fit:**

- Vehicles with known issues
- As-is private-party sales
- Sellers who need help explaining symptoms clearly
- Marketplace seller intakes

**Boundary:** The pack does not certify, inspect, own, sell, title, transport, finance, or guarantee the vehicle. The seller remains responsible for truthful disclosures, title transfer, payment, taxes, registration, pickup or shipping, and state-specific requirements.

## Safety and Product Language

All offers must use language such as:

- Informational guidance
- Confidence-rated possible causes
- Based on the information provided
- Supporting evidence
- Missing evidence
- Next checks
- In-person inspection recommended

All offers must make clear:

- The report is not a substitute for an in-person inspection.
- Weak or missing evidence lowers confidence.
- Major safety, title, structural, or high-cost repair decisions may require qualified in-person help.
- Brake, steering, overheating, fuel-leak, smoke, severe electrical, wheel/tire separation, or unsafe-drivability concerns may require stopping vehicle use.
- No offer guarantees vehicle condition, diagnosis, repair outcome, sale, buyer interest, purchase outcome, title status, or legal result.

## PaymentStatus Values

Use these planning values for future paid-offer workflow design:

- `Unverified`
- `Pending`
- `Paid`
- `Refunded`
- `Comped`

Meaning:

| PaymentStatus | Meaning |
|---|---|
| `Unverified` | A payment claim or reference exists but has not been confirmed. |
| `Pending` | Payment has started or is awaiting confirmation. |
| `Paid` | Payment has been confirmed through an approved process. |
| `Refunded` | A confirmed payment was returned through the payment provider. |
| `Comped` | The offer was intentionally provided without payment and the reason was recorded. |

Do not treat a customer-entered value, webhook text, email, or spreadsheet edit as proof of payment without a future approved verification process.

## No Payment Integration Yet

V1 does not add:

- Checkout buttons
- Stripe or another payment provider
- Payment webhooks
- Database fields or migrations
- Automatic entitlement or report delivery
- Refund processing
- Subscription billing
- Percentage-of-sale fees
- Marketplace transaction handling

Any early manual sale should be separately documented and verified before fulfillment. Do not mark a report `Paid` based only on an intake submission.

## Early Fulfillment Workflow

A controlled manual early workflow may be:

1. Customer selects or requests a report.
2. Drivable receives the intake.
3. Admin checks whether enough information exists to fulfill the report.
4. Admin identifies missing evidence.
5. Payment remains `Unverified` or `Pending` until separately confirmed.
6. The report is generated and reviewed using the correct offer scope.
7. Safety, uncertainty, and in-person inspection language are checked.
8. The approved report is delivered manually.
9. Fulfillment notes, payment status, and follow-up are recorded.

## Decisions Required Before Payment Code

Before payment integration, decide:

- Final offer names and prices
- Included report sections
- Expected turnaround time
- Human review qualifications and availability
- Refund and cancellation policy
- What happens when evidence is insufficient
- Customer support process
- Payment provider
- Payment verification source of truth
- Tax and accounting handling
- Terms, privacy, and customer consent language
- Whether each offer is available in every scenario or state

## V1 Recommendation

Launch planning should center the two clearest buttons:

- `First Look Report`
- `Full Decision Report`

Use the Buyer Remote Risk Review and Seller As-Is Listing Pack when the customer's scenario calls for them. Offer Human Review only when staffing, scope, review standards, and turnaround expectations are defined.
