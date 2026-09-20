begin;

-- Journey case persistence — one row per case, durable across restarts.
-- Complex nested fields (evidence, safetyFlags, matchedSymptomCategories,
-- plannedEvidence) stored as JSONB.  Evidence belongs to the vehicle/case
-- and is reusable across FIX/SELL flows.
create table if not exists journey_cases (
  id                    varchar(160) primary key,
  state                 varchar(32)  not null default 'intake',
  created_at            varchar(60)  not null,
  updated_at            varchar(60)  not null,
  vehicle_info          text         not null,
  description           text         not null,
  timing                text,
  urgency               text,
  can_drive             text,
  customer_id           varchar(160),
  customer_email        text,
  evidence              jsonb        not null default '[]'::jsonb,
  safety_flags          jsonb        not null default '[]'::jsonb,
  safety_triggered      boolean      not null default false,
  confidence_score      integer      not null default 0,
  confidence_level      varchar(32)  not null default 'insufficient_information',
  risk_level            varchar(32)  not null default 'unknown',
  outcome               varchar(32),
  decision_path         varchar(64),
  resolution_note       text,
  human_review_requested boolean     not null default false,
  escalation_reason     text,
  next_action           varchar(64),
  next_action_prompt    text,
  matched_symptom_categories jsonb   not null default '[]'::jsonb,
  planned_evidence      jsonb        not null default '[]'::jsonb,
  current_evidence_prompt text
);

create index if not exists journey_cases_customer_idx
  on journey_cases (customer_id);

create index if not exists journey_cases_state_idx
  on journey_cases (state);

commit;
