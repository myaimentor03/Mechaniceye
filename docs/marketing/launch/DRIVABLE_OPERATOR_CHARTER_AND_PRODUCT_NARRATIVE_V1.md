# Drivable Operator Charter and Product Narrative V1

**Status:** Canonical working charter  
**Confirmed brand:** Drivable by Mechanic's Eye  
**Control room:** This project task maintains the canonical product narrative, roadmap, launch sequencing, safety boundaries, and worker handoffs.

## 1. Operating Model

The operator turns the founder's vision into a coherent, staged, testable product and launch program.

The operator will:

- Maintain canonical product vocabulary, roadmap, launch plan, and asset manifest.
- Compare new requests against product readiness, safety, evidence, privacy, claims, and existing work.
- Push back when a request is premature, misleading, redundant, unsafe, or inconsistent.
- Convert approved direction into bounded worker assignments.
- Keep application truth ahead of marketing promises.
- Distinguish current, beta, planned, and long-term functionality.
- Require every worker handoff to state scope, files changed, checks, failures, assumptions, and unresolved decisions.

The founder will:

- Provide product intent, lived experience, priorities, and material business decisions.
- Complete human-owned actions such as accounts, contracts, payment, identity verification, releases, legal advice, and real-world partnerships.
- Avoid pasting passwords, full API keys, payment-card data, or identity documents into tasks.
- Review decisions that materially change the business model, customer promise, safety posture, or brand ownership.

Workers must not silently redefine names, promise unavailable functions, bypass review, convert claims into facts, or publish externally without authorization.

## 2. Confirmed Product Architecture

### Master Brand

**Drivable by Mechanic's Eye**

Drivable is the dominant consumer product name. Mechanic's Eye is the parent/endorsement identity.

### Primary Beta and Launch Products

1. **Drivable Check** — evidence-centered vehicle concern and possible-cause guidance.
2. **Buyer Check** — evidence-centered used-vehicle condition and risk review.

These products share the core evidence and reasoning system and address the clearest customer decisions.

### Expansion Products

3. **Mechanic Match** — qualified-provider matching and structured case handoff.
4. **Seller Check** — seller claim, evidence, known-issue, and listing-readiness workflow.
5. **ClearSale** — transparency-centered used-vehicle marketplace.
6. **Guided Service** — risk-bounded maintenance/repair guidance with optional human assistance.

Expansion products remain “coming soon” until their flows, operations, policies, and safety controls pass release gates.

## 3. Corrected Product Promises

### Drivable Check

Founder intent: help a customer understand what may be wrong, reduce wasted diagnostic conversation, recognize questionable repair communication, obtain appropriate guidance, and reach a suitable mechanic.

Defensible contract:

> Drivable Check organizes vehicle symptoms and evidence, identifies safety signals, ranks up to three possible causes when supported, explains confidence and missing information, and prepares a clearer handoff for hands-on diagnosis.

It must not promise to “tell you exactly what is wrong.” The same symptom can have several causes, and confirmation may require physical inspection, measurement, disassembly, manufacturer procedures, or specialist tools.

### Buyer Check

Founder intent: use the same intelligence to show what appears right with a vehicle before purchase.

Defensible contract:

> Buyer Check separates seller claims from observed evidence, identifies supported positives, risks, contradictions, and unknowns, and prepares questions and inspection priorities before the buyer commits time or money.

“No issue observed remotely” must never become “the vehicle is good.” A supported positive names its source, scope, and date.

### Mechanic Match

Founder intent: match the customer with a vetted mechanic whose specialty fits the problem.

Defensible contract:

> Mechanic Match uses the case category, vehicle, location, service needs, and declared provider capabilities to present an explainable shortlist and consented handoff.

The word “vetted” is permitted only after an operating program defines identity/business checks, applicable credentials, capability evidence, expiration/re-check rules, complaints, suspension, appeals, and what Drivable does not guarantee.

### Seller Check and ClearSale

Founder intent: create a marketplace where it is substantially harder to mislead a buyer.

Defensible contract:

> Seller Check and ClearSale make condition statements attributable, separate claims from observations, request evidence for material claims, surface contradictions and unknowns, preserve material listing history, and provide consistent buyer comparison fields.

Drivable cannot force honesty or promise that deception is eliminated. It can make misleading presentation harder and make missing support visible.

### Guided Service

Founder intent: offer instructions and guided help to customers who choose to work on their vehicles.

Defensible contract:

> Guided Service may offer low-risk observations, maintenance, and repair assistance only when the task, vehicle, tools, environment, and user acknowledgments fit an approved safety tier. Higher-risk work routes to qualified hands-on service.

## 4. Consumer Advocacy Without Accusation

Drivable should help customers communicate confidently without deciding that a mechanic is dishonest based on a phrase.

Build:

- Questions to ask before authorizing diagnosis or repair.
- Requests for written symptoms, test results, measurements, codes, photos, and estimate breakdowns.
- Explanations of diagnostic fees, estimates, recommendations, confirmed findings, parts grade, labor, warranty, taxes, and exclusions.
- Questions about what was tested, what failed, what is urgent, what can wait, and what could change the recommendation.
- Second-opinion triggers for high-cost, invasive, contradictory, or poorly supported recommendations.
- A respectful mechanic script and record of answers.

Do not build or market:

- A phrase detector that labels a mechanic dishonest.
- Fraud scores based on user interpretation alone.
- Price expectations that ignore region, vehicle, parts grade, diagnostic scope, and shop model.
- Advice to ignore a qualified inspection because a remote inference differs.

Safe message:

> You do not need to assume bad intent to ask for evidence, scope, alternatives, and a second opinion.

## 5. ClearSale Transparency Metrics

ClearSale should measure transparency behavior—not claim to measure a person's honesty.

The listing transparency profile may show:

- VIN provided and verification status.
- Seller authority/ownership claim and verification status.
- Title/lien claim and independent status where available.
- Odometer reading, capture date, photo, and discrepancy state.
- Standard photo coverage: exterior, interior, dashboard, engine bay, tires, and disclosed damage.
- Operating media where safely and appropriately captured.
- Warning-light and OBD status, including readiness/recent-clear information when available.
- Known issues answered, declined, or unknown.
- Records provided and the exact proposition each supports.
- Independent inspection offered, completed, declined, or unavailable.
- Material claim-evidence conflicts.
- Material listing-change history.

Use source labels such as:

- `seller_reported`
- `buyer_observed`
- `document_supported`
- `device_observed`
- `professional_observed`
- `independently_verified`
- `contradicted`
- `not_provided`
- `unknown`

Avoid a single “honesty score.” It could create false reassurance, invite gaming, and unfairly label a person. Show field-by-field completeness, source, date, and verification instead.

Transparency-supporting friction includes:

- Required response or explicit “unknown/not provided” for material fields.
- Separate seller narrative from structured claims and evidence.
- Prevent unsupported absolutes such as “no issues” when material fields are incomplete or contradictory.
- Preserve prior versions after material changes.
- Block publication when generated material statements lack provenance.
- Record declined evidence or inspection access without inferring motive.
- Provide correction, dispute, review, moderation, and removal workflows.

## 6. Staged Roadmap

### Phase A — Beta Foundation

- Drivable Check and Buyer Check.
- Shared vehicle evidence lifecycle.
- Confidence-ranked possible causes and supported positives.
- Missing evidence, contradictions, safety, and human-review behavior.
- Mechanic handoff script.
- Outcomes and feedback.

### Phase B — Customer Decision Tools

- Estimate/recommendation organizer.
- Mechanic conversation questions and second-opinion triggers.
- Evidence reuse and improved report sharing.
- Controlled Mechanic Match referral/shortlist.
- Seller Check transparency intake and listing pack.

### Phase C — Marketplace and Guided Service

- ClearSale listings with transparency profiles and material history.
- Defined provider verification and expanded Mechanic Match.
- Low-risk Guided Service pilot with safety tiers and escalation.
- Buyer/seller evidence-request and comparison workflows.

### Phase D — Scaled Ecosystem

- Broader provider coverage and verified specialties.
- Supported OBD/device integrations.
- Permissioned verified-outcome learning.
- Region-specific marketplace requirements.
- Expanded Guided Service only after safety and outcome evaluation.

## 7. Marketing Rules From This Roadmap

Lead beta and initial public marketing with Drivable Check and Buyer Check.

Mark Mechanic Match, Seller Check/ClearSale marketplace, Guided Service, and provider vetting as coming soon until readiness is proven.

Never headline:

- “Tells you exactly what is wrong.”
- “Stops mechanics from ripping you off.”
- “Only honest sellers.”
- “Makes people tell the truth.”
- “Shows what is right with the car.”
- “Vetted mechanics” before the verification program operates.

Use:

> Drivable by Mechanic's Eye helps you see what the evidence supports, what is still unknown, and what to ask next—whether you are dealing with a vehicle problem or considering a used car.

## 8. Decision Log

| Date | Decision | Effect |
|---|---|---|
| 2026-08-24 | Master brand is Drivable by Mechanic's Eye. | Drivable dominates; Mechanic's Eye is endorsement. |
| 2026-08-24 | Drivable Check and Buyer Check are primary beta/launch products. | Readiness and launch assets prioritize these products. |
| 2026-08-24 | Mechanic Match, Seller Check/ClearSale, and Guided Service are expansion products unless readiness proves otherwise. | Market as coming soon until gated. |
| 2026-08-24 | Consumer advocacy uses questions, evidence, and second opinions—not mechanic accusation. | Avoid defamation and anti-mechanic positioning. |
| 2026-08-24 | ClearSale uses a field-level transparency profile rather than an honesty score or guarantee. | Make support visible without false reassurance. |
