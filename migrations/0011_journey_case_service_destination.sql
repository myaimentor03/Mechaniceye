-- Adds the destination already represented by JourneyCase and the PostgreSQL
-- adapter. This additive migration is safe for databases that applied 0006.
BEGIN;
ALTER TABLE journey_cases
  ADD COLUMN IF NOT EXISTS next_service_destination jsonb;
COMMIT;
