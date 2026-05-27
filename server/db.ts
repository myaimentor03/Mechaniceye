import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./shared/shared/schema";

const { Pool } = pg;

let pool: Pool | undefined;

type DatabaseHealthResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
    };

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  } as any);

  return drizzle({ client: pool, schema });
}

let cachedDb: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!cachedDb) {
    cachedDb = createDb();
  }

  return cachedDb;
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof createDb>];
  }
});

function redactDatabaseError(error: unknown) {
  let message = error instanceof Error ? error.message : "Unknown database error";
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return message;
  }

  message = message.replaceAll(databaseUrl, "[redacted]");

  try {
    const parsedUrl = new URL(databaseUrl);
    const sensitiveValues = [
      parsedUrl.username,
      parsedUrl.password,
      parsedUrl.host,
      parsedUrl.hostname,
      parsedUrl.pathname.replace(/^\//, "")
    ].filter(Boolean);

    for (const value of sensitiveValues) {
      message = message.replaceAll(value, "[redacted]");

      try {
        message = message.replaceAll(decodeURIComponent(value), "[redacted]");
      } catch {
        // Keep the encoded replacement above even if decoding is not possible.
      }
    }
  } catch {
    // The full env value was already redacted above.
  }

  return message.replace(
    /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@[^\s)'"<>]+/gi,
    "postgresql://[redacted]"
  );
}

export async function checkDatabaseConnection(): Promise<DatabaseHealthResult> {
  try {
    await getDb().execute(sql`select 1`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: redactDatabaseError(error) };
  }
}
