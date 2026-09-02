begin;

create table if not exists drivable_consent_events (
  event_id varchar(160) primary key,
  event_kind varchar(32) not null check (event_kind in ('consent.accepted', 'consent.revoked')),
  schema_version integer not null check (schema_version = 1),
  actor_id varchar(160) not null,
  account_id varchar(160) not null,
  case_id varchar(160) not null,
  acceptance_event_id varchar(160) references drivable_consent_events(event_id),
  occurred_at timestamptz not null,
  event_payload jsonb not null,
  created_at timestamptz not null default now(),
  check (
    (event_kind = 'consent.accepted' and acceptance_event_id is null)
    or (event_kind = 'consent.revoked' and acceptance_event_id is not null)
  )
);

create index if not exists drivable_consent_subject_timeline_idx
  on drivable_consent_events (actor_id, account_id, case_id, occurred_at, created_at);

create table if not exists drivable_review_versions (
  version_id varchar(160) primary key,
  case_id varchar(160) not null,
  stage varchar(24) not null check (stage in ('draft', 'final')),
  initial_status varchar(32) not null check (initial_status in ('draft', 'review_required')),
  artifact_digest varchar(128) not null,
  recipient_digest varchar(128) not null,
  recipient_binding_version varchar(80) not null,
  policy_version varchar(120) not null,
  model_version varchar(120) not null,
  evidence_version varchar(120) not null,
  risk_level varchar(24) not null check (risk_level in ('low', 'moderate', 'high', 'critical', 'unknown')),
  mock boolean not null default false,
  source_version_id varchar(160) references drivable_review_versions(version_id),
  created_at timestamptz not null default now(),
  check (
    (stage = 'draft' and initial_status = 'draft' and source_version_id is null)
    or (stage = 'final' and initial_status = 'review_required' and source_version_id is not null)
  )
);

create index if not exists drivable_review_versions_case_timeline_idx
  on drivable_review_versions (case_id, created_at, version_id);

create table if not exists drivable_review_approvals (
  approval_id varchar(160) primary key,
  version_id varchar(160) not null unique references drivable_review_versions(version_id),
  case_id varchar(160) not null,
  reviewer_ref varchar(160) not null,
  approved_at timestamptz not null,
  policy_version varchar(120) not null,
  model_version varchar(120) not null,
  evidence_version varchar(120) not null,
  recipient_digest varchar(128) not null,
  recipient_binding_version varchar(80) not null,
  risk_level varchar(24) not null check (risk_level in ('low', 'moderate', 'high', 'critical', 'unknown')),
  high_risk_acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists drivable_review_rejections (
  rejection_id varchar(160) primary key,
  version_id varchar(160) not null unique references drivable_review_versions(version_id),
  case_id varchar(160) not null,
  reviewer_ref varchar(160) not null,
  rejected_at timestamptz not null,
  reason_code varchar(40) not null check (reason_code in ('insufficient_evidence', 'policy_mismatch', 'unsafe_content', 'other')),
  created_at timestamptz not null default now()
);

create table if not exists drivable_review_supersessions (
  supersession_id varchar(160) primary key,
  version_id varchar(160) not null unique references drivable_review_versions(version_id),
  case_id varchar(160) not null,
  superseded_at timestamptz not null,
  superseded_by_version_id varchar(160) references drivable_review_versions(version_id),
  created_at timestamptz not null default now()
);

create table if not exists drivable_review_case_heads (
  case_id varchar(160) primary key,
  version_id varchar(160) not null unique references drivable_review_versions(version_id),
  updated_at timestamptz not null default now()
);

create or replace function drivable_validate_review_transition()
returns trigger language plpgsql as $$
declare
  version_record drivable_review_versions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.case_id, 0));
  select * into version_record from drivable_review_versions
   where version_id = new.version_id for key share;
  if not found or version_record.case_id <> new.case_id then
    raise exception 'review transition case mismatch' using errcode = '23514';
  end if;

  if tg_table_name in ('drivable_review_approvals', 'drivable_review_rejections') then
    if version_record.stage <> 'final' or version_record.initial_status <> 'review_required' then
      raise exception 'review decision requires a final review version' using errcode = '23514';
    end if;
    if exists(select 1 from drivable_review_supersessions where version_id = new.version_id)
       or exists(select 1 from drivable_review_approvals where version_id = new.version_id)
       or exists(select 1 from drivable_review_rejections where version_id = new.version_id) then
      raise exception 'review version already has a terminal transition' using errcode = '23505';
    end if;
    if not exists(select 1 from drivable_review_case_heads where case_id = new.case_id and version_id = new.version_id) then
      raise exception 'review decision targets a stale version' using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'drivable_review_approvals' then
    if new.policy_version <> version_record.policy_version
       or new.model_version <> version_record.model_version
       or new.evidence_version <> version_record.evidence_version
       or new.recipient_digest <> version_record.recipient_digest
       or new.recipient_binding_version <> version_record.recipient_binding_version
       or new.risk_level <> version_record.risk_level then
      raise exception 'review approval bindings do not match the approved version' using errcode = '23514';
    end if;
    if version_record.risk_level = 'high' and not new.high_risk_acknowledged then
      raise exception 'high-risk review approval requires acknowledgement' using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'drivable_review_supersessions' then
    if exists(select 1 from drivable_review_supersessions where version_id = new.version_id) then
      raise exception 'review version is already superseded' using errcode = '23505';
    end if;
    if new.superseded_by_version_id is not null and not exists(
      select 1 from drivable_review_versions
       where version_id = new.superseded_by_version_id and case_id = new.case_id
    ) then
      raise exception 'superseding review version belongs to another case' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function drivable_validate_review_case_head()
returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.case_id, 0));
  if not exists(
    select 1 from drivable_review_versions
     where version_id = new.version_id and case_id = new.case_id
  ) then
    raise exception 'review case head points outside its case' using errcode = '23514';
  end if;
  if exists(select 1 from drivable_review_supersessions where version_id = new.version_id) then
    raise exception 'review case head cannot point to a superseded version' using errcode = '23514';
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'drivable_review_approvals',
    'drivable_review_rejections',
    'drivable_review_supersessions'
  ] loop
    trigger_name := table_name || '_transition_guard';
    if not exists (select 1 from pg_trigger where tgname = trigger_name) then
      execute format(
        'create trigger %I before insert on %I for each row execute function drivable_validate_review_transition()',
        trigger_name,
        table_name
      );
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'drivable_review_case_heads_guard') then
    create trigger drivable_review_case_heads_guard
      before insert or update on drivable_review_case_heads
      for each row execute function drivable_validate_review_case_head();
  end if;
end;
$$;

create or replace function drivable_validate_consent_revocation()
returns trigger language plpgsql as $$
declare
  accepted drivable_consent_events%rowtype;
begin
  if new.event_kind <> 'consent.revoked' then
    return new;
  end if;

  select * into accepted
    from drivable_consent_events
   where event_id = new.acceptance_event_id
   for key share;
  if not found or accepted.event_kind <> 'consent.accepted' then
    raise exception 'consent revocation must reference an acceptance event' using errcode = '23503';
  end if;
  if accepted.actor_id <> new.actor_id
     or accepted.account_id <> new.account_id
     or accepted.case_id <> new.case_id then
    raise exception 'consent revocation subject mismatch' using errcode = '23514';
  end if;
  if new.occurred_at < accepted.occurred_at then
    raise exception 'consent revocation precedes acceptance' using errcode = '23514';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'drivable_consent_revocation_guard'
  ) then
    create trigger drivable_consent_revocation_guard
      before insert on drivable_consent_events
      for each row execute function drivable_validate_consent_revocation();
  end if;
end;
$$;

create or replace function drivable_reject_consent_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'drivable consent events are append-only' using errcode = '55000';
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'drivable_consent_events_append_only'
  ) then
    create trigger drivable_consent_events_append_only
      before update or delete on drivable_consent_events
      for each row execute function drivable_reject_consent_event_mutation();
  end if;
end;
$$;

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'drivable_review_versions',
    'drivable_review_approvals',
    'drivable_review_rejections',
    'drivable_review_supersessions'
  ] loop
    trigger_name := table_name || '_append_only';
    if not exists (select 1 from pg_trigger where tgname = trigger_name) then
      execute format(
        'create trigger %I before update or delete on %I for each row execute function drivable_reject_consent_event_mutation()',
        trigger_name,
        table_name
      );
    end if;
  end loop;
end;
$$;

commit;
