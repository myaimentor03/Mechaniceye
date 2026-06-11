# Drivable Learning Data Loop V1

## Purpose

Define the information Drivable must capture before it can responsibly improve confidence-rated vehicle recommendations over time.

The learning loop is a product and data contract, not a claim that the current system learns automatically. Outcome capture, consent, privacy controls, quality review, and a defined evaluation process are required before any learning claim is made.

## Complete Case Record

Every intake should eventually connect the following stages:

1. Customer symptoms, goals, vehicle context, timing, warning lights, and relevant history.
2. Submitted photos, videos, audio, scan data, records, and other media or evidence.
3. The original AI draft, including possible causes, confidence, missing information, safety flags, and recommendation.
4. Human review decisions, edits, escalation reasons, approval status, and reviewer context.
5. The customer-ready recommendation and the decision paths presented.
6. Customer follow-up, including what action the customer chose and whether the situation changed.
7. The actual inspection, repair, sale, purchase, no-repair decision, or other outcome when known.
8. Confirmed repair details, parts, labor, total cost, and supporting records when the customer chooses to provide them.
9. Whether the advice helped, what was unclear, and whether the recommendation matched the eventual outcome.

These records should use stable case and report identifiers so intake evidence, drafts, reviews, recommendations, and outcomes can be evaluated together without confusing one vehicle event with another.

## Long-Term Data Moat

The durable advantage is not the volume of unverified symptom text. It is a high-quality set of linked cases showing:

- What the customer reported.
- What evidence was available at each decision point.
- What the AI and human reviewer recommended.
- What was later confirmed or disproved.
- What action the customer took.
- What the real cost and outcome were.
- Whether the guidance was useful and safe.

Over time, responsibly collected outcome data can reveal which evidence improves confidence, which questions change decisions, where recommendations are too broad, and which cases require earlier human or in-person escalation.

## Responsible Data Use

Customer data must never be used carelessly. Collection and future learning workflows should:

- Obtain appropriate consent and explain intended uses in plain language.
- Collect only information needed for the service, safety, support, evaluation, or an explicitly approved learning purpose.
- Separate identity and contact details from analysis data wherever practical.
- Restrict access by role and retain data only for a defined period.
- Protect media, VINs, locations, repair records, communications, and other sensitive information.
- Provide correction, deletion, and opt-out paths where required.
- Avoid treating seller claims, customer recollections, AI drafts, or unverified costs as confirmed facts.
- Document data sources, review history, and outcome confidence.

No dataset size justifies bypassing privacy, consent, security, legal, or safety review.

## Learning Standard

Future learning should improve confidence-rated recommendations, evidence requests, escalation rules, and decision support. It must not turn incomplete observations into unsafe certainty.

Useful improvements may include:

- Better questions for narrowing a symptom.
- Better identification of missing or contradictory evidence.
- Better calibration of low, moderate, and high confidence.
- Earlier detection of safety-critical or high-cost cases.
- Better matching between a case and professional repair, DIY, monitor, sell, or walk-away paths.
- Better estimates expressed as ranges with clear source and uncertainty limits.

The system should continue to use language such as "possible cause," "based on the information provided," and "in-person inspection recommended" when the evidence does not support confirmation.

## Outcome Capture Requirement

Drivable must not claim that the system "learns" merely because it stores intakes, generates drafts, or receives customer messages.

An evidence-backed learning loop requires:

1. A defined outcome schema.
2. A reliable way to connect outcomes to the original evidence and recommendation.
3. A distinction between customer-reported, reviewer-confirmed, and document-supported outcomes.
4. Quality checks for incomplete, contradictory, duplicate, or biased records.
5. Measurable evaluation showing whether a change improves calibration, usefulness, and safety.
6. Human and legal review before learning-derived changes affect high-risk guidance.

Until those controls and actual outcomes exist, the system is collecting potential learning data, not proving that it learns.
