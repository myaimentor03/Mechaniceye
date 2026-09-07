-- OPTIONAL Drivable durable delivery outbox (advisory / future wiring).
--
-- Status: NOT WIRED. No runtime code writes or reads this table yet. The
-- current delivery path is direct fire-and-forget webhook fetches in
-- server/routes.ts (see docs/beta/DRIVABLE_DATA_MIGRATION_AND_IMPORT_RUNBOOK_0902.md
-- §7). This migration only provisions the durable table the delivery-outbox
-- contract (server/jobs/delivery-outbox.ts,
-- PRODUCTION_DELIVERY_OUTBOX_REQUIREMENTS) is designed around: durable,
-- horizontally scalable, atomic leasing, fenced acknowledgement, idempotent
-- enqueue.
--
-- SAFETY:
--   * Idempotent (every statement is CREATE ... IF NOT EXISTS).
--   * Stores only opaque identifiers and delivery metadata. Raw request
--     bodies, contact details, URLs, VINs, and free text MUST NOT be written
--     here (asserted by the repository contract).
--   * No foreign key to diagnoses on purpose: the outbox must be able to
--     retain a delivery intent even if the case row lifecycle differs, and
--     deliveries are keyed by opaque case ids only.
--   * THIS MIGRATION IS NOT APPLIED BY THIS WORKTREE. The owner applies it
--     during production setup (and only) when a durable outbox implementation
--     is wired in.

begin;

create table if not exists drivable_delivery_outbox (
  job_id varchar primary key default gen_random_uuid(),
  case_id varchar not null,
  deduplication_key varchar not null,
  state text not null default 'pending'
    check (state in ('pending', 'leased', 'failed', 'delivered', 'dead_letter')),
  channel text not null,
  resource_kind text not null,
  resource_id text not null,
  resource_version text not null,
  destination_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  replay_count integer not null default 0 check (replay_count >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  initial_retry_delay_ms integer not null default 1000,
  backoff_multiplier numeric(6, 2) not null default '2.00',
  max_retry_delay_ms integer not null default 60000,
  lease_duration_ms integer not null default 30000,
  lease_token text,
  lease_owner text,
  available_at timestamp default now(),
  leased_at timestamp,
  lease_expires_at timestamp,
  delivered_at timestamp,
  failed_at timestamp,
  next_attempt_at timestamp,
  dead_lettered_at timestamp,
  last_failure_code text,
  last_failure_retryable boolean,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create unique index if not exists drivable_delivery_outbox_case_dedup_unique
  on drivable_delivery_outbox (case_id, deduplication_key);

create index if not exists drivable_delivery_outbox_claim_idx
  on drivable_delivery_outbox (state, available_at);

create index if not exists drivable_delivery_outbox_case_idx
  on drivable_delivery_outbox (case_id);

commit;