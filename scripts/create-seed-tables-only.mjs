import pg from "pg";
import {
  mutationTargetGuard,
  safeTargetDescription,
  sslConfigForUrl,
} from "./lib/db-target-safe.mjs";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Set it before running this script.");
}

console.log(`Intended database target: ${safeTargetDescription(process.env.DATABASE_URL)}`);

const guard = mutationTargetGuard(process.env.DATABASE_URL);
if (!guard.ok) {
  console.error(`Seed table creation refused: ${guard.reason}`);
  console.error("This script creates tables. It requires an owner-confirmed target.");
  process.exit(1);
}
console.log(`Confirmed target: ${safeTargetDescription(process.env.DATABASE_URL)}`);

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfigForUrl(process.env.DATABASE_URL)
});

const statements = [
`
CREATE TABLE IF NOT EXISTS drivable_seed_symptom_categories (
  symptom_category_id varchar PRIMARY KEY,
  label text NOT NULL,
  plain_english_description text,
  common_customer_phrases text,
  common_evidence_needed text,
  possible_risk_level text,
  high_risk_signals text,
  related_roadside_modes text,
  recommended_initial_path text,
  human_review_recommended boolean DEFAULT false,
  safety_note text,
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE TABLE IF NOT EXISTS drivable_seed_evidence_items (
  evidence_id varchar PRIMARY KEY,
  label text NOT NULL,
  description text,
  evidence_type text,
  useful_for_symptom_categories text,
  safe_capture_instructions text,
  unsafe_capture_warning text,
  priority text,
  customer_prompt_text text,
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE TABLE IF NOT EXISTS drivable_seed_roadside_risk_triggers (
  trigger_id varchar PRIMARY KEY,
  label text NOT NULL,
  customer_phrase_examples text,
  risk_level text,
  recommended_action text,
  stop_now boolean DEFAULT false,
  human_review_required boolean DEFAULT false,
  tow_likely boolean DEFAULT false,
  safe_customer_message text,
  unsafe_phrasing_to_avoid text,
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE TABLE IF NOT EXISTS drivable_seed_decision_paths (
  decision_path_id varchar PRIMARY KEY,
  label text NOT NULL,
  plain_english_meaning text,
  when_to_use text,
  customer_facing_recommendation text,
  safety_boundaries text,
  human_review_recommended boolean DEFAULT false,
  next_info_needed text,
  related_statuses text,
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE TABLE IF NOT EXISTS drivable_seed_follow_up_questions (
  question_id varchar PRIMARY KEY,
  symptom_category_id varchar,
  question_text text NOT NULL,
  why_it_matters text,
  requested_evidence text,
  safety_warning text,
  priority text,
  answer_type text,
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE INDEX IF NOT EXISTS seed_follow_up_symptom_idx
ON drivable_seed_follow_up_questions (symptom_category_id);
`,
`
CREATE TABLE IF NOT EXISTS drivable_seed_repair_vs_sell_factors (
  factor_id varchar PRIMARY KEY,
  label text NOT NULL,
  plain_english_meaning text,
  pushes_toward_repair text,
  pushes_toward_sell text,
  info_needed text,
  risk_note text,
  customer_question text,
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE TABLE IF NOT EXISTS drivable_seed_buyer_risk_flags (
  flag_id varchar PRIMARY KEY,
  label text NOT NULL,
  seller_phrase_examples text,
  why_it_matters text,
  evidence_to_request text,
  risk_level text,
  walk_away_signal text,
  customer_safe_advice text,
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE TABLE IF NOT EXISTS drivable_seed_seller_disclosure_prompts (
  disclosure_id varchar PRIMARY KEY,
  issue_type text NOT NULL,
  plain_english_disclosure_prompt text,
  buyer_concern text,
  evidence_helpful text,
  listing_language_suggestion text,
  safety_or_legal_note text,
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE TABLE IF NOT EXISTS drivable_confirmed_cases (
  case_id varchar PRIMARY KEY,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  symptom_summary text NOT NULL,
  confirmed_fix text NOT NULL,
  evidence_pattern json,
  drivable_lesson text,
  confidence text DEFAULT 'high',
  source text DEFAULT 'glenn_confirmed_repair',
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE INDEX IF NOT EXISTS confirmed_cases_vehicle_idx
ON drivable_confirmed_cases (vehicle_year, vehicle_make, vehicle_model);
`,
`
CREATE TABLE IF NOT EXISTS drivable_vehicle_knowledge_packs (
  pack_id varchar PRIMARY KEY,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  source text DEFAULT 'drivable_seed',
  source_type text,
  summary text,
  risk_tags json,
  buyer_questions json,
  seller_evidence_requests json,
  inspection_prompts json,
  confidence text DEFAULT 'medium',
  vin_required_for_applicability boolean DEFAULT false,
  raw json,
  created_at timestamp DEFAULT now()
);
`,
`
CREATE INDEX IF NOT EXISTS knowledge_packs_vehicle_idx
ON drivable_vehicle_knowledge_packs (vehicle_year, vehicle_make, vehicle_model);
`
];

await client.connect();

try {
  for (const statement of statements) {
    await client.query(statement);
  }

  console.log("Seed tables created/verified safely.");
  console.log("Existing app tables were not altered by this script.");
} finally {
  await client.end();
}
