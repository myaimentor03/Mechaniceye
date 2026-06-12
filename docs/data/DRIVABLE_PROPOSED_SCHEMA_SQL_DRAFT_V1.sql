-- DRAFT ONLY
-- DO NOT RUN AGAINST PRODUCTION
-- REVIEW BEFORE MIGRATION
-- SEED KNOWLEDGE MUST REMAIN SEPARATE FROM CUSTOMER OUTCOMES
--
-- PostgreSQL-compatible planning draft. Constraints, enums, deletion rules,
-- identity separation, access control, and migration order require review.

CREATE TABLE drivable_seed_symptom_categories (
  symptom_category_id text NOT NULL,
  dataset_version text NOT NULL,
  label text NOT NULL,
  plain_english_description text NOT NULL,
  possible_risk_level text NOT NULL,
  recommended_initial_path text NOT NULL,
  safety_note text NOT NULL,
  content jsonb NOT NULL,
  source_file text NOT NULL,
  source_row integer NOT NULL,
  import_batch_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symptom_category_id, dataset_version)
);
CREATE INDEX drivable_seed_symptoms_active_risk_idx
  ON drivable_seed_symptom_categories (is_active, dataset_version, possible_risk_level);

CREATE TABLE drivable_seed_evidence_items (
  evidence_id text NOT NULL,
  dataset_version text NOT NULL,
  label text NOT NULL,
  evidence_type text NOT NULL,
  priority text NOT NULL,
  safe_capture_instructions text NOT NULL,
  unsafe_capture_warning text NOT NULL,
  content jsonb NOT NULL,
  source_file text NOT NULL,
  source_row integer NOT NULL,
  import_batch_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evidence_id, dataset_version)
);
CREATE INDEX drivable_seed_evidence_type_priority_idx
  ON drivable_seed_evidence_items (is_active, dataset_version, evidence_type, priority);

CREATE TABLE drivable_seed_roadside_risk_triggers (
  trigger_id text NOT NULL,
  dataset_version text NOT NULL,
  label text NOT NULL,
  risk_level text NOT NULL,
  recommended_action text NOT NULL,
  stop_now boolean NOT NULL,
  human_review_required boolean NOT NULL,
  tow_likely boolean NOT NULL,
  safe_customer_message text NOT NULL,
  unsafe_phrasing_to_avoid text NOT NULL,
  content jsonb NOT NULL,
  source_file text NOT NULL,
  source_row integer NOT NULL,
  import_batch_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trigger_id, dataset_version)
);
CREATE INDEX drivable_seed_roadside_action_idx
  ON drivable_seed_roadside_risk_triggers
  (is_active, dataset_version, risk_level, recommended_action, stop_now);

CREATE TABLE drivable_seed_decision_paths (
  decision_path_id text NOT NULL,
  dataset_version text NOT NULL,
  label text NOT NULL,
  plain_english_meaning text NOT NULL,
  when_to_use text NOT NULL,
  safety_boundaries text NOT NULL,
  human_review_recommended boolean NOT NULL,
  content jsonb NOT NULL,
  source_file text NOT NULL,
  source_row integer NOT NULL,
  import_batch_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (decision_path_id, dataset_version)
);
CREATE INDEX drivable_seed_decision_paths_active_idx
  ON drivable_seed_decision_paths (is_active, dataset_version);

CREATE TABLE drivable_seed_follow_up_questions (
  question_id text NOT NULL,
  dataset_version text NOT NULL,
  symptom_category_id text NOT NULL,
  question_text text NOT NULL,
  why_it_matters text NOT NULL,
  safety_warning text NOT NULL,
  priority text NOT NULL,
  answer_type text NOT NULL,
  content jsonb NOT NULL,
  source_file text NOT NULL,
  source_row integer NOT NULL,
  import_batch_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, dataset_version)
);
CREATE INDEX drivable_seed_questions_category_priority_idx
  ON drivable_seed_follow_up_questions
  (is_active, dataset_version, symptom_category_id, priority);

CREATE TABLE drivable_seed_repair_vs_sell_factors (
  factor_id text NOT NULL,
  dataset_version text NOT NULL,
  label text NOT NULL,
  plain_english_meaning text NOT NULL,
  pushes_toward_repair text NOT NULL,
  pushes_toward_sell text NOT NULL,
  risk_note text NOT NULL,
  content jsonb NOT NULL,
  source_file text NOT NULL,
  source_row integer NOT NULL,
  import_batch_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factor_id, dataset_version)
);
CREATE INDEX drivable_seed_repair_sell_active_idx
  ON drivable_seed_repair_vs_sell_factors (is_active, dataset_version);

CREATE TABLE drivable_seed_buyer_risk_flags (
  flag_id text NOT NULL,
  dataset_version text NOT NULL,
  label text NOT NULL,
  why_it_matters text NOT NULL,
  evidence_to_request text NOT NULL,
  risk_level text NOT NULL,
  walk_away_signal text NOT NULL,
  customer_safe_advice text NOT NULL,
  content jsonb NOT NULL,
  source_file text NOT NULL,
  source_row integer NOT NULL,
  import_batch_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flag_id, dataset_version)
);
CREATE INDEX drivable_seed_buyer_flags_risk_idx
  ON drivable_seed_buyer_risk_flags (is_active, dataset_version, risk_level);

CREATE TABLE drivable_seed_seller_disclosures (
  disclosure_id text NOT NULL,
  dataset_version text NOT NULL,
  issue_type text NOT NULL,
  plain_english_disclosure_prompt text NOT NULL,
  buyer_concern text NOT NULL,
  listing_language_suggestion text NOT NULL,
  safety_or_legal_note text NOT NULL,
  content jsonb NOT NULL,
  source_file text NOT NULL,
  source_row integer NOT NULL,
  import_batch_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (disclosure_id, dataset_version)
);
CREATE INDEX drivable_seed_seller_disclosures_issue_idx
  ON drivable_seed_seller_disclosures (is_active, dataset_version, issue_type);

CREATE TABLE drivable_customer_cases (
  case_id text PRIMARY KEY,
  intake_type text NOT NULL,
  source text NOT NULL,
  customer_reference text,
  vehicle jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_intake jsonb NOT NULL,
  normalized_symptom_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_level text,
  customer_goal text,
  report_status text NOT NULL DEFAULT 'intake_received',
  consent_reference text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivable_customer_cases_status_submitted_idx
  ON drivable_customer_cases (report_status, submitted_at);
CREATE INDEX drivable_customer_cases_customer_ref_idx
  ON drivable_customer_cases (customer_reference);

CREATE TABLE drivable_customer_media (
  media_id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES drivable_customer_cases(case_id),
  source_type text NOT NULL,
  modality text NOT NULL,
  storage_reference text NOT NULL,
  original_file_name text,
  consent_status text NOT NULL,
  license_status text,
  capture_context text,
  safety_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  label_confidence numeric(5,4),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivable_customer_media_case_idx ON drivable_customer_media (case_id);
CREATE INDEX drivable_customer_media_consent_modality_idx
  ON drivable_customer_media (consent_status, modality);

CREATE TABLE drivable_ai_report_drafts (
  draft_id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES drivable_customer_cases(case_id),
  model_provider text,
  model_name text NOT NULL,
  prompt_version text NOT NULL,
  seed_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_snapshot jsonb NOT NULL,
  draft_content jsonb NOT NULL,
  confidence numeric(5,4),
  safety_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  generation_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivable_ai_drafts_case_created_idx
  ON drivable_ai_report_drafts (case_id, created_at);
CREATE INDEX drivable_ai_drafts_safety_status_idx
  ON drivable_ai_report_drafts (generation_status);

CREATE TABLE drivable_human_reviews (
  review_id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES drivable_customer_cases(case_id),
  draft_id text REFERENCES drivable_ai_report_drafts(draft_id),
  reviewer_reference text NOT NULL,
  decision text NOT NULL,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text,
  edited_content jsonb,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivable_human_reviews_case_idx
  ON drivable_human_reviews (case_id, reviewed_at);
CREATE INDEX drivable_human_reviews_draft_idx ON drivable_human_reviews (draft_id);

CREATE TABLE drivable_customer_ready_reports (
  report_id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES drivable_customer_cases(case_id),
  approved_review_id text NOT NULL REFERENCES drivable_human_reviews(review_id),
  report_status text NOT NULL,
  customer_content jsonb NOT NULL,
  confidence_and_limitations text NOT NULL,
  safety_language text NOT NULL,
  content_hash text NOT NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_hash)
);
CREATE INDEX drivable_ready_reports_case_status_idx
  ON drivable_customer_ready_reports (case_id, report_status);
CREATE INDEX drivable_ready_reports_sent_idx ON drivable_customer_ready_reports (sent_at);

CREATE TABLE drivable_customer_outcomes (
  outcome_id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES drivable_customer_cases(case_id),
  report_id text REFERENCES drivable_customer_ready_reports(report_id),
  customer_action_taken text,
  vehicle_driven_after_advice text,
  tow_used text,
  shop_inspected text,
  did_advice_help text,
  customer_notes text,
  source_type text NOT NULL,
  verification_level text NOT NULL,
  outcome_status text NOT NULL,
  consent_reference text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivable_customer_outcomes_case_idx
  ON drivable_customer_outcomes (case_id, captured_at);
CREATE INDEX drivable_customer_outcomes_report_idx
  ON drivable_customer_outcomes (report_id);

CREATE TABLE drivable_repair_outcomes (
  repair_outcome_id text PRIMARY KEY,
  outcome_id text NOT NULL REFERENCES drivable_customer_outcomes(outcome_id),
  actual_cause text,
  actual_repair_performed text,
  amount numeric(12,2),
  amount_type text,
  currency text,
  evidence_source text,
  verification_level text NOT NULL,
  supporting_reference text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivable_repair_outcomes_outcome_idx
  ON drivable_repair_outcomes (outcome_id);
CREATE INDEX drivable_repair_outcomes_verification_idx
  ON drivable_repair_outcomes (verification_level, confirmed_at);

CREATE TABLE drivable_buyer_outcomes (
  buyer_outcome_id text PRIMARY KEY,
  outcome_id text NOT NULL REFERENCES drivable_customer_outcomes(outcome_id),
  listing_reference text,
  vehicle_reference text,
  inspected boolean,
  negotiated boolean,
  purchased boolean,
  walked_away boolean,
  title_result text,
  final_decision text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivable_buyer_outcomes_outcome_idx
  ON drivable_buyer_outcomes (outcome_id);
CREATE INDEX drivable_buyer_outcomes_decision_idx
  ON drivable_buyer_outcomes (final_decision);

CREATE TABLE drivable_seller_outcomes (
  seller_outcome_id text PRIMARY KEY,
  outcome_id text NOT NULL REFERENCES drivable_customer_outcomes(outcome_id),
  listing_reference text,
  disclosed_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  publication_status text,
  inquiry_count integer,
  sold boolean,
  removed boolean,
  sale_amount numeric(12,2),
  currency text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drivable_seller_outcomes_outcome_idx
  ON drivable_seller_outcomes (outcome_id);
CREATE INDEX drivable_seller_outcomes_listing_status_idx
  ON drivable_seller_outcomes (listing_reference, publication_status);
