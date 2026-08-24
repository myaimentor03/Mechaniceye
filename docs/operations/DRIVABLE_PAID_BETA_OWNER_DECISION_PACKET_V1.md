# Drivable Paid-Beta Owner Decision Packet V1

## Purpose

This packet asks the owner to make the minimum explicit decisions required to run Drivable's controlled paid beta. It recommends reversible defaults but does not make legal, privacy, pricing, credential, infrastructure-spend, or business-policy decisions for the owner.

No box in this packet is approval merely because it contains a recommendation. The owner must record the selected option, limits, approver, date, and any adviser review separately for each decision.

## Source and Status Basis

This packet is grounded in:

- `DRIVABLE_CONTROLLED_PAID_BETA_PROGRAM_V1.md` and the repository's existing product, safety, privacy, readiness, support, and launch documents.
- Commit `181b899`, which describes the unified architecture as a **proposed product contract**, including the lifecycle `Account -> Vehicle -> Evidence -> Case -> Analysis Draft -> Review -> Released Report -> Outcome`, immutable/versioned evidence and releases, purpose/consent controls, and fail-closed review gates.
- Commit `26ec396`, which represents a secure photo-evidence implementation and its implementation report.

The two referenced commits are source snapshots and are not ancestors of this worktree's current `HEAD`. Their contents therefore inform these decisions but must not be assumed deployed or integrated into the current branch.

### Verified implementation represented by commit `26ec396`

- Multipart photo bytes are received for the represented Drivable Check implementation.
- Server-side controls validate count, declared MIME type, per-file byte size, and file signatures; assign server-controlled IDs and extensions; store case-scoped files and a manifest; reject traversal and mismatched/unsupported content; and support case cleanup.
- The represented limit is eight photos, 12 MB each, with JPEG, PNG, WebP, HEIC, and HEIF declared types subject to signature checks.
- Attachment metadata explicitly records `analysisStatus: uploaded_not_analyzed`.
- Photo filenames are not treated as visual findings.
- Runtime filesystem storage works for local operation, but ordinary Render filesystem storage is not production-durable without a persistent disk or private object storage.

### Planned, incomplete, or not established for paid beta

- The repository sources do not establish production-durable private media storage, a real authorized private attachment retrieval path, versioned media consent, authentication/authorization for customer media, an approved retention schedule, reviewer authorization, or a production-ready payment workflow.
- The referenced photo implementation does **not** analyze image bytes with AI. Image attachment metadata may reach a report/AI boundary, but that is not image analysis.
- The unified architecture is a proposed contract, not proof that its account, authorization, audit, review, consent, sharing, retention, deletion, or immutable-release controls are implemented.
- Existing planning prices and the `$24` beta price are hypotheses, not market facts.

## Blocking Labels

| Label | Meaning in this packet |
|---|---|
| Gate A | Blocks the owner-operated evidence exercise. |
| External testers | Blocks any person other than the owner-controlled identity/inbox. |
| Payment | Blocks requesting or collecting money. |
| Launch | Blocks broader/public launch; this packet never authorizes public launch. |

## Owner Approval Cover Sheet

The owner should complete this only after decisions 1-10 are individually resolved.

- Owner name:
- Decision packet version/date reviewed:
- Selected beta stage:
- Approved offer and price hypothesis:
- Approved maximum concurrent cases:
- Named reviewer and qualification scope:
- Approved support/refund owner:
- Approved media-storage choice and spending ceiling:
- Privacy/legal/adviser review completed, if required by owner or applicable obligations: Yes / No / Not determined
- Gate A decision: `GO` / `NO-GO`
- External unpaid tester decision: `GO` / `NO-GO`
- External paid tester decision: `GO` / `NO-GO`
- Conditions and expiration of approval:
- Owner signature/name and timestamp:

An approval expires when the offer, price, use case, evidence types, storage provider, retention terms, reviewer, support promise, jurisdiction, or cohort cap materially changes.

## Decision 1: Initial Tester Cohort and Maximum Concurrent Cases

**Why needed:** Cohort size controls review load, response time, record separation, incident exposure, and whether the owner can observe every case. The paid-beta plan stages owner tests, 3-5 trusted unpaid testers, five paid customers, and a later group of ten rather than approving public traffic.

**Realistic options:**

1. Owner-operated only, one active case.
2. After Gate A, three trusted unpaid testers invited one at a time, one active case.
3. After the unpaid gate, five paid customers, no more than two active cases and subject to the capacity formula.
4. A different owner-defined cohort/cap, with written capacity and safety justification.

**Recommended reversible beta default:** Approve option 1 now. Pre-authorize option 2 only after documented Gate A PASS. Do not pre-authorize paid cases. Keep one active case through trusted testing; decide separately whether the first paid cohort may reach two concurrent cases.

**Risks and tradeoffs:** A smaller cohort slows commercial learning but limits privacy, support, and safety exposure. More concurrency produces faster feedback but increases deadline pressure, wrong-recipient risk, review shortcuts, and incident scope. Friends may also provide biased willingness-to-pay evidence.

**Exact owner approval required:** Record the permitted stage, number invited, maximum active cases, recruitment channels, start/end dates, daily acceptance rule, waitlist rule, and who can pause intake.

**Blocks:** Gate A until the owner-only cap is approved; external testers until their cohort is approved; payment until the paid cohort is separately approved; launch remains blocked.

**Evidence to justify change:** Case-level fulfillment and support minutes, deadline performance, reviewer availability, zero critical control failures, issue frequency, and the exact prior-stage gate evidence. Raise concurrency only when observed workload plus support reserve fits the promised response time.

**Owner decision:** Selected option: ___; maximum active cases: ___; approval/conditions/date: ___

## Decision 2: `$24` Price Hypothesis, Refunds, and Customer Deliverable

**Why needed:** A customer must know the charge, exact deliverable, limitations, turnaround, correction right, and refund/cancellation terms before paying. The existing `$19-$29` range and `$24` figure are planning hypotheses, not established market prices.

**Realistic options:**

1. Keep all external testing comped while payment operations and policy remain unresolved.
2. After paid-test gates pass, test `$24` with five eligible customers receiving the same First Look Report scope.
3. Select another price/scope only with a new hypothesis and comparable test design.

**Recommended reversible beta default:** Comp Gate A and trusted testers. Reserve `$24` as the proposed five-customer hypothesis only after owner approval of payment verification, customer terms, tax/accounting handling, refund rules, and paid-test readiness.

Proposed deliverable: one manually reviewed First Look Report for one stable, non-emergency concern, containing a submitted-facts summary, zero to three possible-cause paths when evidence supports them, supporting/conflicting/missing evidence, confidence and urgency, conservative next checks, a mechanic script, limitations, and one factual/error correction request within seven calendar days. It is not a diagnosis, inspection, repair estimate, live call, emergency service, or safety clearance.

Proposed refundable events from the beta plan are cancellation before substantive review, Drivable decline after payment, duplicate payment, non-delivery, wrong scope, unapproved missed turnaround, material privacy/delivery failure, or inability to complete responsibly. Applicable obligations and provider rules may require different treatment.

**Risks and tradeoffs:** A low price may generate demand but fail to cover review/support costs; a high price may suppress learning. A broad deliverable creates scope disputes. Strict refunds reduce abuse but can undermine trust; generous refunds increase cost and may conceal product-quality problems if reasons are not logged.

**Exact owner approval required:** Approve the price, currency, customer count, included/excluded sections, promised turnaround, correction window, cancellation/refund language, payment verification source of truth, refund authority, tax/accounting handling, and whether any discounts are allowed. Obtain any advice the owner considers necessary; this packet does not approve those policies.

**Blocks:** Does not block owner-only Gate A if no money is collected; blocks payment and paid external testers; launch remains blocked.

**Evidence to justify change:** Eligible offer/accept/abandon/pay/refund counts; uniform-scope conversion denominator; customer value responses; payment fees; review, fulfillment, support, and correction time; refund reasons; and confirmed service costs. Five cases are beta evidence, not a general market fact.

**Owner decision:** Price/scope/refund policy selected: ___; payment source of truth: ___; approval/conditions/date: ___

## Decision 3: Reviewer Qualifications, Availability, Workload, and Response-Time Target

**Why needed:** Every beta report requires human review, and safety, uncertainty, contradictions, high consequence, and content integrity may require escalation. A reviewer cannot compensate for missing hands-on evidence and must not work outside documented competence.

**Realistic options:**

1. Name one reviewer with documented automotive and safety-review qualifications, a narrow scope, and a decline rule.
2. Use a primary and backup reviewer with the same documented scope and conflict controls.
3. Limit Gate A to workflow review and refuse external cases until an appropriately qualified reviewer is available.

**Recommended reversible beta default:** One named reviewer for the narrow owner-current-concern offer, one active case, 60 planned review/fulfillment minutes plus 20 minutes support reserve per open case, and a two-business-day target after complete eligible intake (and verified payment for paid cases). If the reviewer is unavailable or the case exceeds scope, pause or decline rather than delegate informally.

**Risks and tradeoffs:** A single reviewer creates continuity but is a capacity and availability risk. A backup improves resilience but adds consistency and access-control requirements. A faster promise may improve conversion while encouraging rushed review. Human review improves quality but does not certify condition or guarantee diagnosis.

**Exact owner approval required:** Name the reviewer(s); approve the evidence supporting qualifications, allowed case scope, prohibited scope, conflicts, availability calendar, workload cap, response target, backup/decline rule, compensation if any, access level, and who may set `approved_to_send`.

**Blocks:** Gate A unless a reviewer can perform the scripted approval exercise; external testers and payment until reviewer coverage is approved; launch remains blocked pending scalable review operations.

**Evidence to justify change:** Review edits by category, review/total time, escalation accuracy, missed deadlines, corrections, customer misunderstandings, outcome contradictions, reviewer agreement checks, and workload distribution. Shorten time or expand scope only after repeat evidence without safety/control degradation.

**Owner decision:** Reviewer/scope/target selected: ___; backup rule: ___; approval/conditions/date: ___

## Decision 4: Safety Escalation and Refusal or Redirection

**Why needed:** Remote evidence can be incomplete, and Drivable cannot declare a vehicle safe. Safety classification must precede possible-cause ranking and release. Critical/high-risk cases cannot be treated as ordinary paid fulfillment.

**Realistic options:**

1. Refuse the entire beta case and redirect to qualified emergency, roadside, towing, inspection, or repair help.
2. Stop the report, mark `needs_human_review` or `do_not_send`, and allow a qualified reviewer to issue only conservative escalation language.
3. Request missing evidence only when it can be collected safely and no critical signal is present.

**Recommended reversible beta default:** Refuse active emergencies and critical-risk cases before payment. If a critical signal appears after acceptance, stop normal content, preserve the case, escalate to the owner/reviewer, issue only approved conservative redirection, and refund when the approved policy requires. Never ask a person to drive, recreate symptoms, crawl under a vehicle, touch hot/moving parts, or open a pressurized system for evidence.

Mandatory stop/redirect triggers include brake failure or severe braking loss; steering loss/binding/control problems; overheating or active coolant loss; fuel leak/strong fuel odor; smoke/fire; electrical arcing, severe overheating, burning odor, or battery thermal concern; oil-pressure warning; wheel/tire/hub/bearing/suspension/fastener separation risk; violent shaking/severe instability; or unpredictable operation. Also escalate reported harm/near harm, high-cost/high-consequence reliance, material contradictions, and insufficient information where reassurance could be unsafe.

**Risks and tradeoffs:** Conservative refusal loses revenue and may frustrate customers, but permissive handling risks false reassurance. Redirection is not confirmation that driving or towing is safe, and Drivable is not emergency monitoring or dispatch.

**Exact owner approval required:** Approve the trigger list, intake screening questions, customer wording, after-hours message, escalation contacts, refund treatment, logging/incident rule, and who may resume a blocked case. Any qualified safety/legal review remains the owner's decision.

**Blocks:** Gate A until high-risk blocking is tested; external testers and payment until escalation ownership and wording are approved; launch remains blocked.

**Evidence to justify change:** Scripted high-risk fixtures, zero bypasses, reviewer assessment, false-negative/false-positive review, customer comprehension, incidents/near misses, and later verified outcomes. Never relax a trigger solely to improve conversion.

**Owner decision:** Trigger/redirection policy selected: ___; escalation owner: ___; approval/conditions/date: ___

## Decision 5: Media Consent, Privacy Notice, Retention Period, and Deletion Process

**Why needed:** Photos and related case data may contain VINs, locations, plates, faces, addresses, documents, repair history, and communications. Collection, access, reuse, retention, correction, deletion, and optional learning use require clear purpose and owner-approved handling.

**Realistic options:**

1. Gate A with owner-controlled synthetic/non-sensitive media only; no external media.
2. External beta with versioned service consent, a reviewed privacy notice, separate optional-learning choice, defined retention schedule, role-limited access, and tested deletion/opt-out workflow.
3. Text-only external beta until private-media controls are ready.

**Recommended reversible beta default:** Use option 1 for Gate A. If external text testing is otherwise ready, option 3 reduces exposure. Do not accept external photos until the owner approves customer-facing notice/consent and storage/access/deletion controls. Treat service consent and optional product-learning permission separately; declining optional learning must not block service.

Proposed operational starting point for owner/adviser review—not a decided policy—is deletion of raw external media 30 days after case closure, with shorter deletion on verified request where allowed and with separately justified retention for consent/audit, accounting, dispute, safety, or legal records. The owner must set the actual periods, exceptions, verification procedure, backup behavior, and applicable-jurisdiction terms.

**Risks and tradeoffs:** Short retention limits exposure but may impair correction, dispute handling, and outcome evaluation. Longer retention supports review but increases privacy/security burden. Deletion promises are unsafe if backups, manifests, derived copies, provider lifecycle rules, and audit exceptions are not understood.

**Exact owner approval required:** Approve notice text/version, required service purposes, optional learning choice, media categories, access roles, processors, sharing, jurisdiction, actual retention periods by record type, deletion-request identity verification, response owner/time, backup/derived-copy handling, exceptions, and confirmation wording. Obtain appropriate privacy/legal review as determined by the owner.

**Blocks:** Owner-only Gate A may proceed with controlled data after a documented handling rule; external photo testers, payment for photo-bearing cases, and launch are blocked until approved and tested. External text cases still require appropriate notice/consent for the data collected.

**Evidence to justify change:** Data inventory, access logs, successful owner-run consent/correction/deletion/opt-out test, storage deletion proof for bytes and manifest, backup/provider documentation, request timing, incidents, and adviser guidance. Extend retention only for a stated purpose with updated notice/consent where required.

**Owner decision:** Consent/notice/retention/deletion policy selected: ___; adviser review: ___; approval/conditions/date: ___

## Decision 6: Production-Durable Private Media Storage and Acceptable Cost

**Why needed:** The represented runtime filesystem store is suitable for local testing but is not durable on ordinary Render storage. External customer media also needs private access, encryption, deletion lifecycle, authorized retrieval, credentials, monitoring, and cost control.

**Realistic options:**

1. Keep Gate A local/owner-only and disable external photo uploads.
2. Configure a Render persistent disk at the evidence root, with private retrieval/access controls and tested backup/deletion behavior.
3. Use a private object store with encryption, least-privilege credentials, signed/authorized retrieval, lifecycle deletion, auditability, and cost limits.
4. Run an external text-only beta while deferring production media storage.

**Recommended reversible beta default:** Option 1 for Gate A and option 4 for any otherwise-approved early external test. For external photo evidence, evaluate private object storage as the preferred scalable direction from the implementation report, but do not select a vendor, provision credentials, or incur spend without owner approval. A persistent disk may be simpler but still requires private access and deletion validation.

**Risks and tradeoffs:** Local/ephemeral storage risks loss and must not be called durable. Persistent disks may be operationally simple but can couple data to one service and do not by themselves provide authorization. Object storage improves lifecycle/access options but adds vendor, credential, egress, and implementation complexity. Lowest price is not sufficient if deletion or access controls are weak.

**Exact owner approval required:** Select storage architecture/provider/region; approve monthly and per-case spending ceiling, billing owner, credentials owner, encryption/access model, retrieval authorization, retention/lifecycle rules, backup expectation, incident monitoring, deletion verification, migration/exit plan, and the date external uploads may begin. This packet makes no infrastructure-spend or credential decision.

**Blocks:** Does not block owner-only Gate A with controlled local media; blocks external photo testers and payment for photo-bearing cases; blocks launch if media is offered.

**Evidence to justify change:** Cost estimate and actual usage, successful upload/restart/retrieve/authorization/deletion tests, cross-user denial tests, credential rotation test, lifecycle proof, failure recovery, monitoring evidence, provider terms, and an owner-approved threat/privacy review.

**Owner decision:** Storage/maximum spend selected: ___; credential/billing owner: ___; approval/conditions/date: ___

## Decision 7: Owner-Operated Gate A Entry, Script, Evidence Log, and Exit

**Why needed:** Gate A proves controls with owner identities before exposing another person. A passing page or successful upload alone does not prove routing, review, recipient, deletion, rollback, or safety behavior.

**Realistic options:**

1. Run Gate A with text plus controlled non-sensitive photos in a local/owner-only environment.
2. Run text-only Gate A and defer the media subtest.
3. Delay Gate A until a production-like private environment exists.

**Recommended reversible beta default:** Option 1 if the owner can guarantee controlled media and recipient isolation; otherwise option 2. Neither option authorizes external media.

**Entry criteria:**

- Owner-approved narrow offer, owner-only cap, reviewer/scope, safety triggers, test data rule, evidence-log location, recipients, and rollback owner/value.
- Relevant route(s), raw intake, draft/final separation, `approved_to_send` gate, support log, and outcome link are available for testing.
- Mock content is visibly labeled and cannot be approved or sent as a real report.
- For the media subtest, the represented count/type/size/signature controls and `uploaded_not_analyzed` state are available in the environment under test; storage limitations are recorded.

**Test script:**

1. Create an owner-owned eligible case with one vehicle/concern and safe synthetic or owner-controlled evidence.
2. Confirm exactly one correct route/record, stable case ID, original intake, evidence attachment IDs/manifest when applicable, and no sibling/mixed record.
3. Confirm accepted photo bytes have controlled IDs/extensions and `uploaded_not_analyzed`; confirm no copy says the images were inspected or analyzed by AI.
4. Attempt unsupported/renamed content, MIME/signature mismatch, oversize/count breach, and unsafe case ID behavior where the represented implementation supports those tests; require rejection and no false success/orphan record.
5. Create an ordinary draft; verify facts/claims/observations/inferences remain distinct and unreviewed content cannot send.
6. Complete human review, record reviewer/timestamp/final version, and allow delivery only from `approved_to_send`.
7. Recheck the owner-controlled recipient and verify delivered content/version.
8. Run a critical-risk fixture; require no normal report, `needs_human_review` or `do_not_send`, approved redirection, and no customer send.
9. Run correction/versioning, support logging, outcome follow-up, consent/opt-out, and deletion/cleanup exercises appropriate to the approved test data.
10. Run a rollback exercise; preserve run IDs, screenshots, record references, timestamps, recipient evidence, storage/deletion evidence, and issues.

**Evidence log minimum:** Commit/build/environment identifier; test data classification; case/report/evidence IDs; route/run and raw-record references; attachment acceptance/rejection and analysis status; reviewer and status transitions; final version and recipient proof; delivery/turnaround; correction; deletion; high-risk block; rollback; issue IDs; PASS/FAIL owner decision.

**Exit criteria:** One eligible happy path and one high-risk path pass; correction/deletion/opt-out and rollback are demonstrated; no wrong recipient, mixed record, review bypass, mock send, false media-analysis statement, false persistence statement, or open critical/high issue exists; evidence is linked and the owner signs Gate A PASS. Media Gate A does not authorize external media without decisions 5 and 6.

**Risks and tradeoffs:** A local test proves code-path behavior but not production durability or access control. A text-only test leaves media readiness unproven. Passing Gate A proves only the tested environment/version.

**Exact owner approval required:** Approve entry conditions, selected option, exact environment/build, test identities/data, script, evidence-log location, reviewer, rollback owner, exit criteria, deviations, and final `PASS`/`FAIL`.

**Blocks:** Directly blocks Gate A and external testers. Payment remains blocked until all paid-test decisions/gates pass. Launch remains blocked.

**Evidence to justify change:** Linked run evidence showing a requirement is obsolete, newly implemented, or insufficient; incident/retest results; and version-specific regression tests. Any script reduction requires proof the omitted control is covered elsewhere.

**Owner decision:** Gate A option/environment/script approved: ___; evidence-log location: ___; final decision/date: ___

## Decision 8: Support, Complaints, Corrections, and Refund Ownership

**Why needed:** Customers may report safety changes, confusion, wrong records, privacy issues, duplicate charges, dissatisfaction, or harm. Support must not improvise technical conclusions, alter original reports, or promise emergency monitoring.

**Realistic options:**

1. Owner handles all support, corrections, complaints, and refunds during the first five paid cases.
2. A named support operator handles administrative issues while reviewer/owner retains safety, report, privacy, and refund authority.
3. Delay paid testing until coverage and escalation are available.

**Recommended reversible beta default:** Option 1 with one monitored channel during explicitly stated business hours, ordinary acknowledgement within one business day, immediate conservative triage when safety messages are seen, and no promise of continuous monitoring. Preserve original reports; issue versioned corrections after repeat review. New symptoms/new concerns become a new screened case.

**Risks and tradeoffs:** One owner provides consistency but creates availability risk. Delegation improves coverage but expands sensitive-data access and may blur decision authority. Fast responses can be mistaken for emergency service unless boundaries are prominent.

**Exact owner approval required:** Name channel(s), hours, acknowledgement target, after-hours language, support owner/backup, complaint escalation, correction eligibility/window, versioning rule, refund authority/limits, payment/provider process, privacy/safety/incident escalation, record location, and customer wording.

**Blocks:** Gate A until support/correction/refund exercises have an owner; external testers until support coverage is stated; payment until complaints/refunds/payment disputes have approved ownership; launch remains blocked.

**Evidence to justify change:** Message volume/category, acknowledgement/resolution times, escalations, corrections, refunds, complaints, customer comprehension, access audits, and missed coverage. Delegate only after scripts, permissions, and escalation tests pass.

**Owner decision:** Support/refund ownership and targets selected: ___; approval/conditions/date: ___

## Decision 9: Go/No-Go Metrics for External Paid Testers

**Why needed:** Payment creates a service obligation. Expansion must depend on linked evidence, not enthusiasm, a successful demo, or unverified demand.

**Realistic options:**

1. Require every safety/control metric and all paid-readiness prerequisites, with no exceptions.
2. Permit written containment for a non-safety service/commercial miss and repeat the unpaid stage.
3. Set stricter owner thresholds before any payment.

**Recommended reversible beta default:** Combine options 1 and 2: all safety/control and prerequisite gates are absolute; a service/commercial miss results in `NO-GO` or repeat testing, never weakened safety. Before five paid testers, require at least three completed eligible trusted-tester cases, exact case traceability, appropriate privacy/consent/retention approval, production-durable private storage if external photos are accepted, reviewer/payment/support ownership, successful payment/refund/duplicate/correction/deletion/rollback exercises, and a written `PAID TEST / GO` decision.

Absolute measures: zero wrong recipients, mixed records, review bypasses, mock sends, false payment confirmations, false AI-image-analysis claims, false durability claims, confirmed-diagnosis/safety-clearance/guarantee claims, or uncontained critical incidents; 100% human approval/final-version traceability; 100% high/critical cases blocked or escalated; and 100% recorded consent plus verified payment before paid fulfillment.

Proposed directional service measures for the first five paid cases: at least 4/5 on-time reports, 4/5 customers able to state a next action and interpret confidence as uncertainty, first follow-up attempted for 4/5 with at least three meaningful updates, median owner fulfillment at or below 60 minutes, no unresolved capacity breach, no more than one refund with none tied to harm/privacy/misleading scope/systematic failure, and at least 3/5 rating value about or above the tested price. These are beta thresholds, not market claims.

**Risks and tradeoffs:** Absolute controls slow launch but limit unacceptable exposure. Small denominators are volatile and can mislead. Commercial success cannot offset a safety/privacy failure; a refund rate alone cannot distinguish generous policy from poor quality.

**Exact owner approval required:** Approve prerequisites, absolute stop metrics, directional thresholds, denominator/exclusion rules, evidence reviewer, decision date, allowed containment/retest path, cohort cap, and who signs `GO` or `NO-GO`.

**Blocks:** Does not prevent owner-only Gate A; directly blocks paid external testers and payment; launch remains blocked and requires a separate review.

**Evidence to justify change:** Complete case index linking consent, payment, intake, evidence status, draft/review/final, recipient, time, support/refund, interview, outcome, issues, and incidents. Change thresholds only with a written rationale based on observed cases or qualified review, never by silently excluding failures.

**Owner decision:** Metrics and decision authority selected: ___; approval/conditions/date: ___

## Decision 10: Claims Drivable Must Not Make During Beta

**Why needed:** Customer trust depends on distinguishing submitted claims, observations, model inference, reviewer conclusions, and verified facts. Remote evidence and human review do not make Drivable an inspection, certification, diagnosis, or emergency service.

**Realistic options:**

1. Use the repository's strict prohibited-claims list across recruiting, intake, reports, support, refunds, and follow-up.
2. Add stricter beta-specific prohibitions for any capability not proven in the deployed environment.
3. Allow a claim only after narrowly scoped independent evidence, owner approval, and any appropriate qualified review supports the exact wording; never generalize it.

**Recommended reversible beta default:** Apply options 1 and 2. Prohibit statements or implications that:

- Drivable confirms or guarantees a diagnosis, cause, repair, price, savings, reliability, condition, outcome, sale, buyer, purchase, title, ownership, mileage, seller honesty, mechanic quality, or legal result.
- A vehicle is safe to drive, has no risk, should be driven/towed, does not need inspection, or does not need a mechanic/emergency/roadside service.
- Drivable inspects, certifies, approves, warrants, replaces a mechanic, provides a pre-purchase inspection, or provides emergency dispatch/continuous safety monitoring.
- A seller/customer statement is a fact without appropriate independent verification, or absence of contradictory evidence is verification.
- NHTSA context is VIN-specific applicability or proof of the case-specific cause/condition.
- Uploaded images have been viewed, understood, inspected, or analyzed by AI. The represented status is `uploaded_not_analyzed`.
- Runtime/ordinary Render filesystem media is production-durable, or external media is private/authorized/deletable unless the deployed system has passed those exact controls.
- The system automatically learns from every stored case or that collected data has already improved accuracy.
- Mock output is a real report or may receive `approved_to_send`.
- Human review certifies condition, guarantees diagnosis, or substitutes for hands-on testing.

Approved patterns remain bounded: “possible causes,” “based on the information provided,” “confidence is limited because,” “missing evidence,” “next useful checks,” and “qualified in-person inspection/help is recommended.”

**Risks and tradeoffs:** Strict language may reduce marketing punch and conversion, but looser claims create reliance and mismatch actual implementation. Disclaimers do not cure a contradictory headline, CTA, report conclusion, or support message.

**Exact owner approval required:** Approve the prohibited/approved language set, every customer-facing template/version, review owner, pre-send check, incident treatment for a prohibited claim, correction/notification rule, and who may approve any future exception after evidence and appropriate review.

**Blocks:** Gate A until mock and prohibited-claim checks are in the script; external testers and payment until customer language is approved; any prohibited or unproven claim blocks launch.

**Evidence to justify change:** Deployed capability tests, provenance and audit records, independent verification within a named scope/date, customer comprehension testing, incident/complaint evidence, and qualified review. Marketing preference alone is insufficient.

**Owner decision:** Claims policy/templates selected: ___; approval/conditions/date: ___

## Unresolved Owner Decision Register

Every row remains unresolved until the owner supplies the approval described above.

| # | Decision | Owner selection | Approver/date | Gate effect if blank |
|---:|---|---|---|---|
| 1 | Cohort and concurrency |  |  | Gate A, external testers, payment |
| 2 | Price, deliverable, refunds |  |  | Payment, paid testers |
| 3 | Reviewer qualifications/coverage |  |  | Gate A, external testers, payment |
| 4 | Safety refusal/redirection |  |  | Gate A, external testers, payment |
| 5 | Consent/privacy/retention/deletion |  |  | External testers/media, payment, launch |
| 6 | Durable private media storage/cost |  |  | External media, paid media cases, launch |
| 7 | Gate A script/evidence/exit |  |  | Gate A and all later stages |
| 8 | Support/correction/refund ownership |  |  | Gate A exercise, external testers, payment |
| 9 | Paid go/no-go metrics |  |  | Payment and paid testers |
| 10 | Prohibited claims/templates |  |  | Gate A, external testers, payment, launch |

## Owner Decision Rule

If an approval is blank, ambiguous, expired, contradicted by the deployed behavior, or unsupported by the required evidence, the affected gate is `NO-GO`. Choosing a default in this packet requires an affirmative owner record; silence is not consent.
