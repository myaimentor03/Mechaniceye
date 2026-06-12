# Drivable Seed Data Table Mapping V1

## Purpose

Propose future table boundaries for static seed knowledge and real customer workflow data. Names are planning names only; this document does not create a schema or migration.

## Seed Knowledge Tables

| Source file | Proposed table | Primary key | Important columns | Customer-visible | Internal-only | Safe for AI prompt context | Requires human review | Notes |
|---|---|---|---|---|---|---|---|---|
| `symptom_categories_seed_v1.json` | `drivable_seed_symptom_categories` | `symptomCategoryId` | label, description, phrases, evidence needs, risk, path, safety note | No | Yes | Yes, bounded | Yes | Classification aid, not diagnosis |
| `evidence_items_seed_v1.json` | `drivable_seed_evidence_items` | `evidenceId` | type, category links, safe instructions, unsafe warning, priority, prompt | No | Yes | Yes, bounded | Yes | Never request unsafe evidence capture |
| `roadside_risk_triggers_seed_v1.json` | `drivable_seed_roadside_risk_triggers` | `triggerId` | examples, risk level, action, stop-now, human review, tow, safe/unsafe wording | No | Yes | No by default | Yes | Safety-critical; requires explicit approval |
| `decision_paths_seed_v1.json` | `drivable_seed_decision_paths` | `decisionPathId` | meaning, when to use, customer recommendation, boundaries, review, next info, statuses | No | Yes | Yes, bounded | Yes | Possible next moves, never safety clearance |
| `follow_up_questions_seed_v1.json` | `drivable_seed_follow_up_questions` | `questionId` | symptom category ID, question, rationale, evidence, warning, priority, answer type | No | Yes | Yes, bounded | Yes | Category reference must resolve |
| `repair_vs_sell_factors_seed_v1.json` | `drivable_seed_repair_vs_sell_factors` | `factorId` | meaning, repair/sell influence, information needed, risk note, customer question | No | Yes | Yes, bounded | Yes | No price, value, or outcome guarantee |
| `buyer_risk_flags_seed_v1.json` | `drivable_seed_buyer_risk_flags` | `flagId` | seller phrases, rationale, evidence, risk, walk-away signal, safe advice | No | Yes | Yes, bounded | Yes | Remote screen, not inspection or title verification |
| `seller_disclosure_seed_v1.json` | `drivable_seed_seller_disclosure_prompts` | `disclosureId` | issue type, disclosure prompt, buyer concern, evidence, listing language, legal note | No | Yes | No by default | Yes | Not legal advice; jurisdiction and facts matter |

`customerVisible: No` means the raw seed row should not be shown directly. Reviewed excerpts may support customer-ready language.

## Future Real-Data Tables

| Source flow | Proposed table | Primary key | Important columns | Customer-visible | Internal-only | Safe for AI prompt context | Requires human review | Notes |
|---|---|---|---|---|---|---|---|---|
| Customer intake / Make diagnosis route | `drivable_customer_cases` | `caseId` | intakeType, submittedAt, vehicle, symptoms, warningLights, riskSignals, goal, contact reference, raw intake reference, status | Selected fields | No | Yes, minimized | Risk-based | Preserve original text and source |
| Customer upload / internal test / approved dataset | `drivable_case_media` | `mediaId` | caseId, sourceType, modality, storage reference, consent/license, capture context, labels, confidence | Selected items | No | Only with consent and minimization | Yes for risky interpretation | Store binaries outside relational rows where appropriate |
| AI generation flow | `drivable_ai_drafts` | `draftId` | caseId, model/version, prompt version, seed versions, draft, possible causes, confidence, safety flags, createdAt | No | Yes | No as facts | Yes | Immutable draft history |
| Internal review workflow | `drivable_human_review_decisions` | `reviewDecisionId` | caseId, draftId, reviewerId, decision, edits, risk flags, rationale, reviewedAt | No | Yes | Yes as reviewed context | Yes | Append-only audit history preferred |
| Approved fulfillment flow | `drivable_customer_ready_reports` | `reportId` | caseId, approved draft/review ID, recommendation, confidence, limitations, status, approvedAt, sentAt | Yes | No | Yes as historical delivered context | Yes before send | Preserve exact delivered version |
| Follow-up / outcome capture | `drivable_customer_outcomes` | `outcomeId` | caseId, reportId, action, drove/tow/shop values, help rating, notes, source, status, follow-up date | Customer-submitted fields | No | Only after quality filtering | Yes for learning use | Customer report is not automatic confirmation |
| Repair order / inspection / customer follow-up | `drivable_repair_outcomes` | `repairOutcomeId` | outcomeId, actual cause, repair, cost, currency, evidence source, verification level, confirmedAt | Selected summary | No | Only verified/minimized | Yes | Separate estimate from paid amount |
| Buyer follow-up | `drivable_buyer_outcomes` | `buyerOutcomeId` | outcomeId, listing/vehicle reference, inspected, negotiated, purchased, walked away, title/result, notes | Selected summary | No | Only quality-filtered | Yes | Do not infer legitimacy or title status |
| Seller/listing follow-up | `drivable_seller_listing_outcomes` | `sellerOutcomeId` | outcomeId, listingId, disclosed issues, published, inquiries, sold/removed, sale amount if consented, notes | Selected listing facts | No | Only quality-filtered | Yes | Legal/privacy review required |

## Separation Rules

- Seed tables contain versioned reference knowledge only.
- Real-data tables contain event records with consent, provenance, timestamps, and access controls.
- Link records through stable IDs; never merge customer identity into seed rows.
- Preserve AI drafts, reviewer decisions, and delivered reports as separate versions.
- Mark outcomes as customer-reported, reviewer-confirmed, document-supported, or unknown.
- Only approved, minimized records may enter evaluation or future AI context.
