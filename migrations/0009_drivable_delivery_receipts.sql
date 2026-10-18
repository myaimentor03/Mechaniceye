-- Durable, idempotent proof of a paid-result delivery before its outbox ACK.
-- This migration is intentionally not applied by the marathon worker.
BEGIN;
CREATE TABLE IF NOT EXISTS drivable_delivery_receipts (
  receipt_id varchar PRIMARY KEY,
  job_id varchar NOT NULL REFERENCES drivable_delivery_outbox(job_id) ON DELETE RESTRICT,
  case_id varchar NOT NULL,
  resource_version varchar NOT NULL,
  destination_key varchar NOT NULL,
  provider varchar NOT NULL,
  provider_reference varchar NOT NULL,
  confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drivable_delivery_receipts_job_id_unique
  ON drivable_delivery_receipts (job_id);
CREATE INDEX IF NOT EXISTS drivable_delivery_receipts_case_idx
  ON drivable_delivery_receipts (case_id);
CREATE INDEX IF NOT EXISTS drivable_delivery_receipts_confirmed_idx
  ON drivable_delivery_receipts (confirmed_at);
COMMIT;
