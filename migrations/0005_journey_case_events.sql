begin;

create table if not exists journey_case_events (
  event_id varchar(160) primary key,
  case_id varchar(160) not null,
  customer_id varchar(160),
  event_type varchar(40) not null,
  from_state varchar(32),
  to_state varchar(32),
  transition varchar(40),
  outcome varchar(32),
  evidence_kind varchar(20),
  evidence_count integer,
  reviewer_ref varchar(160),
  review_action varchar(32),
  reason_code varchar(40),
  message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists journey_events_case_timeline_idx
  on journey_case_events (case_id, created_at, event_id);

create index if not exists journey_events_customer_idx
  on journey_case_events (customer_id, created_at);

-- Append-only guard: journey case events are an immutable audit trail
create or replace function reject_journey_case_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'journey case events are append-only' using errcode = '55000';
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'journey_case_events_append_only'
  ) then
    create trigger journey_case_events_append_only
      before update or delete on journey_case_events
      for each row execute function reject_journey_case_event_mutation();
  end if;
end;
$$;

commit;
