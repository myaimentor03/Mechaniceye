-- Explicit extension of existing 0004, not an alternate outbox schema.
BEGIN;
ALTER TABLE drivable_delivery_outbox ADD COLUMN IF NOT EXISTS last_replayed_at timestamp;
COMMIT;
