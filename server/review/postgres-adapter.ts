import type pg from "pg";
import type { ConsentSqlExecutor } from "../consent/postgres-consent-repository.js";
import type { ReviewSqlExecutor } from "./postgres-review-release-reader.js";
import type { ReviewTransaction, ReviewTransactionExecutor } from "./postgres-review-writer.js";

type PoolLike = Pick<pg.Pool, "query" | "connect">;

export class PgLaunchControlExecutor implements ConsentSqlExecutor, ReviewSqlExecutor, ReviewTransactionExecutor {
  constructor(private readonly pool: PoolLike) {}

  async query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
    const result = await this.pool.query(text, values as unknown[] | undefined);
    return { rows: result.rows as Row[] };
  }

  async transaction<T>(work: (transaction: ReviewTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const transaction: ReviewTransaction = {
        query: async <Row = Record<string, unknown>>(text: string, values?: readonly unknown[]) => {
          const result = await client.query(text, values as unknown[] | undefined);
          return { rows: result.rows as Row[] };
        },
      };
      const value = await work(transaction);
      await client.query("commit");
      return value;
    } catch (error) {
      try { await client.query("rollback"); } catch { /* preserve the original failure */ }
      throw error;
    } finally {
      client.release();
    }
  }
}

const REQUIRED_TABLES = Object.freeze([
  "drivable_consent_events",
  "drivable_review_versions",
  "drivable_review_approvals",
  "drivable_review_rejections",
  "drivable_review_supersessions",
  "drivable_review_case_heads",
]);
const REQUIRED_TRIGGERS = Object.freeze([
  "drivable_consent_events_append_only",
  "drivable_consent_revocation_guard",
  "drivable_review_approvals_transition_guard",
  "drivable_review_rejections_transition_guard",
  "drivable_review_supersessions_transition_guard",
  "drivable_review_case_heads_guard",
]);

export type LaunchControlSchemaCheck = Readonly<{
  ready: boolean;
  missingTables: readonly string[];
  missingTriggers: readonly string[];
}>;

export async function verifyLaunchControlSchema(executor: Pick<ReviewSqlExecutor, "query">): Promise<LaunchControlSchemaCheck> {
  const tableRows = await executor.query<{ name: string }>(
    `select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=current_schema() and c.relkind='r' and c.relname = any($1::text[])`,
    [REQUIRED_TABLES],
  );
  const triggerRows = await executor.query<{ name: string }>(
    `select tgname as name from pg_trigger where not tgisinternal and tgname = any($1::text[])`,
    [REQUIRED_TRIGGERS],
  );
  const presentTables = new Set(tableRows.rows.map((row) => row.name));
  const presentTriggers = new Set(triggerRows.rows.map((row) => row.name));
  const missingTables = REQUIRED_TABLES.filter((name) => !presentTables.has(name));
  const missingTriggers = REQUIRED_TRIGGERS.filter((name) => !presentTriggers.has(name));
  return Object.freeze({ ready: !missingTables.length && !missingTriggers.length,
    missingTables: Object.freeze(missingTables), missingTriggers: Object.freeze(missingTriggers) });
}
