-- The durable receipt records Resend/provider API acceptance, not mailbox delivery.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'drivable_delivery_receipts' AND column_name = 'confirmed_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'drivable_delivery_receipts' AND column_name = 'accepted_at'
  ) THEN
    ALTER TABLE drivable_delivery_receipts RENAME COLUMN confirmed_at TO accepted_at;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'drivable_delivery_receipts' AND column_name = 'accepted_at'
  ) THEN
    RAISE EXCEPTION 'drivable_delivery_receipts.accepted_at is missing';
  END IF;

  IF to_regclass(current_schema() || '.drivable_delivery_receipts_confirmed_idx') IS NOT NULL
     AND to_regclass(current_schema() || '.drivable_delivery_receipts_accepted_idx') IS NULL THEN
    ALTER INDEX drivable_delivery_receipts_confirmed_idx RENAME TO drivable_delivery_receipts_accepted_idx;
  END IF;
END $$;
COMMIT;
