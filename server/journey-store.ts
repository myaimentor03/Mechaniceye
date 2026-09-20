import fs from "node:fs";
import path from "node:path";
import type { JourneyCase } from "./journey-state-machine";

const DEFAULT_STORE_PATH = path.join(process.cwd(), "data", "journey-store.json");

function storePath(): string {
  return process.env.JOURNEY_STORE_PATH?.trim() || DEFAULT_STORE_PATH;
}

function ensureDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort; in-memory fallback continues
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

function saveRaw(data: Record<string, JourneyCase>): void {
  const p = storePath();
  try {
    ensureDir(path.dirname(p));
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, p);
  } catch {
    // ignore persistence errors; in-memory remains authoritative for process
  }
}

// ── PostgreSQL backing store (lazy-init, optional) ────────────────────────
// When DATABASE_URL is set and the journey_cases table exists, writes are
// dual-written to PostgreSQL and the in-memory cache.  Reads come from the
// in-memory cache which is hydrated from PG on first access.

let pgStore: import("./journey-store-pg").PgJourneyStore | null = null;
let pgHydrated = false;
let pgInitAttempted = false;

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
        pool.query(text, values as any[]).then((r) => ({ rows: r.rows as Record<string, unknown>[] })),
    });
    return pgStore;
  } catch {
    // Database unavailable — degrade to in-memory + file only
    pgStore = null;
    return null;
  }
}

async function hydrateFromPg(): Promise<void> {
  if (pgHydrated) return;
  const store = await ensurePgStore();
  if (!store) {
    pgHydrated = true;
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
    // Persist any newly hydrated cases to the JSON file too
    flush();
  } catch {
    // PG hydration failed — continue with what we have
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

export function getJourneyCase(caseId: string): JourneyCase | undefined {
  // Kick off async PG hydration on first read (fire-and-forget)
  if (!pgHydrated) {
    hydrateFromPg().catch(() => {});
  }
  return cache.get(caseId);
}

export function setJourneyCase(caseData: JourneyCase): void {
  cache.set(caseData.id, caseData);
  flush();

  // Async dual-write to PostgreSQL (fire-and-forget, never blocks caller)
  if (!pgInitAttempted) {
    hydrateFromPg().catch(() => {});
  }
  if (pgStore) {
    pgStore.set(caseData).catch(() => {});
  } else {
    ensurePgStore().then((store) => {
      if (store) {
        pgStore = store;
        store.set(caseData).catch(() => {});
      }
    }).catch(() => {});
  }
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
  saveRaw({});
}
