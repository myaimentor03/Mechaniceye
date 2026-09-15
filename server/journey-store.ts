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

// In-memory cache initialized from disk
const cache = new Map<string, JourneyCase>(Object.entries(loadRaw()));

function flush(): void {
  const obj: Record<string, JourneyCase> = {};
  for (const [k, v] of cache.entries()) obj[k] = v;
  saveRaw(obj);
}

export function getJourneyCase(caseId: string): JourneyCase | undefined {
  return cache.get(caseId);
}

export function setJourneyCase(caseData: JourneyCase): void {
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
  saveRaw({});
}
