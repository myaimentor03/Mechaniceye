-- Drivable core schema (production), equivalent to `drizzle-kit push` over
-- shared/schema.ts, expressed explicitly so migrations stay durable and
-- reviewable. Mirrors shared/schema.ts column-for-column, including indexes
-- and defaults. Idempotent: every statement is CREATE ... IF NOT EXISTS, so
-- this file can be reviewed and run again safely.
--
-- Ordering: app tables first, then Drivable seed/operational tables (no
-- foreign keys exist in the schema, so order across groups is inert).
-- Requires PostgreSQL 13+ for the built-in gen_random_uuid() default.
--
-- THIS MIGRATION IS NOT APPLIED BY THIS WORKTREE. The owner applies it during
-- production setup (see docs/beta/DRIVABLE_DATA_MIGRATION_AND_IMPORT_RUNBOOK_0902.md).

begin;

-- ---------------------------------------------------------------------------
-- App tables
-- ---------------------------------------------------------------------------

create table if not exists users (
  id varchar primary key default gen_random_uuid(),
  username text not null,
  password text not null,
  subscription_tier text default 'basic',
  subscription_status text default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamp default now()
);

create unique index if not exists users_username_unique on users (username);

create table if not exists diagnoses (
  id varchar primary key default gen_random_uuid(),
  user_id varchar,
  vehicle_info text,
  description text,
  timing text,
  audio_file text,
  video_file text,
  vibration_data json,
  primary_diagnosis json,
  alternative_scenarios json,
  needs_more_info boolean default false,
  additional_questions json,
  iteration_count integer default 1,
  is_resolved boolean default false,
  mechanic_consultation_id varchar,
  confidence_score integer default 0,
  confidence_level text default 'low',
  input_types json,
  created_at timestamp default now()
);

create index if not exists diagnoses_user_idx on diagnoses (user_id);
create index if not exists diagnoses_created_at_idx on diagnoses (created_at desc);

create table if not exists fix_history_log (
  id varchar primary key default gen_random_uuid(),
  diagnosis_id varchar not null,
  user_id varchar not null,
  attempt_number integer default 1,
  suggested_fix json,
  was_successful boolean,
  user_feedback text,
  steps_completed json,
  time_spent_minutes integer,
  created_at timestamp default now()
);

create index if not exists fix_history_log_diagnosis_idx on fix_history_log (diagnosis_id);

create table if not exists chat_export_log (
  id varchar primary key default gen_random_uuid(),
  diagnosis_id varchar not null,
  user_id varchar not null,
  mechanic_id varchar,
  export_data json,
  exported_at timestamp default now()
);

create index if not exists chat_export_log_diagnosis_idx on chat_export_log (diagnosis_id);

create table if not exists mechanics (
  id varchar primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  specialties json,
  experience_years integer,
  rating numeric(3, 2) default '0.00',
  total_consultations integer default 0,
  is_active boolean default true,
  hourly_rate numeric(10, 2),
  joined_at timestamp default now()
);

create unique index if not exists mechanics_email_unique on mechanics (email);
create index if not exists mechanics_rating_idx on mechanics (rating);
create index if not exists mechanics_active_idx on mechanics (is_active);

create table if not exists consultations (
  id varchar primary key default gen_random_uuid(),
  diagnosis_id varchar not null,
  mechanic_id varchar not null,
  user_id varchar not null,
  status text default 'pending',
  started_at timestamp,
  completed_at timestamp,
  duration_minutes integer,
  was_fixed boolean,
  mechanic_rating integer,
  politeness_rating integer,
  effectiveness_rating integer,
  ease_of_work_rating integer,
  overall_score numeric(5, 2),
  user_feedback text,
  mechanic_notes text,
  cost numeric(10, 2),
  mechanic_payment numeric(10, 2),
  created_at timestamp default now()
);

create index if not exists consultations_mechanic_idx on consultations (mechanic_id);
create index if not exists consultations_user_idx on consultations (user_id);
create index if not exists consultations_status_idx on consultations (status);

create table if not exists follow_up_requests (
  id varchar primary key default gen_random_uuid(),
  original_diagnosis_id varchar not null,
  user_id varchar not null,
  additional_info text,
  new_audio_file text,
  new_video_file text,
  new_vibration_data json,
  status text default 'pending',
  created_at timestamp default now()
);

create index if not exists follow_up_diagnosis_idx on follow_up_requests (original_diagnosis_id);

-- ---------------------------------------------------------------------------
-- Drivable seed knowledge tables (row source: docs/seed-data/json/*)
-- ---------------------------------------------------------------------------

create table if not exists drivable_seed_symptom_categories (
  symptom_category_id varchar primary key,
  label text not null,
  plain_english_description text,
  common_customer_phrases text,
  common_evidence_needed text,
  possible_risk_level text,
  high_risk_signals text,
  related_roadside_modes text,
  recommended_initial_path text,
  human_review_recommended boolean default false,
  safety_note text,
  raw json,
  created_at timestamp default now()
);

create table if not exists drivable_seed_evidence_items (
  evidence_id varchar primary key,
  label text not null,
  description text,
  evidence_type text,
  useful_for_symptom_categories text,
  safe_capture_instructions text,
  unsafe_capture_warning text,
  priority text,
  customer_prompt_text text,
  raw json,
  created_at timestamp default now()
);

create table if not exists drivable_seed_roadside_risk_triggers (
  trigger_id varchar primary key,
  label text not null,
  customer_phrase_examples text,
  risk_level text,
  recommended_action text,
  stop_now boolean default false,
  human_review_required boolean default false,
  tow_likely boolean default false,
  safe_customer_message text,
  unsafe_phrasing_to_avoid text,
  raw json,
  created_at timestamp default now()
);

create table if not exists drivable_seed_decision_paths (
  decision_path_id varchar primary key,
  label text not null,
  plain_english_meaning text,
  when_to_use text,
  customer_facing_recommendation text,
  safety_boundaries text,
  human_review_recommended boolean default false,
  next_info_needed text,
  related_statuses text,
  raw json,
  created_at timestamp default now()
);

create table if not exists drivable_seed_follow_up_questions (
  question_id varchar primary key,
  symptom_category_id varchar,
  question_text text not null,
  why_it_matters text,
  requested_evidence text,
  safety_warning text,
  priority text,
  answer_type text,
  raw json,
  created_at timestamp default now()
);

create index if not exists seed_follow_up_symptom_idx
  on drivable_seed_follow_up_questions (symptom_category_id);

create table if not exists drivable_seed_repair_vs_sell_factors (
  factor_id varchar primary key,
  label text not null,
  plain_english_meaning text,
  pushes_toward_repair text,
  pushes_toward_sell text,
  info_needed text,
  risk_note text,
  customer_question text,
  raw json,
  created_at timestamp default now()
);

create table if not exists drivable_seed_buyer_risk_flags (
  flag_id varchar primary key,
  label text not null,
  seller_phrase_examples text,
  why_it_matters text,
  evidence_to_request text,
  risk_level text,
  walk_away_signal text,
  customer_safe_advice text,
  raw json,
  created_at timestamp default now()
);

create table if not exists drivable_seed_seller_disclosure_prompts (
  disclosure_id varchar primary key,
  issue_type text not null,
  plain_english_disclosure_prompt text,
  buyer_concern text,
  evidence_helpful text,
  listing_language_suggestion text,
  safety_or_legal_note text,
  raw json,
  created_at timestamp default now()
);

-- ---------------------------------------------------------------------------
-- Drivable operational tables
-- ---------------------------------------------------------------------------

create table if not exists drivable_confirmed_cases (
  case_id varchar primary key,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  symptom_summary text not null,
  confirmed_fix text not null,
  evidence_pattern json,
  drivable_lesson text,
  confidence text default 'high',
  source text default 'glenn_confirmed_repair',
  raw json,
  created_at timestamp default now()
);

create index if not exists confirmed_cases_vehicle_idx
  on drivable_confirmed_cases (vehicle_year, vehicle_make, vehicle_model);

create table if not exists drivable_vehicle_knowledge_packs (
  pack_id varchar primary key,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  source text default 'drivable_seed',
  source_type text,
  summary text,
  risk_tags json,
  buyer_questions json,
  seller_evidence_requests json,
  inspection_prompts json,
  confidence text default 'medium',
  vin_required_for_applicability boolean default false,
  raw json,
  created_at timestamp default now()
);

create index if not exists knowledge_packs_vehicle_idx
  on drivable_vehicle_knowledge_packs (vehicle_year, vehicle_make, vehicle_model);

commit;