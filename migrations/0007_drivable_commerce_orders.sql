-- Canonical commerce schema v2. Never applied automatically.
-- Legacy JSON/column layouts require a separately reviewed data migration.
BEGIN;
SELECT pg_advisory_xact_lock(7262026007);
DO $$ BEGIN
  IF to_regclass('drivable_commerce_orders') IS NOT NULL
     OR to_regclass('drivable_commerce_order_events') IS NOT NULL THEN
    RAISE EXCEPTION 'Existing commerce schema: stop and review an explicit data migration';
  END IF;
END $$;
CREATE TABLE drivable_commerce_orders (
  order_id text PRIMARY KEY,
  case_id text NOT NULL,
  snapshot jsonb NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  provider_reference text,
  checkout_session_id text,
  contract_version integer NOT NULL DEFAULT 2 CHECK (contract_version=2),
  CHECK (jsonb_typeof(snapshot)='object'),
  CHECK (snapshot->>'caseId' = case_id),
  CHECK (snapshot->>'orderId' = order_id),
  CHECK ((snapshot->>'version')::integer = version),
  CHECK (snapshot->>'state' IN ('pending','verified','failed','refund_required','refunded','partial_refund'))
);
CREATE UNIQUE INDEX IF NOT EXISTS drivable_commerce_orders_provider_unique
  ON drivable_commerce_orders(provider_reference);
CREATE TABLE drivable_commerce_order_events (
  event_id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES drivable_commerce_orders(order_id),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  next_state text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('payment_verified','payment_failed','refund_partial','refund_confirmed','refund_requested')),
  provider_reference text NOT NULL,
  provider_occurred_at timestamptz NOT NULL,
  proof jsonb NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS drivable_commerce_events_order_idx ON drivable_commerce_order_events(order_id);
COMMIT;
