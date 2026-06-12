# Drivable Proposed DB Schema V1

## Status and Principles

This is a proposed PostgreSQL data model. It does not modify the live Drizzle schema and does not authorize a migration.

Design principles:

- Seed knowledge is versioned reference data, never customer evidence or an outcome.
- Raw customer statements remain distinct from normalized labels and AI interpretation.
- AI drafts, human decisions, delivered reports, and later outcomes remain separate immutable records.
- Customer-visible content must come from an approved report, not a raw seed row or draft.
- Sensitive identity, contact, media, title, cost, and location data require minimization and access control.
- High-risk safety, structural, title, legal-adjacent, or high-cost guidance requires human review.

## Shared Conventions

- Proposed primary keys are text so existing stable IDs can be retained; generated operational IDs may use UUID text.
- All tables include `created_at`; mutable reference tables also include `updated_at`.
- Seed tables include `dataset_version`, `import_batch_id`, `source_file`, `source_row`, `is_active`, and a JSONB `content` snapshot.
- Operational records include provenance, status, and timestamps.
- Controlled values should become reviewed enums or check constraints before migration.
- Foreign keys should default to restrictive deletion. Customer deletion/anonymization behavior requires a separate privacy design.

## Seed Knowledge Tables

### `drivable_seed_symptom_categories`

- **Purpose:** Versioned symptom taxonomy for intake normalization and safe question selection.
- **Primary key:** `symptom_category_id` plus `dataset_version` uniqueness.
- **Important columns:** label, plain-English description, customer phrases, evidence needs, risk level, high-risk signals, roadside modes, initial path, review recommendation, safety note, content.
- **Source:** `symptom_categories_seed_v1.json`.
- **Classification:** Seed.
- **Customer-visible:** No; only reviewed derived language may appear.
- **AI-context-safe:** Yes, bounded and version-pinned.
- **Human-review-required:** Yes before customer guidance or taxonomy promotion.
- **Suggested indexes:** active/version, risk level, initial path; optional search index after review.
- **Safety/privacy:** Contains no customer data and never confirms a diagnosis.

### `drivable_seed_evidence_items`

- **Purpose:** Defines evidence types and safe/unsafe capture language.
- **Primary key:** `evidence_id` plus `dataset_version` uniqueness.
- **Important columns:** label, description, evidence type, category links, safe instructions, unsafe warning, priority, customer prompt, content.
- **Source:** `evidence_items_seed_v1.json`.
- **Classification:** Seed.
- **Customer-visible:** No raw rows; reviewed prompts may be used.
- **AI-context-safe:** Yes, bounded.
- **Human-review-required:** Yes for capture instructions and risky cases.
- **Suggested indexes:** active/version, evidence type, priority.
- **Safety/privacy:** Never ask customers to drive, enter traffic, approach hazards, or expose private documents unnecessarily.

### `drivable_seed_roadside_risk_triggers`

- **Purpose:** Safety-critical trigger vocabulary and escalation defaults.
- **Primary key:** `trigger_id` plus `dataset_version` uniqueness.
- **Important columns:** label, phrase examples, risk level, recommended action, stop-now, human-review-required, tow-likely, safe message, prohibited phrasing, content.
- **Source:** `roadside_risk_triggers_seed_v1.json`.
- **Classification:** Seed.
- **Customer-visible:** No raw rows.
- **AI-context-safe:** No by default.
- **Human-review-required:** Yes.
- **Suggested indexes:** active/version, risk level, recommended action, stop-now.
- **Safety/privacy:** Must not grant driving clearance or auto-send high-risk guidance.

### `drivable_seed_decision_paths`

- **Purpose:** Defines possible next actions and their boundaries.
- **Primary key:** `decision_path_id` plus `dataset_version` uniqueness.
- **Important columns:** label, meaning, when to use, customer recommendation, safety boundaries, review recommendation, next information, related statuses, content.
- **Source:** `decision_paths_seed_v1.json`.
- **Classification:** Seed.
- **Customer-visible:** No raw rows.
- **AI-context-safe:** Yes, bounded.
- **Human-review-required:** Yes for customer use, especially roadside paths.
- **Suggested indexes:** active/version and related status/path label.
- **Safety/privacy:** A path is not a diagnosis, guarantee, or clearance to drive.

### `drivable_seed_follow_up_questions`

- **Purpose:** Versioned clarification questions linked to symptom categories.
- **Primary key:** `question_id` plus `dataset_version` uniqueness.
- **Important columns:** symptom category ID, question, rationale, requested evidence, warning, priority, answer type, content.
- **Source:** `follow_up_questions_seed_v1.json`.
- **Classification:** Seed.
- **Customer-visible:** No raw rows; reviewed questions may be presented.
- **AI-context-safe:** Yes, bounded.
- **Human-review-required:** Yes before production question selection rules.
- **Suggested indexes:** active/version, symptom category, priority, answer type.
- **Safety/privacy:** Questions must allow unknown/skip and must not solicit unsafe evidence.

### `drivable_seed_repair_vs_sell_factors`

- **Purpose:** Structures factors for repair-versus-sell discussion.
- **Primary key:** `factor_id` plus `dataset_version` uniqueness.
- **Important columns:** label, meaning, repair influence, sell influence, information needed, risk note, customer question, content.
- **Source:** `repair_vs_sell_factors_seed_v1.json`.
- **Classification:** Seed.
- **Customer-visible:** No raw rows.
- **AI-context-safe:** Yes, bounded.
- **Human-review-required:** Yes for high-cost, title, structural, or safety decisions.
- **Suggested indexes:** active/version and label.
- **Safety/privacy:** No guaranteed value, cost, legality, or outcome.

### `drivable_seed_buyer_risk_flags`

- **Purpose:** Remote buyer-screening flags and evidence prompts.
- **Primary key:** `flag_id` plus `dataset_version` uniqueness.
- **Important columns:** label, seller phrases, rationale, evidence request, risk level, walk-away signal, safe advice, content.
- **Source:** `buyer_risk_flags_seed_v1.json`.
- **Classification:** Seed.
- **Customer-visible:** No raw rows.
- **AI-context-safe:** Yes, bounded.
- **Human-review-required:** Yes for title, fraud, structural, or high-risk interpretation.
- **Suggested indexes:** active/version and risk level.
- **Safety/privacy:** Seller claims remain unverified; avoid storing identity documents in seed or prompt context.

### `drivable_seed_seller_disclosures`

- **Purpose:** Seller disclosure prompts and cautious listing-language support.
- **Primary key:** `disclosure_id` plus `dataset_version` uniqueness.
- **Important columns:** issue type, disclosure prompt, buyer concern, helpful evidence, listing language, safety/legal note, content.
- **Source:** `seller_disclosure_seed_v1.json`; the manifest currently proposes the longer table name `drivable_seed_seller_disclosure_prompts`, which must be reconciled before migration.
- **Classification:** Seed.
- **Customer-visible:** No raw rows.
- **AI-context-safe:** No by default.
- **Human-review-required:** Yes.
- **Suggested indexes:** active/version and issue type.
- **Safety/privacy:** Not legal advice; jurisdiction, title facts, and actual condition require verification.

## Customer Flow Tables

### `drivable_customer_cases`

- **Purpose:** Canonical Drivable intake and workflow record.
- **Primary key:** `case_id`.
- **Important columns:** intake type, source, customer reference, vehicle JSON, raw intake JSON, normalized symptom IDs, risk signals, goal, report status, consent reference, submitted/created/updated timestamps.
- **Source:** Customer intake, approved imports, or internal tests.
- **Classification:** Customer.
- **Customer-visible:** Selected submitted fields and status.
- **AI-context-safe:** Yes only after minimization and consent controls.
- **Human-review-required:** Risk-based; mandatory for high-risk output.
- **Suggested indexes:** submitted date, status, intake type, customer reference, risk level.
- **Safety/privacy:** Keep contact/identity references restricted; preserve raw wording and do not overwrite with AI labels.

### `drivable_customer_media`

- **Purpose:** Metadata and protected storage references for case evidence.
- **Primary key:** `media_id`.
- **Important columns:** case ID, source type, modality, storage reference, original filename, consent/license status, capture context, safety context, labels, label confidence, timestamps.
- **Source:** Customer upload, internal test, licensed external dataset, or synthetic asset.
- **Classification:** Customer/media.
- **Customer-visible:** Selected owned uploads.
- **AI-context-safe:** Only with consent, minimization, and supported modality policy.
- **Human-review-required:** Yes for risky interpretation or learning use.
- **Suggested indexes:** case ID, source type, modality, consent status, upload time.
- **Safety/privacy:** Private storage only; strip unnecessary location/identity metadata and support deletion.

### `drivable_ai_report_drafts`

- **Purpose:** Immutable record of generated draft content and generation context.
- **Primary key:** `draft_id`.
- **Important columns:** case ID, model/provider, prompt version, seed versions, input snapshot, draft content, confidence, safety flags, generation status, created time.
- **Source:** AI generation process.
- **Classification:** Customer/AI draft.
- **Customer-visible:** No.
- **AI-context-safe:** Not as facts; may support controlled audit/evaluation.
- **Human-review-required:** Yes before customer use.
- **Suggested indexes:** case ID, created time, model/prompt version, generation status, safety flag.
- **Safety/privacy:** Minimize PII in prompts and logs; drafts may be wrong and must never be treated as delivered advice.

### `drivable_human_reviews`

- **Purpose:** Append-only review decisions and edits for drafts/cases.
- **Primary key:** `review_id`.
- **Important columns:** case ID, draft ID, reviewer reference, decision, risk flags, rationale, edited content, reviewed time.
- **Source:** Authorized human reviewer.
- **Classification:** Customer/review.
- **Customer-visible:** No.
- **AI-context-safe:** Yes only as reviewed historical context and after minimization.
- **Human-review-required:** This table records the required review.
- **Suggested indexes:** case ID, draft ID, decision, reviewer, reviewed time.
- **Safety/privacy:** Protect reviewer identity and internal notes; preserve audit history.

### `drivable_customer_ready_reports`

- **Purpose:** Exact approved report version eligible for customer delivery.
- **Primary key:** `report_id`.
- **Important columns:** case ID, approved review ID, report status, customer content, confidence/limitations, safety language, approved time, sent time, content hash.
- **Source:** Approved human review workflow.
- **Classification:** Customer/report.
- **Customer-visible:** Yes.
- **AI-context-safe:** Yes as historical delivered context, with privacy limits.
- **Human-review-required:** Yes before status can become `approved_to_send`.
- **Suggested indexes:** case ID, status, approved time, sent time, content hash.
- **Safety/privacy:** Only `approved_to_send` may be sent; immutable after delivery.

### `drivable_customer_outcomes`

- **Purpose:** General follow-up event linked to a case and report.
- **Primary key:** `outcome_id`.
- **Important columns:** case ID, report ID, action taken, drove/tow/shop values, helpfulness, customer notes, source, verification level, consent reference, captured/reviewed dates.
- **Source:** Customer follow-up, reviewer entry, or supported documents.
- **Classification:** Outcome.
- **Customer-visible:** Customer-submitted fields and selected summaries.
- **AI-context-safe:** Only after quality review and minimization.
- **Human-review-required:** Yes before learning use.
- **Suggested indexes:** case ID, report ID, captured date, verification level, outcome status.
- **Safety/privacy:** A customer report is not automatic confirmation; allow unknown and contradictory results.

### `drivable_repair_outcomes`

- **Purpose:** Repair/inspection-specific outcome details.
- **Primary key:** `repair_outcome_id`.
- **Important columns:** outcome ID, actual cause, repair performed, estimate/paid amount, currency, evidence source, verification level, shop/document reference, confirmed time.
- **Source:** Repair order, inspection, customer report, or reviewer.
- **Classification:** Outcome.
- **Customer-visible:** Selected summary.
- **AI-context-safe:** Only verified/minimized data.
- **Human-review-required:** Yes.
- **Suggested indexes:** outcome ID, verification level, confirmed time, cause code.
- **Safety/privacy:** Separate estimates from paid amounts and suspected from confirmed causes.

### `drivable_buyer_outcomes`

- **Purpose:** Records buyer decisions and later transaction/inspection facts.
- **Primary key:** `buyer_outcome_id`.
- **Important columns:** outcome ID, listing/vehicle reference, inspected, negotiated, purchased, walked away, title result, final decision, notes.
- **Source:** Buyer follow-up or reviewed evidence.
- **Classification:** Outcome.
- **Customer-visible:** Selected summary.
- **AI-context-safe:** Only quality-filtered/minimized data.
- **Human-review-required:** Yes.
- **Suggested indexes:** outcome ID, final decision, inspected, purchased, captured time.
- **Safety/privacy:** Do not infer fraud, legitimacy, title status, or seller intent without evidence.

### `drivable_seller_outcomes`

- **Purpose:** Records listing/disclosure and transaction outcomes.
- **Primary key:** `seller_outcome_id`.
- **Important columns:** outcome ID, listing reference, disclosed issues, publication status, inquiries, sold/removed, sale amount if consented, notes.
- **Source:** Seller follow-up, listing workflow, or reviewed evidence.
- **Classification:** Outcome.
- **Customer-visible:** Selected seller-owned fields.
- **AI-context-safe:** Only quality-filtered/minimized data.
- **Human-review-required:** Yes.
- **Suggested indexes:** outcome ID, listing reference, publication status, sold/removed, captured time.
- **Safety/privacy:** Legal/privacy review is required; sale amount and identity data need explicit controls.

## Relationship Summary

- One case may have many media records and AI drafts.
- One AI draft may have many human reviews.
- A customer-ready report must reference the approving review and case.
- A case/report may have multiple outcome captures over time.
- Repair, buyer, and seller outcome rows extend a general customer outcome.
- Seed IDs may be referenced in case/draft JSON or reviewed join tables, but seed rows must never contain customer IDs.

## Decisions Required Before Migration

1. Confirm the deployed schema and authoritative Drizzle config.
2. Choose identity/contact separation and deletion strategy.
3. Reconcile `drivable_seed_seller_disclosures` with the manifest's proposed table name.
4. Decide whether seed version belongs in a composite key or surrogate-row model.
5. Define enums/check constraints and foreign-key deletion behavior.
6. Define encryption, role access, audit logging, retention, and media storage.
7. Review indexes against real query plans rather than applying all suggestions blindly.
8. Approve a staged migration and rollback plan.
