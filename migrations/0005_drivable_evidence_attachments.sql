-- Evidence attachment persistence table.
-- Each uploaded evidence file (photo, audio, video, vibration) gets a row here.
-- This is the durable SQL source of truth for evidence metadata, written alongside
-- the filesystem/S3 attachments.json manifest so evidence can be queried, audited,
-- and re-associated if the manifest is ever lost.
--
-- Idempotent: every statement is CREATE ... IF NOT EXISTS.
-- Requires PostgreSQL 13+ for the built-in gen_random_uuid() default.

begin;

create table if not exists drivable_evidence_attachments (
  id varchar primary key,
  case_id varchar not null,
  kind text not null,
  original_name text not null,
  mime_type text not null,
  byte_size integer not null,
  status text not null default 'persisted',
  storage_key text not null,
  provenance text not null default 'uploaded_media',
  analysis_status text not null default 'uploaded_not_analyzed',
  notes text,
  created_at timestamp not null default now()
);

create index if not exists evidence_attachments_case_idx on drivable_evidence_attachments (case_id);
create index if not exists evidence_attachments_kind_idx on drivable_evidence_attachments (kind);
create index if not exists evidence_attachments_case_kind_idx on drivable_evidence_attachments (case_id, kind);

commit;
