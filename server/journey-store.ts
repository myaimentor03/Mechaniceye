import fs from "node:fs";
import path from "node:path";
import type { JourneyCase } from "./journey-state-machine";
import { logEvent, logEventError } from "./observability/safe-log";

const DEFAULT_STORE_PATH = path.join(process.cwd(), "data", "journey-store.json");

/**
 * Raised when a journey case could not be durably persisted. Callers must fail
 * closed: returning 2xx here would claim a saved case that a restart (or a
 * redeploy onto a fresh container) would silently lose.
 */
export class JourneyPersistenceError extends Error {
  readonly code = "JOURNEY_PERSISTENCE_UNAVAILABLE";
  readonly retryable = true;
  constructor() {
    super("Journey case storage is not durably available");
    this.name = "JourneyPersistenceError";
  }
}

function storePath(): string {
  return process.env.JOURNEY_STORE_PATH?.trim() || DEFAULT_STORE_PATH;
}

/** Production requires a durable backing store; the JSON file is container-local. */
export function journeyDurableStorageRequired(): boolean {
  return process.env.NODE_ENV === "production";
}

function ensureDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort; the authoritative path is the durable store
  }
}

function loadRaw(): Record<string, JourneyCase> {
  const p = storePath();
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, JourneyCase>;
    return {};
  } catch {
    return {};
  }
}

/** Best-effort local mirror. Never treated as the persistence guarantee. */
function saveRaw(data: Record<string, JourneyCase>): void {
  const p = storePath();
  try {
    ensureDir(path.dirname(p));
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, p);
  } catch (error) {
    if (journeyDurableStorageRequired()) return;
    logEventError("journey.store_local_mirror_failed", error, {});
  }
}

// ── PostgreSQL backing store (lazy-init, optional) ────────────────────────
// When DATABASE_URL is set, writes are durable-first: the case is written to
// PostgreSQL and only a successful write is allowed to report success. Outside
// production the in-memory cache plus the local JSON mirror keep local
// development usable without a database.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pgStore: import("./journey-store-pg").PgJourneyStore | null = null;
let pgHydrated = false;
let pgHydrationFailure = false;
let pgInitAttempted = false;
let hydrationReady: Promise<void> | null = null;

async function ensurePgStore(): Promise<import("./journey-store-pg").PgJourneyStore | null> {
  if (pgInitAttempted) return pgStore;
  pgInitAttempted = true;

  if (!process.env.DATABASE_URL) return null;

  try {
    const { getPool } = await import("./db");
    const { createPgJourneyStore } = await import("./journey-store-pg");
    const pool = getPool();
    pgStore = createPgJourneyStore({
      query: (text: string, values?: unknown[]) =>
        pool.query(text, values as unknown[]).then((r) => ({ rows: r.rows as Record<string, unknown>[] })),
    });
    return pgStore;
  } catch (error) {
    logEventError("journey.store_database_unavailable", error, { durable: false });
    pgStore = null;
    return null;
  }
}

async function hydrateFromPg(): Promise<void> {
  const store = await ensurePgStore();
  if (!store) {
    pgHydrationFailure = true;
    pgHydrated = true;
    if (journeyDurableStorageRequired()) {
      logEvent("journey.store_durability_missing", { durable: false, source: "hydrate_no_database" });
    }
    return;
  }
  try {
    const allCases = await store.listAll();
    for (const c of allCases) {
      if (!cache.has(c.id)) {
        cache.set(c.id, c);
      }
    }
    pgHydrated = true;
    // Mirror newly hydrated cases to the local JSON file for fast local boots
    flush();
  } catch (error) {
    logEventError("journey.store_hydration_failed", error, { durable: false });
    pgHydrationFailure = true;
    pgHydrated = true;
  }
}

// In-memory cache initialized from disk
const cache = new Map<string, JourneyCase>(Object.entries(loadRaw()));

function flush(): void {
  const obj: Record<string, JourneyCase> = {};
  for (const [k, v] of cache.entries()) obj[k] = v;
  saveRaw(obj);
}

/**
 * Resolves once the durable case store has been hydrated. In production an
 * unhydratable store is a startup failure, not a silent degradation: the
 * process must not serve 200s for cases it cannot keep.
 */
export async function journeyStoreReady(): Promise<{ durable: boolean }> {
  if (!hydrationReady) hydrationReady = hydrateFromPg();
  await hydrationReady;
  const durable = pgStore !== null && !pgHydrationFailure;
  if (journeyDurableStorageRequired() && !durable) {
    throw new JourneyPersistenceError();
  }
  return { durable };
}

export function getJourneyCase(caseId: string): JourneyCase | undefined {
  return cache.get(caseId);
}

/**
 * Durably persists a journey case. In production this fails closed when the
 * durable store is missing or rejects the write, so a route can never report a
 * case as saved when it was not.
 */
export async function setJourneyCase(caseData: JourneyCase): Promise<void> {
  const store = await ensurePgStore();

  if (store) {
    try {
      await store.setStrict(caseData);
    } catch (error) {
      logEventError("journey.store_persist_failed", error, { caseId: caseData.id, durable: false });
      throw new JourneyPersistenceError();
    }
  } else if (journeyDurableStorageRequired()) {
    logEvent("journey.store_durability_missing", { durable: false, caseId: caseData.id, source: "write_no_database" });
    throw new JourneyPersistenceError();
  } else if (!pgInitAttempted) {
    // Warm the database handle in the background for local development.
    void hydrateFromPg().catch(() => {});
  }

  cache.set(caseData.id, caseData);
  flush();
}

export function listJourneyCasesByCustomer(customerId: string): JourneyCase[] {
  const out: JourneyCase[] = [];
  for (const c of cache.values()) {
    if (c.customerId === customerId) out.push(c);
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export function listAllJourneyCases(): JourneyCase[] {
  const out: JourneyCase[] = Array.from(cache.values());
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export function journeyStoreSize(): number {
  return cache.size;
}

export function clearJourneyStoreForTests(): void {
  cache.clear();
  pgHydrated = false;
  pgHydrationFailure = false;
  pgInitAttempted = false;
  hydrationReady = null;
  saveRaw({});
}

/**
 * Seeds the in-memory cache without a durable write. Tests and the local
 * bootstrap only — never used by a request path.
 */
export function seedJourneyCaseForTests(caseData: JourneyCase): void {
  cache.set(caseData.id, caseData);
  flush();
}
