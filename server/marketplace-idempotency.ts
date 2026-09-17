/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #7 ClearSale,
 * P0 #1 upload recovery, P0 #4 payment safety).
 *
 * The ClearSale seller-intake and buyer-interest clients already generate a
 * stable `clientRequestId` (sessionStorage-backed, rotated only after a
 * successful intake) so a mobile timeout retry or double-tap resends the
 * SAME key. The server previously ignored that key: every retry created a
 * new listing request and re-fired the master-intake webhook, producing
 * duplicate listings / duplicate seller emails.
 *
 * This module is the server-side half of that contract:
 * - `normalizeIdempotencyKey` accepts only safe token-shaped keys
 *   (`req-...` style, capped length); anything else is treated as absent so
 *   older clients that send no key keep working unchanged.
 * - `MarketplaceIdempotencyStore` records the accepted response id per key,
 *   namespaced per endpoint, with a bounded FIFO cap so a long-lived
 *   process cannot grow memory without bound.
 *
 * Duplicate hits must return the ORIGINAL id with `duplicate: true` and
 * must NOT re-forward the webhook.
 */

export const MARKETPLACE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
export const MARKETPLACE_IDEMPOTENCY_MAX_KEYS = 500;

export type MarketplaceIdempotencyNamespace =
  | "marketplace-seller-intake"
  | "marketplace-buyer-interest";

export function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 160) return null;
  if (!MARKETPLACE_IDEMPOTENCY_KEY_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export type MarketplaceIdempotencyRecord = Readonly<{
  id: string;
  recordedAt: string;
}>;

const NAMESPACE_SEPARATOR = "|";

export class MarketplaceIdempotencyStore {
  private readonly entries = new Map<string, MarketplaceIdempotencyRecord>();

  constructor(private readonly maxKeys: number = MARKETPLACE_IDEMPOTENCY_MAX_KEYS) {}

  private mapKey(namespace: MarketplaceIdempotencyNamespace, key: string): string {
    return `${namespace}${NAMESPACE_SEPARATOR}${key}`;
  }

  get(namespace: MarketplaceIdempotencyNamespace, key: string): MarketplaceIdempotencyRecord | null {
    return this.entries.get(this.mapKey(namespace, key)) ?? null;
  }

  record(namespace: MarketplaceIdempotencyNamespace, key: string, id: string): MarketplaceIdempotencyRecord {
    const record = Object.freeze({ id, recordedAt: new Date().toISOString() });
    this.entries.set(this.mapKey(namespace, key), record);
    while (this.entries.size > this.maxKeys) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    return record;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Process-local idempotency state for the marketplace intake routes.
 * Mirrors the diagnosis route's customer-scoped DB dedupe contract for the
 * webhook-forwarded marketplace endpoints, which have no durable case row to
 * key off. A durable cross-instance store is a post-beta hardening item;
 * this prevents the common single-instance mobile double-submit/timeout
 * retry from creating duplicate ClearSale listings.
 */
export const marketplaceIdempotencyStore = new MarketplaceIdempotencyStore();
