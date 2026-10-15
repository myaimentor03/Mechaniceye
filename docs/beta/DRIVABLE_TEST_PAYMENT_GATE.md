Drivable reconciled payment path (integration branch)
====================================================

This checkout contains one canonical commerce schema (v2) and one test-only
Stripe contract. Journey's branch was not merged or cherry-picked. The standalone
Postgres outbox and fixed-price catalog behavior were selectively adapted.
No migration has been applied and production charging/fulfillment remains closed.

Canonical storage and migration boundary
---------------------------------------

0007_drivable_commerce_orders.sql is the sole commerce migration. Orders use the
integration JSON snapshot design, contract_version=2, a Checkout session binding,
and a globally unique provider reference. Events have globally unique IDs, a
fingerprint, event kind, normalized proof, provider reference, original provider
timestamp, and local processing timestamp. Drizzle declares these same columns.

0007 runs in a transaction and refuses ANY pre-existing commerce orders/events
table, including either older integration JSON layout or Journey's column layout.
It does not attempt a data conversion and never treats CREATE TABLE IF NOT EXISTS
as an upgrade. An existing database requires read-only schema/data inspection and
a separately reviewed conversion migration; do not remove tables or apply 0007
blindly. 0008_drivable_delivery_outbox_runtime.sql only adds last_replayed_at to
the existing 0004 outbox schema. It requires 0004, rather than defining a competing
outbox table. Runtime storage verification fails closed when required columns or
unique indexes are missing.

Provider contract and customer routes
-------------------------------------

- adapterId: stripe_test_v1; provider: stripe_test.
- Session and PaymentIntent metadata: drivableOrderId and drivableCaseId.
- Only platform events with livemode=false and test objects are accepted.
- Checkout accepts only sk_test_ keys; signature verification needs only the test
  webhook secret and does not call Stripe or need an API key.
- Signed, fully paid Checkout completion and succeeded PaymentIntents confirm
  payment. Unpaid completion, processing and partial capture never grant access.
- Failed PaymentIntent attempts are recoverable. The same intent can later
  succeed. Late failures cannot downgrade verified/refunded state. Old success
  events cannot restore entitlement after a refund.
- Refunds resolve the order from the durable authenticated PaymentIntent binding,
  not assumed inheritance of Charge metadata. Cumulative amount_refunded must
  agree with refunded: a partial refund suspends paid access; a full refund is
  final. Older partial events cannot lower the recorded cumulative refund total.
- Provider time is retained separately. Snapshot updatedAt is a monotonic local
  ISO timestamp; whole-second provider timestamps and out-of-order events do not
  manufacture Date/string mismatches or incorrectly reject valid retries.

GET /api/commerce/offers returns explicitly test-mode fixed-price snapshots
adapted from the existing catalog (no new production pricing decision).
POST /api/commerce/orders accepts only offerId/caseId and requires a durable
customer-owned Journey case. Clients cannot supply price, currency or redirects.
POST /api/commerce/orders/:orderId/checkout calls the real Stripe SDK using the
stored price, server origin, canonical metadata and a stable order idempotency
key. Its test Session ID is persisted before returning a Checkout URL.
GET /api/commerce/orders/:orderId returns a safe receipt and paymentEntitled,
while releaseAllowed remains false. No secret/signature/customer evidence is
returned. Ownership is enforced in every environment, with no cache fallback.

POST /api/commerce/stripe-test/webhook is registered before JSON parsing. Configure
only the supported test event types: checkout.session.completed,
payment_intent.succeeded, payment_intent.payment_failed, charge.refunded.

Payment, approval and delivery remain separate
---------------------------------------------

A payment event, order update, and internal payment-reconcile outbox job are
committed in one Postgres transaction. Failure to enqueue rolls back payment and
event persistence. Multiple success events/retries cannot create multiple jobs.
The reconciliation job is never permission to release customer content.

POST /api/commerce/orders/:orderId/release is reviewer-only. Its coordinator first
requires recorded real-Postgres validation, then locks the order, checks durable
payment proof, locks the current case/review head with the review writer's
advisory lock, checks final human approval and artifact/recipient freshness, and
idempotently queues an approved-result job in that same transaction. Refunded,
partially refunded and refund-required orders deny access; payment revocation
also invalidates pending/failed/leased release jobs atomically. This change does
not launch a consumer, send messages or expose a customer result. A future
consumer must recheck payment and current approval immediately before delivery;
outbox acknowledgement by itself is not release authorization.

Validation blocker and configuration
-----------------------------------

POSTGRES_PAYMENT_VALIDATION.verified is false in source. No environment flag can
assert the missing real-database proof. Production runtime use is rejected, and
production readiness and approved-result queueing remain closed. The readiness
endpoint distinguishes locally verified test payment storage from missing paid
release validation. Current-case updates newer than a final review conservatively
require renewed review; the coordinator does not silently approve stale evidence.

Non-production test setup, after separately authorized database preparation:
DATABASE_URL; DRIVABLE_TEST_PAYMENTS_ENABLED=true;
DRIVABLE_STRIPE_TEST_WEBHOOK_SECRET; DRIVABLE_STRIPE_TEST_SECRET_KEY (sk_test_ only);
DRIVABLE_PUBLIC_ORIGIN (exact HTTPS origin or localhost HTTP).

Focused tests:
npx tsx --test server/commerce/*.test.ts server/jobs/postgres-delivery-outbox.test.ts server/jobs/delivery-outbox.contract.test.ts server/review/postgres-adapter.test.ts server/launch-readiness.test.ts

SQL fixtures and mock executors verify orchestration/rollback logic; they are not
proof of Postgres durability. The opt-in Postgres test requires an explicit
DRIVABLE_COMMERCE_TEST_DATABASE_URL AND DRIVABLE_ALLOW_COMMERCE_TEST_SCHEMA_SETUP=true.
It provisions/removes only its isolated random test schema. Do not enable it while
migration application is prohibited. It never falls back to DATABASE_URL.

Remaining validation: dedicated Postgres restart/concurrency/constraint/rollback
and approved-release tests, then a real Stripe test Checkout and signed webhook.
No database URL was available in this session; no migrations were applied.
Production activation/live credentials/deployment need separate authorization.
