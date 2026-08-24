# Drivable Unified Product Architecture and PRD V1

**Status:** Proposed product contract  
**Audience:** Product, design, engineering, operations, reviewers, safety/legal advisors  
**Scope:** Diagnose / Drivable Check, Buyer Check, Seller Check / ClearSale, Mechanic Match, accounts, evidence, reports, and human review  
**Repository baseline:** 2026-08-24

## 1. Executive Summary

Drivable is one evidence-centered vehicle decision product with several user entry points. A user may need to understand a current symptom, evaluate a purchase, prepare an honest sale, or find qualified hands-on help. Those are not separate data silos. They are different decisions made from a shared, time-aware vehicle evidence record.

The product promise is:

> Drivable helps everyday people organize vehicle evidence and make a bounded next decision: whether to stop, inspect, repair, monitor, sell, buy, or walk away.

Drivable does not remotely certify a diagnosis, vehicle condition, safety, title, seller, buyer, mechanic, price, or transaction. It ranks at most three possible causes when the evidence supports doing so, explains the evidence and uncertainty behind them, asks for the smallest useful missing evidence, and routes safety-critical or materially uncertain cases to a human reviewer or in-person professional.

The core architecture is a shared evidence lifecycle feeding purpose-specific cases and immutable report versions:

`Account -> Vehicle -> Evidence -> Case -> Analysis Draft -> Review -> Released Report -> Outcome`

The most important trust rule is non-negotiable:

> A seller claim is always stored, displayed, analyzed, and exported as a claim unless independent observed evidence verifies the same proposition. AI-generated text must never rewrite an unverified seller claim as a fact.

## 2. Goals and Non-Goals

### Goals

- Provide a coherent path across Diagnose / Drivable Check, Buyer Check, Seller Check / ClearSale, and Mechanic Match.
- Reuse vehicle evidence with provenance, consent, freshness, and purpose controls.
- Support guided text, photo, sound, vibration, OBD, document, and structured-observation collection.
- Return zero to three confidence-ranked possible causes, not a forced single diagnosis.
- Make confidence, contradictions, and missing evidence visible and actionable.
- Generate transparent seller listings whose statements can be traced to claims or evidence.
- Require human review when safety, uncertainty, high consequence, or content integrity demands it.
- Support accounts, multiple roles, and behavior classification without permanently stereotyping a user.
- Preserve the exact evidence, draft, review, and released-report state needed for audit and learning.

### Non-Goals

- Replacing an in-person inspection, mechanic, emergency service, or manufacturer procedure.
- Declaring a vehicle safe to drive or guaranteeing a repair.
- Verifying title, ownership, liens, mileage, identity, mechanic quality, or buyer funds without an explicit independent verification service.
- Acting as vehicle dealer, broker, escrow, payment processor, transporter, insurer, or legal advisor.
- Automatically approving repairs, purchases, sales, listings, mechanics, or transactions.
- Treating NHTSA year/make/model context as VIN-level applicability or case-specific proof.
- Claiming the system learns merely because it stores data.

## 3. Product Vocabulary

Use these terms consistently in UI, APIs, reports, operations, and analytics.

| Term | Contract |
|---|---|
| Account | An authenticated person or organization identity with permissions and consent settings. |
| Role | A permission-bearing capacity: customer, mechanic, reviewer, support, or administrator. |
| Behavior mode | The user's current intent in a case: owner/operator, prospective buyer, seller, helper, or professional. It is contextual, may change, and is not a permanent identity judgment. |
| Vehicle | A durable record for one vehicle, identified with the least data necessary; VIN may be absent or unverified. |
| Evidence item | A versioned input with provenance, capture context, consent, freshness, and verification state. |
| Claim | A statement made by a person or source that has not been independently established as fact. |
| Observation | What a person, device, document, or reviewer directly observed; its scope and source remain explicit. |
| Case | A purpose- and time-bounded question about a vehicle, such as a current symptom, purchase, or sale. |
| Analysis draft | Machine-generated structured inference; internal and never a fact source. |
| Review | A human decision that may approve, edit, request evidence, escalate, or block release. |
| Report | An immutable customer-facing snapshot released for a stated purpose from stated evidence. |
| Listing | A seller-facing publication derived from attributed claims and observations, not a condition certification. |
| Outcome | A later event with its own source and verification level, such as inspection, repair, sale, or no action. |

## 4. Product Surfaces

### 4.1 Diagnose / Drivable Check

For an owner, operator, or helper asking what a symptom may mean and what to do next. It collects symptom timing, severity, recent changes, warning indicators, maintenance and repair context, and safely obtainable evidence. It returns safety routing, up to three possible causes, missing evidence, and decision paths.

### 4.2 Buyer Check

For a prospective buyer evaluating a listing or vehicle. It keeps seller claims separate from buyer/reviewer observations, identifies contradictions and inspection gaps, requests proof, and states conditions for inspection, negotiation, pause, or walk-away. It is a remote risk review, not a pre-purchase inspection.

### 4.3 Seller Check / ClearSale

For an owner or authorized seller preparing an honest condition record and listing. Seller Check organizes known issues, repair history, disclosures, and evidence. ClearSale produces transparent listing copy and a traceable evidence summary. Publication requires the seller to attest that claims are accurate to their knowledge and that unresolved issues remain disclosed.

### 4.4 Mechanic Match

For routing a case to an appropriate provider based on service category, vehicle context, location/service radius, availability, capability, and declared commercial terms. Matching is a shortlist, not an endorsement or guarantee. Safety-critical cases may bypass ordinary matching copy and direct the user to towing, emergency, dealer, or specialist help as appropriate.

### 4.5 Garage and Evidence Record

The Garage is the user's durable vehicle workspace. It shows vehicles, cases, evidence, reports, repairs, and outcomes. Historical evidence remains date-stamped and must not be presented as current condition without a freshness check.

## 5. Conceptual Architecture

### 5.1 Layers

1. **Identity and access:** accounts, roles, behavior mode, consent, authorization, audit.
2. **Vehicle identity:** user-to-vehicle relationship, VIN status, ownership/authority claims, aliases.
3. **Evidence system:** upload/capture guidance, provenance, quality, safety, classification, reuse, revocation, retention.
4. **Case orchestration:** intent, question, evidence selection, completeness, contradictions, status, escalation.
5. **Decision engine:** safety rules first, retrieval of approved context, bounded inference, possible-cause ranking, confidence, missing evidence, decision paths.
6. **Review operations:** queues, qualifications, service levels, reviewer changes, release gates, audit trail.
7. **Delivery products:** Diagnose, Buyer Check, Seller Check/ClearSale, Mechanic Match packet, report sharing, listing publication.
8. **Outcomes and evaluation:** user action, inspection/repair findings, verification level, usefulness, calibration and safety evaluation.

### 5.2 Architectural Invariants

- Evidence is never overwritten to fit a conclusion; corrections create a new version or explicit supersession.
- Every material output statement is attributable to a claim, observation, inference, external reference, or reviewer conclusion.
- Analysis drafts are immutable internal artifacts and cannot be released without satisfying the applicable gate.
- Reports and listings are immutable releases; updates create a new version with a visible date and change summary.
- Case purpose controls what evidence may be used and how it may be phrased.
- Safety classification runs before diagnostic ranking and again before release.
- Missing evidence lowers confidence or prevents an answer; it never invites invented detail.
- Knowledge packs and NHTSA context can suggest questions, never confirm a vehicle-specific fact.
- Customer-visible content must originate from an approved release state, never directly from a raw model response.

## 6. Shared Evidence Lifecycle

### 6.1 Evidence States

`requested -> submitted -> safety_screened -> quality_checked -> classified -> available -> selected_for_case -> interpreted -> reviewed -> included_in_release -> retained/expired/revoked`

An item can instead become `rejected` for corruption, unsupported format, unsafe capture, malicious content, unclear consent, or irrelevance. Rejection preserves the audit event but not necessarily the original binary, subject to retention policy.

### 6.2 Required Evidence Metadata

Every evidence item requires:

- Stable evidence ID and version.
- Vehicle ID and submitting account ID.
- Source actor and source type: seller claim, customer report, buyer observation, mechanic observation, reviewer observation, device output, document, external reference, or system-derived.
- Modality: text, photo, video, audio, vibration/accelerometer, OBD data/screenshot, repair record, inspection record, or other structured observation.
- Capture/upload time and, when known, event time and mileage.
- Capture context: engine state, speed/RPM, ambient condition, location on vehicle, and who operated/captured it where relevant.
- Original file metadata and immutable storage reference or content hash.
- Consent, allowed purposes, sharing scope, and retention status.
- Quality status and limitations.
- Verification state: `unverified_claim`, `self_observed`, `device_observed`, `document_supported`, `professional_observed`, `independently_verified`, `contradicted`, or `unknown`.
- Freshness status: current enough for this case, stale, or unknown.
- Safety flag and whether capture instructions were followed.
- Derived labels with model/rule version and label confidence, kept separate from source evidence.

### 6.3 Guided Collection Contract

Collection must request the smallest safe next item that could change safety routing, cause ranking, confidence, or the next decision.

| Modality | Guidance requirement | Minimum quality/context | Safety boundary |
|---|---|---|---|
| Text | Ask what happened, when, frequency, changes, warning lights, recent work, and goal. | Structured answers plus original narrative. | Do not use text answers to reassure away a critical symptom. |
| Photo | Show framing examples for dashboard, leak area, tire/wheel, body damage, fluid, or document excerpt. | Lighting, focus, orientation, relevant area, capture time. | Engine off, parked, cooled, supported, or otherwise safe as appropriate; no reaching near moving/hot parts. |
| Sound/video | Prompt for cold start, idle, warning display, or symptom conditions only when safe. | Distance, location, operating state, duration, background noise. | Never ask the driver to record while moving; use a passenger or stationary capture. Stop on smoke, fire, severe heat, fuel odor, or loss of control. |
| Vibration | Ask where felt, trigger condition, speed/RPM band, braking/turning relationship, and severity. | Phone/device placement and sampling context if sensor data is used. | No handheld capture by a driver and no attempt to reproduce severe control symptoms. |
| OBD | Accept typed codes, screenshots, or supported structured data; record code status and freeze frame when available. | Scanner type, timestamp, current/pending/permanent, readiness and recent-clear status. | Codes are clues, not diagnoses; never instruct clearing before capture or imply no codes means no problem. |
| Records | Ask for relevant receipts, inspection notes, title/history extracts, or maintenance records. | Issuer, date, mileage, readable scope; sensitive data redaction. | A document supports only what it actually states and may itself be unverified or outdated. |

### 6.4 Reuse Rules

- The account holder selects existing evidence for a new case; the system may recommend relevant items but must show what will be reused.
- Reuse must respect original consent, role permissions, and sharing scope.
- The product displays age, mileage-at-capture, source, and verification state before reuse.
- A new owner or prospective buyer does not inherit private evidence automatically.
- Shared report recipients see only the released evidence summary or explicitly shared assets.
- Deletion/revocation rules distinguish removal from future use from legally or operationally required audit retention.
- Derived interpretations are re-run or labeled with their original model/version; they do not silently update historical reports.

## 7. Claim, Observation, and Inference Integrity

### 7.1 Statement Classes

Every material statement must carry one class internally:

- `claim`: attributed statement, not established.
- `observation`: directly observed within a named scope.
- `inference`: possible explanation produced from evidence.
- `verified_fact`: established by an approved independent method within a defined scope.
- `unknown`: missing or irresolvable.

### 7.2 Seller-Claim Firewall

The following rules apply to Buyer Check, Seller Check, ClearSale listings, summaries, prompts, exports, search snippets, and model-generated prose:

1. Store seller statements as `claim` with seller attribution and timestamp.
2. Render them with language such as “Seller states…”, “Seller-reported…”, or “Not independently verified.”
3. Never use a seller claim as supporting observed evidence for the same proposition.
4. Never allow summarization to drop attribution or the verification qualifier.
5. If independent evidence supports the proposition, show both records: the original claim and the supporting observation/verification.
6. If evidence conflicts, display the contradiction prominently; do not average it away.
7. Absence of contradicting evidence is not verification.
8. A receipt proves that a document reports work or payment; it does not by itself prove present condition or successful repair.
9. Seller approval of AI-generated copy does not change a claim into fact.
10. Publication blocks if a material sentence has no provenance class or if claim attribution has been removed.

Example:

- Allowed: “The seller reports that the water pump was replaced in 2024. A dated invoice was provided; current operation has not been independently inspected.”
- Prohibited: “The water pump was replaced and is in good condition.”

### 7.3 Transparent AI-Generated Listing Requirements

Every generated listing must:

- Say that Drivable assisted in organizing or drafting the listing.
- Separate `Seller-reported details`, `Observed evidence`, `Known issues`, and `Not verified / still needed`.
- Link each material condition statement to provenance metadata in the internal publication record.
- Preserve known defects and contradictions; generation cannot optimize them away.
- Avoid “certified,” “mechanic approved,” “safe,” “perfect,” “no issues,” or equivalent wording unless a narrowly scoped, authorized verification supports the exact statement—and even then must name the scope and date.
- Show listing version and evidence-as-of date.
- Require seller attestation before publication and human review when a release gate applies.

## 8. Accounts, Roles, and Behavior Classification

### 8.1 Account Requirements

- Guest intake may begin without an account, but saving, reusing, sharing, publishing, matching, or receiving a report requires verified contact and account acceptance.
- Support email verification and account recovery; stronger authentication is required for reviewers, mechanics, and administrators.
- Maintain user-controlled profile, communication preferences, consent choices, vehicle relationships, report access, export, correction, and deletion requests.
- One person may hold multiple roles, but privileged actions require explicit role activation and authorization.
- Organization accounts may manage staff, reviewer/mechanic membership, and scoped vehicle/case access post-beta.

### 8.2 Roles and Permissions

| Role | May do | Must not do by role alone |
|---|---|---|
| Customer | Create vehicles/cases, submit evidence, view owned releases, request review/match, provide outcomes. | View another user's private case or approve a report. |
| Seller | Add seller claims/evidence, approve listing copy, publish/unpublish owned listing. | Mark own claims independently verified or conceal required disclosures. |
| Buyer | Submit observations/questions, order Buyer Check, share selected evidence. | Access seller-private evidence or treat platform content as title/condition verification. |
| Mechanic/provider | Maintain profile/capabilities, accept eligible referrals, view consented handoff packet, submit scoped observations/outcomes. | Browse unrelated cases, certify beyond work performed, or alter original evidence. |
| Reviewer | Review assigned cases, request evidence, edit/approve/block releases within qualification scope. | Review outside qualification, erase original drafts, or self-approve conflicted work. |
| Support | Resolve account/fulfillment issues with least-privilege case metadata. | Change technical conclusions or approve safety content. |
| Administrator | Manage configuration, access, queues, incidents, and audit. | Bypass release controls without a logged emergency procedure and second-party review. |

### 8.3 Behavior Classification

At case start, ask the user's relationship and goal. Allowed modes are `owner_operator`, `prospective_buyer`, `seller`, `helper`, and `professional`. Classification:

- Is per case and user-editable.
- Controls prompts, required acknowledgments, default sharing, and report type.
- May be suggested from behavior but cannot silently change permissions or make trust judgments.
- Must not classify protected traits, creditworthiness, fraud propensity, driving ability, or mechanical competence from proxy data.
- Retains a history of changes for audit where it affected output or access.

## 9. User and Vehicle Journeys

### 9.1 Shared Start

1. User states their relationship to the vehicle and desired decision.
2. User selects or creates a vehicle, with VIN optional and verification status explicit.
3. System screens for immediate danger before asking the user to recreate a symptom.
4. User selects reusable evidence and adds guided new evidence.
5. System shows what was received, quality issues, contradictions, and what is still needed.
6. A purpose-specific case is created and processed through the applicable report/review path.

### 9.2 Diagnose / Drivable Check Journey

1. Describe symptom, timing, severity, warning indicators, recent repairs, and drivability.
2. Receive immediate stop/limit/unknown safety routing.
3. Capture safe evidence or skip with confidence impact shown.
4. Receive zero to three possible causes with evidence for/against and missing evidence.
5. Choose inspect/repair, appropriate DIY check, monitor, sell as-is, or escalation.
6. Share a mechanic handoff packet or request Mechanic Match.
7. Record outcome and evidence after service.

### 9.3 Buyer Check Journey

1. Add listing, seller claims, vehicle identifiers, price context, and buyer goal.
2. Add buyer observations and documents as distinct evidence.
3. See claims, observations, contradictions, and unknowns in separate sections.
4. Receive risk flags, inspection questions, evidence requests, and walk-away conditions.
5. Optionally request an independent inspection or Mechanic Match.
6. Decide inspect, negotiate, pause, or walk away; record outcome voluntarily.

### 9.4 Seller Check / ClearSale Journey

1. Seller states authority to list, without Drivable implying it has verified authority.
2. Seller enters condition claims, known issues, repairs, warning lights, damage, and title/mileage claims.
3. System requests honest photos, sound/video where safe, OBD status, and records.
4. Seller resolves contradictions or leaves them visibly unresolved.
5. AI drafts attributed listing sections and disclosure prompts.
6. Automated provenance checks and applicable human review run.
7. Seller reviews, attests, and publishes a versioned listing.
8. Material edits or new evidence generate a new version and may retrigger review.

### 9.5 Mechanic Match Journey

1. Case identifies required service category, urgency, mobility/tow needs, vehicle, location, timing, and preferences.
2. System filters by capability, service area, availability, verification status, and conflicts.
3. User sees a transparent shortlist and why each match may fit.
4. User consents to share a minimum handoff packet.
5. Provider accepts/declines; scheduling and price remain explicitly unguaranteed unless later contracted.
6. Provider may return scoped findings and outcomes with user consent.

### 9.6 Vehicle Lifecycle

A vehicle can be created from any journey, accumulate dated evidence and cases, change relationship/ownership state, and be archived. A sale does not transfer the prior owner's private Garage. A buyer may link a public listing/report snapshot to a new private vehicle record while preserving provenance and the original release date.

## 10. Decision, Safety, and Language Contract

### 10.1 Decision Order

1. Detect emergency/stop-driving indicators.
2. Determine whether safety can be assessed at all.
3. Check evidence quality, freshness, contradictions, and provenance.
4. Decide whether a responsible cause ranking is possible.
5. Rank at most three causes and explain differentiation.
6. Select the smallest useful missing evidence.
7. Offer bounded decision paths and escalation.
8. Apply human-review and release policy.

### 10.2 Safety Levels

| Level | Meaning | Customer language/action |
|---|---|---|
| Critical | Evidence suggests immediate control, fire, thermal, fuel, wheel/tire separation, severe brake/steering, or equivalent danger. | “Stop operating when safely possible. Move away if fire/fuel/electrical danger exists and contact emergency or roadside help as appropriate.” Block symptom recreation and ordinary DIY guidance. |
| High | Material safety concern needs prompt hands-on assessment. | Limit or avoid driving; arrange qualified inspection/tow depending on symptoms. Human review required for substantive report. |
| Medium | Timely attention is appropriate; continued use could worsen risk, reliability, or cost. | State monitoring limits and escalation triggers; do not say safe. |
| Low | No immediate safety indicator was identified in submitted evidence. | “No immediate indicator was identified” only, followed by limitations; never “safe to drive.” |
| Unknown | Evidence is insufficient or contradictory. | State inability to assess and request evidence or in-person help. Unknown does not default to low. |

### 10.3 Bounded Language

Approved patterns include “possible causes include,” “based on the information provided,” “this evidence is consistent with,” “confidence is low/moderate/high because,” “not independently verified,” and “an in-person inspection is recommended before…”.

Prohibited patterns include “definitely,” “guaranteed fix,” “safe to drive,” “no risk,” “mechanic approved” without scoped approval, “clean title” from seller text alone, or “you do not need an inspection/mechanic.”

Do not generate step-by-step work on airbags, high-voltage systems, fuel systems, lifting/supporting a vehicle, severe brake/steering faults, or other high-risk procedures without a separately approved safety policy. The default is a bounded observation or professional handoff.

## 11. Confidence and Missing-Evidence Behavior

### 11.1 Confidence Dimensions

Confidence is not a decorative percentage. Each cause uses an ordinal public level and internal rationale based on:

- Evidence relevance and specificity.
- Source/verification strength.
- Quality and capture context.
- Consistency across independent evidence.
- Recency and mileage relevance.
- Alternative explanations still plausible.
- Contradictions and known model/coverage limitations.

Public levels remain `insufficient_information`, `low`, `moderate`, and `high`. “High” still means a strongly supported possible cause, not confirmation.

### 11.2 Cause Ranking Contract

- Return **zero to three** possible causes.
- Return zero when critical safety routing takes precedence or information cannot support responsible inference.
- Rank only meaningful alternatives; do not pad to three.
- For each cause show: rank, confidence level, plain-language explanation, supporting evidence, conflicting/weakening evidence, what would distinguish it, and whether hands-on verification is required.
- The confidence of one cause does not need to sum with others to 100 percent.
- Do not expose numeric precision until calibration supports it; existing percent-based UI should be treated as legacy, not the product contract.

### 11.3 Missing Evidence

Each missing item has `helpful`, `important`, or `critical` priority and states:

- What is missing.
- Why it matters.
- How to obtain it safely.
- Which decision or cause it could change.
- What happens if the user cannot provide it.

Critical missing evidence blocks the affected conclusion or release. Important missing evidence caps confidence at moderate unless a reviewer documents why independent evidence is sufficient. Helpful evidence does not block release. Unsafe-to-collect evidence is never requested; route to a professional instead.

Contradiction is not merely missing evidence. It must be shown separately, lower confidence, and trigger review when material to safety, price, title, disclosure, or the leading cause.

## 12. Report Contracts

### 12.1 Common Report Envelope

Every released report contains:

- Report ID, version, type, case ID, status, created/released times, and evidence-as-of time.
- Vehicle identity and verification status.
- User goal and behavior mode.
- Plain-language summary.
- Immediate safety/urgency rating and limitations.
- Attributed claims, observations, and contradictions.
- Zero to three possible causes with per-cause confidence and rationale where applicable.
- Supporting, conflicting, missing, stale, and excluded evidence summaries.
- Bounded next-decision paths and escalation triggers.
- Human-review status, reviewer scope, and what review does not mean.
- Sharing scope, expiration/freshness notice, and standard disclaimer.
- Provenance manifest internally linking every material output statement to evidence or reviewer rationale.

### 12.2 Report Types

| Report | Required purpose-specific sections | Release rule |
|---|---|---|
| Drivable Check / First Look | Symptom summary, safety route, possible causes, next questions/checks, mechanic script. | Auto-release only for approved low-consequence patterns post-beta; MVP uses review policy below. |
| Full Decision Report | All common fields plus repair/DIY/monitor/sell tradeoffs and decision-change conditions. | Review for high cost, high/unknown safety, low confidence with material decision, or contradictions. |
| Buyer Check | Seller claims, observations, claim/evidence matrix, red flags, inspection gaps, questions, negotiate/pause/walk-away conditions. | Material title, structural, safety, fraud, or contradictory cases require review. |
| Seller Check | Seller claim inventory, known issues, disclosure prompts, evidence gaps, listing readiness. | Seller attestation required; human review for gated content. |
| ClearSale Listing Pack | AI-assistance disclosure, attributed listing copy, known issues, observed evidence, unverified items, version/date. | Provenance validation and seller attestation always; human review per risk gate. |
| Mechanic Handoff | User goal, symptom timeline, safety flags, evidence links, OBD details, possible causes labeled as hypotheses, requested checks. | User sharing consent required; no customer-private evidence beyond selection. |
| Human Review Add-On | Reviewer disposition, edits, unresolved uncertainty, scope and limitations. | Only a qualified reviewer may release; still not certification or physical inspection. |

### 12.3 Status Contract

Use the repository's established lifecycle as the base:

`intake_received -> needs_more_info -> ai_draft_ready -> needs_human_review -> customer_ready_draft -> approved_to_send -> sent_to_customer`

Terminal/side states are `do_not_send` and `archived`. Add conceptual `superseded` for released versions in future implementation. Only `approved_to_send` can be delivered. Mock/test content can never enter `approved_to_send`.

## 13. Human Review Policy

### 13.1 Mandatory Review Triggers

- Critical, high, or unknown safety with a material action recommendation.
- Brake, steering, wheel/tire separation, fire/fuel, high-voltage, overheating, severe electrical, airbag, structural, or loss-of-control indicators.
- Insufficient or low confidence where the user may spend substantial money or decide to drive, buy, or sell.
- Material contradictions, especially seller claim versus observed evidence.
- Title/ownership/lien/mileage claims that could be read as verified.
- High-cost repair paths or invasive/high-risk DIY content.
- Suspected prompt injection, manipulated evidence, fraud/scam pattern, or policy evasion.
- Complaint, adverse event, reviewer override, or model/policy anomaly.
- Any listing/report that automated provenance validation cannot fully classify.

### 13.2 Reviewer Actions

A qualified reviewer may `request_more_evidence`, `edit_and_continue`, `approve`, `escalate_to_specialist`, or `do_not_send`. Every action records reviewer, qualification scope, reason, changed statements, timestamp, and policy/model versions. Reviewer edits do not erase the original draft.

Human review checks reasoning and communication within submitted evidence; it is not hands-on diagnosis, inspection, certification, or safety clearance unless a separate professional service explicitly provides that narrow scope.

## 14. Mechanic Match Requirements

- Provider profile: identity/organization, contact, location/service radius, mobile/shop/tow capability, specialties, vehicle systems, licenses/certifications where applicable and verification status, insurance status if collected, languages, accessibility, hours, availability, pricing model, and last verification date.
- Match inputs: case service category, safety/urgency, vehicle, location, mobility, timing, evidence modalities, user preferences, and required specialist/tool capability.
- Ranking explanation must use visible job-fit factors; ratings alone cannot dominate.
- Clearly label self-reported versus verified provider attributes.
- Exclude suspended, expired, unavailable, out-of-scope, or conflicted providers.
- Do not promise availability, final price, diagnosis, repair, quality, or outcome.
- Share only user-approved case information; provider access expires after the service window.
- Capture acceptance, completion, user feedback, provider findings, and supporting documents as separate, provenance-bearing outcomes.

## 15. Phased Scope

### 15.1 MVP: Controlled, Review-First Service

In scope:

- Account/contact verification sufficient to save a case and receive a report.
- One Garage with multiple vehicles and explicit vehicle relationship.
- Diagnose / Drivable Check, Buyer Check, Seller Check / ClearSale listing pack.
- Guided text, photo, sound/video, vibration description/file, OBD code/screenshot, and record upload.
- Shared evidence IDs, provenance class, timestamps, consent, quality, and case selection.
- Safety-first intake and stop-driving routing.
- Zero-to-three ordinal confidence-ranked possible causes.
- Missing-evidence and contradiction display.
- Claim firewall and transparent AI-generated listings.
- Manual reviewer queue and immutable approved report versions.
- Mechanic Match as a curated/manual referral shortlist and consented handoff packet.
- Basic outcome capture and audit events.

MVP constraints:

- Human review is the default before customer delivery for substantive reports/listings.
- No automated safety clearance, title verification, mechanic guarantee, transaction handling, or public marketplace ranking claims.
- No claim of automatic learning.

### 15.2 Beta: Instrumented Self-Service With Guardrails

- More complete account recovery, sharing, privacy, evidence reuse, and vehicle transfer/archive flows.
- Automated quality feedback for media and OBD intake.
- Calibrated evidence-completeness scoring and limited auto-release for explicitly approved low-consequence patterns.
- Reviewer qualification routing, service levels, sampling, disagreement tracking, and incident workflows.
- Mechanic availability/capability management and transparent ranking.
- Versioned public ClearSale listings with material-change review.
- Structured outcomes and calibration dashboards.
- Abuse controls, provenance linting, accessibility, localization foundation, and privacy retention jobs.

### 15.3 Post-Beta

- Organization/fleet and multi-user vehicle access.
- Supported structured OBD/device integrations after security and compatibility review.
- Broader mechanic booking/payment only after separate marketplace, insurance, tax, dispute, and legal design.
- Independently validated VIN/title/history integrations with precise scopes.
- Model-assisted reviewer tools and carefully evaluated auto-release expansion.
- Learning-derived improvements only after consent, dataset quality controls, offline evaluation, safety review, staged rollout, and rollback capability.
- Region-specific disclosure and transaction guidance maintained from official sources.

## 16. Acceptance Criteria

### 16.1 End-to-End

- A user can create/select a vehicle once and intentionally reuse eligible evidence across at least two product modes.
- Every released report identifies its purpose, evidence-as-of time, version, and limitations.
- A material report statement can be traced internally to one or more evidence items or reviewer rationale.
- Only approved releases can be sent or published; raw AI and mock content cannot cross the gate.

### 16.2 Safety and Decisions

- Critical trigger fixtures block ordinary cause/DIY output and show an appropriate stop/escalation message.
- Unknown safety never renders as low safety or “safe.”
- The system returns no more than three causes and does not pad an insufficient case.
- Each cause includes confidence, support, uncertainty/conflict, and a distinguishing next check.
- Unsafe evidence capture is never requested.

### 16.3 Claims and Listings

- Given “seller says it only needs pads,” every customer-visible rendering retains seller attribution and unverified status.
- A seller claim alone cannot satisfy observed-evidence requirements or increase verification state.
- Conflicting OBD/photo/reviewer evidence produces a visible contradiction and appropriate confidence/review change.
- AI-generated listing copy visibly discloses AI assistance and separates claims, observations, known issues, and unknowns.
- Publication fails closed when a material statement lacks provenance or a known issue is omitted.

### 16.4 Accounts and Access

- Users can hold multiple roles while permissions remain least-privilege and case-scoped.
- Behavior mode is editable, case-specific, and does not silently grant access.
- A buyer cannot access seller-private evidence; a mechanic sees only the consented handoff packet.
- Reviewer/admin privileged actions are authenticated and audited.

### 16.5 Evidence and Outcomes

- Evidence retains original source, version, date/mileage context, verification state, consent, and freshness.
- Reused stale evidence is labeled and cannot silently represent current condition.
- Report updates create versions rather than changing an already released artifact.
- Outcomes distinguish user-reported, document-supported, professional-observed, and independently verified findings.

### 16.6 Quality and Operations

- Review queues expose trigger reason, priority, qualification need, evidence, model/policy version, and service-level age.
- Accessibility testing covers guided capture, confidence, warnings, and claim/observation distinctions without relying on color alone.
- Security/privacy review covers VINs, location, contact information, media, documents, sharing links, access logs, retention, and deletion.
- Calibration and safety test sets pass agreed thresholds before any auto-release expansion.

## 17. Measures of Success

Guardrails lead growth metrics.

- Zero known releases in which an unverified seller claim is presented as fact.
- Zero mock/raw AI drafts delivered as approved reports.
- Critical safety trigger recall and reviewer escalation rate meet a separately approved safety threshold.
- Confidence calibration improves by report type and evidence tier without increasing unsafe reassurance.
- Users understand the next action, limitations, and missing evidence in usability testing.
- Reviewer override, request-more-evidence, do-not-send, and disagreement rates decline for validated reasons, not by suppressing review.
- Evidence completion, report turnaround, mechanic handoff completion, and verified outcome capture improve.
- Complaints/adverse events are attributable to exact report and evidence versions.

## 18. Risks and Mitigations

| Risk | Impact | Primary mitigation |
|---|---|---|
| Seller claim laundering through summaries/listings | Consumer harm and loss of trust | Typed provenance, claim firewall, fail-closed publishing, regression fixtures. |
| False reassurance on safety | Injury/property risk | Safety-first rules, unknown-not-low, prohibited language, mandatory review/escalation. |
| Overconfident diagnosis from sparse media | Bad repair/spend decisions | Zero-to-three causes, ordinal confidence, evidence caps, missing-evidence behavior. |
| Stale evidence reused as current | Misleading decisions | Evidence-as-of dates, mileage/freshness checks, explicit reselection. |
| Reviewer inconsistency or overload | Delay and uneven safety | Qualification routing, rubrics, second review, sampling, service levels. |
| Provider mismatch or implied endorsement | Poor service or liability | Verified attribute scope, explainable matching, clear non-guarantee, feedback controls. |
| Sensitive media/VIN/location exposure | Privacy/security harm | Minimization, scoped consent, access expiry, encryption, audit, retention/deletion. |
| Fraud/manipulated content or prompt injection | Corrupt outputs/publication | Content isolation, provenance checks, abuse review, never follow instructions embedded in evidence. |
| NHTSA/knowledge context treated as vehicle fact | Incorrect applicability | Context-only labels, VIN applicability checks, source/version display. |
| Outcome bias mistaken for learning | Unsafe optimization | Verification tiers, representative evaluation, consent, human/legal review. |
| Role inference becomes profiling | Fairness/privacy harm | Case-specific editable behavior mode, no protected/sensitive inference. |
| Marketplace scope creep | Regulatory/operational exposure | Explicit non-goals and separate approval for payments, brokerage, title, or transport. |

## 19. Dependencies and Open Decisions

### Product/Policy Dependencies

- Safety taxonomy, stop-driving wording, DIY boundaries, and reviewer qualification rubric approved by automotive and legal/safety advisors.
- Privacy/consent, evidence sharing, retention, deletion, minor-use, and outcome-learning policies.
- ClearSale seller attestation, disclosure rules, AI-assistance disclosure, and jurisdiction strategy.
- Mechanic verification, ranking, referral economics, complaints, suspension, and incident policy.
- Accessibility and multilingual safety-language review.

### Technical Dependencies

- Canonical identity/account and authorization service.
- Durable vehicle, evidence, case, draft, review, report-version, audit, and outcome stores.
- Secure binary media storage, malware scanning, metadata extraction, signed/expiring access, and deletion workflow.
- Structured model output validation, provenance linking, prompt/version registry, evaluation harness, and rollback.
- Reviewer operations interface and delivery gate.
- Notification, sharing, observability, abuse detection, analytics, and incident tooling.

### Decisions Required Before Build

- What constitutes a verified mechanic attribute and who verifies it?
- Which MVP reports may ever auto-release, if any?
- Who is qualified to review each safety/system category?
- What retention periods apply per evidence type and jurisdiction?
- Is ClearSale initially private-link fulfillment or public marketplace publication?
- What independent services, if any, verify VIN/title/history and with what exact claims?
- What response-time promise can review operations support?

## 20. Prioritized Backlog

Priority order reflects safety and trust dependencies, not just visible feature value.

### P0 — Product Contract and Safety Foundation

1. Ratify vocabulary, non-goals, statement classes, claim firewall, and prohibited language.
2. Define safety trigger taxonomy, response copy, capture prohibitions, and escalation matrix.
3. Define canonical common report envelope, cause contract, status transitions, and immutable release rules.
4. Build a golden test corpus including seller-claim laundering, contradictions, sparse evidence, critical symptoms, mock leakage, and NHTSA overreach.
5. Approve reviewer qualifications, dispositions, second-review conditions, and audit requirements.
6. Complete privacy/security threat model for accounts, VIN, media, documents, location, sharing, and retention.

### P1 — MVP Shared Platform

7. Implement account/contact verification, role activation, behavior mode, consent, and vehicle relationships.
8. Implement shared evidence metadata/lifecycle, guided safe capture, quality/freshness, and case selection.
9. Implement case orchestration for Diagnose, Buyer Check, and Seller Check/ClearSale.
10. Implement safety-first structured decision pipeline and zero-to-three cause output.
11. Implement confidence rationale, critical evidence blocks, contradictions, and missing-evidence requests.
12. Implement reviewer queue, immutable drafts, edit diff, approval gate, delivery, and audit.
13. Implement versioned report renderer and internal provenance manifest.
14. Implement claim-aware ClearSale listing generator, seller attestation, provenance linter, and publication block.
15. Implement curated/manual Mechanic Match and consented handoff packet.
16. Implement basic outcomes and user correction/reporting flow.

### P2 — Beta Reliability and Operations

17. Add media quality feedback, malware/abuse checks, expiring shares, retention/deletion jobs.
18. Add reviewer qualification routing, service levels, sampling, disagreement, and incident management.
19. Add mechanic profile verification states, availability, transparent matching rationale, and suspension controls.
20. Add public listing version history, material-change detection, and re-review.
21. Add calibration, safety, provenance, funnel, and adverse-event dashboards.
22. Run accessibility, privacy, security, automotive safety, and legal readiness reviews.
23. Pilot narrowly defined low-consequence auto-release only if evaluation and operations gates pass.

### P3 — Post-Beta Expansion

24. Add organization/fleet access and delegated vehicle management.
25. Evaluate supported OBD/device integrations with compatibility and security controls.
26. Evaluate scoped independent VIN/title/history verification integrations.
27. Add region-specific guidance maintained against official sources.
28. Build consented learning datasets and offline evaluation; stage improvements behind review and rollback.
29. Evaluate booking/payment only as a separately approved marketplace program.

## 21. Repository Alignment and Baseline

This PRD consolidates concepts already present in the repository:

- `shared/drivableDecisionEngine.ts` defines the north star, risk/confidence levels, decision paths, and report families.
- `shared/drivableReportTypes.ts` demonstrates a structured report and already labels seller-sourced evidence.
- `shared/drivableReportStatus.ts` defines the internal review and delivery lifecycle.
- Existing product docs establish safety language, mock-output restrictions, learning-loop controls, and paid report boundaries.
- Existing previews cover Buyer Check, ClearSale, Mechanic Match, evidence collection, missing information, review, and outcomes.
- Existing data design documents describe media provenance, immutable drafts/reports, review, and verification-tiered outcomes.

This document intentionally does not authorize or make schema, migration, application, NHTSA asset, pricing, payment, deployment, or production-data changes.

### Requested Validation Baseline

`npm run check` was run from the repository root on 2026-08-24. It exited with code 1 before TypeScript analysis because the local executable was unavailable:

```text
> rest-express@1.0.0 check
> tsc

'tsc' is not recognized as an internal or external command,
operable program or batch file.
```

This is an environment/dependency baseline failure, not evidence of a TypeScript source failure. Dependencies were not installed and unrelated code was not changed.

## 22. Definition of Product Readiness

The unified product is ready for a staged MVP only when P0 policy decisions are approved, the shared evidence and report contracts are implementable, the seller-claim firewall passes regression tests, critical safety fixtures fail closed, human review operations can meet the promised service level, and privacy/security controls cover the evidence being collected. Feature completeness cannot compensate for failure of those trust gates.
