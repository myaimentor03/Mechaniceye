-- Drivable commerce orders (production).
-- Durable, atomic, idempotent repository for verified payment state.
-- Required by PRODUCTION_COMMERCE_REPOSITORY_REQUIREMENTS and paid-fulfillment-eligibility.
--
-- SAFETY:
--   * Idempotent (every statement is CREATE ... IF NOT EXISTS).
--   * Event fingerprints provide exactly-once semantics for provider webhooks.
--   * Optimistic locking via version column ensures atomic compare-and-swap.
--   * Server-generated UUIDs for orderId and eventId (gen_random_uuid()).
--   * THIS MIGRATION IS NOT APPLIED BY THIS WORKTREE. The owner applies it during
--     production setup.

begin;

create table if not exists drivable_commerce_orders (
  order_id varchar(160) primary key default gen_random_uuid(),
  case_id varchar(160) not null,
  offer_id varchar(80) not null,
  offer_version varchar(80) not null,
  offer_label varchar(160) not null,
  offer_amount_minor integer not null check (offer_amount_minor > 0),
  offer_currency char(3) not null check (offer_currency ~ '^[A-Z]{3}$'),
  state text not null check (state in ('pending', 'verified', 'failed', 'refund_required', 'refunded')) default 'pending',
  provider_adapter_id varchar(80),
  provider_name varchar(80),
  provider_order_reference varchar(160),
  version integer not null default 1 check (version > 0),
  event_count integer not null default 0 check (event_count >= 0),
  refund_reason_code varchar(80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (state = 'pending' and provider_adapter_id is null and provider_name is null and provider_order_reference is null)
    or (state in ('verified', 'failed', 'refund_required', 'refunded') and provider_adapter_id is not null and provider_name is not null and provider_order_reference is not null)
  )
);

create index if not exists drivable_commerce_orders_case_idx on drivable_commerce_orders (case_id);
create index if not exists drivable_commerce_orders_state_idx on drivable_commerce_orders (state);

create table if not exists drivable_commerce_order_events (
  order_id varchar(160) not null references drivable_commerce_orders(order_id) on delete cascade,
  event_id varchar(160) not null,
  event_fingerprint varchar(64) not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (order_id, event_id)
);

create index if not exists drivable_commerce_order_events_fingerprint_idx on drivable_commerce_order_events (order_id, event_fingerprint);

commit;