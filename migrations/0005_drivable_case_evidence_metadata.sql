-- Drivable case evidence metadata (2026-09-19).
--
-- Adds durable evidence-metadata columns to the diagnoses table so the case
-- row retains the exact files that an intake attached (photos, audio, video,
-- vibration) instead of only the coarser `audio_file` / `video_file` / `vibration_data`
-- summaries and the `input_types` label list.
--
-- WHY: before this migration, photo attachment names were only persisted by
-- the object-storage store and were unrecoverable from the database after a
-- server restart. Audio/video/vibration file names were folded into a single
-- summary string. These columns let the durable case row be the source of
-- truth for what evidence a case owns (and close the case/evidence mismatch
-- where evidence objects exist without a DB record of them).
--
-- SAFETY:
--   * Idempotent: every statement is ADD COLUMN IF NOT EXISTS; safe to re-run.
--   * Non-destructive: no drops, no truncates, no column removals.
--   * Nullable on purpose: rows written by older code remain valid, and the
--     runtime treats a missing (NULL / '[]') column as "no evidence of that
--     type". The evidence_version default is applied to existing rows reading
--     as '1' so readers always have a version to compare.
--   * THIS MIGRATION IS NOT APPLIED BY THIS WORKTREE. The owner applies it
--     during production setup (see docs/beta/DRIVABLE_DATA_MIGRATION_AND_IMPORT_RUNBOOK_0902.md).

begin;

alter table diagnoses
  add column if not exists photo_file_names json;

alter table diagnoses
  add column if not exists audio_file_names json;

alter table diagnoses
  add column if not exists video_file_names json;

alter table diagnoses
  add column if not exists vibration_file_names json;

alter table diagnoses
  add column if not exists evidence_version text default '1';

commit;