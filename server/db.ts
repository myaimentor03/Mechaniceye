import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./shared/shared/schema";

neonConfig.webSocketConstructor = ws;

let pool: Pool | undefined;

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

export async function checkDatabaseConnection() {
  try {
    await getDb().execute(sql`select 1`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
