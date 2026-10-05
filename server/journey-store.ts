import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { JourneyCase } from "./journey-state-machine";
import { JourneyStorageUnavailableError, type PgJourneyStore } from "./journey-store-pg";

const DEFAULT_STORE_PATH = path.join(process.cwd(), "data", "journey-store.json");

function storePath(): string {
  return process.env.JOURNEY_STORE_PATH?.trim() || DEFAULT_STORE_PATH;
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
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, p);
  } catch {
    throw new JourneyStorageUnavailableError();
  }
}

// In-memory cache initialized from disk
const cache = new Map<string, JourneyCase>(process.env.NODE_ENV === "production" ? [] : Object.entries(loadRaw()));

function assertLocalStorageAllowed(): void {
  if (process.env.NODE_ENV === "production") throw new JourneyStorageUnavailableError();
}

/** Synchronous development/test access. Production uses the async facade below. */
export function getJourneyCase(caseId: string): JourneyCase | undefined {
  assertLocalStorageAllowed();
  return cache.get(caseId);
}

export function setJourneyCase(caseData: JourneyCase): void {
  assertLocalStorageAllowed();
  const next = Object.fromEntries(cache);
  next[caseData.id] = caseData;
  saveRaw(next);
  cache.set(caseData.id, caseData);
}

export function listJourneyCasesByCustomer(customerId: string): JourneyCase[] {
  assertLocalStorageAllowed();
  const out: JourneyCase[] = [];
  for (const c of cache.values()) {
    if (c.customerId === customerId) out.push(c);
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export function listAllJourneyCases(): JourneyCase[] {
  assertLocalStorageAllowed();
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

export interface JourneyCaseStorage {
  get(caseId: string): Promise<JourneyCase | undefined>;
  set(caseData: JourneyCase): Promise<void>;
  listByCustomer(customerId: string): Promise<JourneyCase[]>;
  listAll(): Promise<JourneyCase[]>;
}

export function createJourneyCaseStorage(options: {
  useDatabase: () => boolean;
  database: () => Promise<PgJourneyStore>;
}): JourneyCaseStorage {
  async function database(): Promise<PgJourneyStore> {
    try { return await options.database(); }
    catch { throw new JourneyStorageUnavailableError(); }
  }
  return {
    async get(id) {
      return options.useDatabase() ? (await database()).get(id) : getJourneyCase(id);
    },
    async set(caseData) {
      if (options.useDatabase()) await (await database()).set(caseData);
      else setJourneyCase(caseData);
    },
    async listByCustomer(id) {
      return options.useDatabase() ? (await database()).listByCustomer(id) : listJourneyCasesByCustomer(id);
    },
    async listAll() {
      return options.useDatabase() ? (await database()).listAll() : listAllJourneyCases();
    },
  };
}

let postgres: PgJourneyStore | undefined;
export const journeyCaseStorage = createJourneyCaseStorage({
  useDatabase: () => process.env.NODE_ENV === "production" || Boolean(process.env.DATABASE_URL?.trim()),
  database: async () => {
    if (!process.env.DATABASE_URL?.trim()) throw new JourneyStorageUnavailableError();
    if (!postgres) {
      const { getPool } = await import("./db");
      const { createPgJourneyStore } = await import("./journey-store-pg");
      const pool = getPool();
      postgres = createPgJourneyStore({ query: async (text, values) => ({ rows: (await pool.query(text, values)).rows }) });
    }
    return postgres;
  },
});
