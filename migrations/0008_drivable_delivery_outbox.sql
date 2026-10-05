-- Provision the durable delivery outbox used by PostgresDeliveryOutboxRepository.
-- The table definition is repeated from optional migration 0004 so this migration
-- also works where that advisory migration was intentionally skipped.
begin;

create table if not exists drivable_delivery_outbox (
  job_id varchar primary key,
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
  last_replayed_at timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table drivable_delivery_outbox add column if not exists last_replayed_at timestamp;

create unique index if not exists drivable_delivery_outbox_case_dedup_unique
  on drivable_delivery_outbox (case_id, deduplication_key);
create index if not exists drivable_delivery_outbox_claim_idx
  on drivable_delivery_outbox (state, available_at);
create index if not exists drivable_delivery_outbox_case_idx
  on drivable_delivery_outbox (case_id);

commit;
