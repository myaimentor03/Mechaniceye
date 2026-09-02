import assert from "node:assert/strict";
import test from "node:test";
import { PgLaunchControlExecutor, verifyLaunchControlSchema } from "./postgres-adapter.js";

test("transaction commits successful work and always releases the client", async () => {
  const calls: string[] = [];
  const client = { async query(text: string) { calls.push(text); return { rows: [] }; }, release() { calls.push("release"); } };
  const executor = new PgLaunchControlExecutor({ async query() { return { rows: [] } as any; }, async connect() { return client as any; } } as any);
  const result = await executor.transaction(async (tx) => { await tx.query("review mutation"); return "ok"; });
  assert.equal(result, "ok");
  assert.deepEqual(calls, ["begin", "review mutation", "commit", "release"]);
});

test("transaction rolls back failures and preserves the original error", async () => {
  const calls: string[] = [];
  const client = { async query(text: string) { calls.push(text); return { rows: [] }; }, release() { calls.push("release"); } };
  const executor = new PgLaunchControlExecutor({ async query() { return { rows: [] } as any; }, async connect() { return client as any; } } as any);
  const failure = new Error("mutation failed");
  await assert.rejects(executor.transaction(async () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(calls, ["begin", "rollback", "release"]);
});

test("schema verification fails closed and names only missing structural controls", async () => {
  let call = 0;
  const result = await verifyLaunchControlSchema({ async query() {
    call += 1;
    return { rows: call === 1 ? [{ name: "drivable_consent_events" }] : [{ name: "drivable_consent_events_append_only" }] } as any;
  } });
  assert.equal(result.ready, false);
  assert.ok(result.missingTables.includes("drivable_review_versions"));
  assert.ok(result.missingTriggers.includes("drivable_review_case_heads_guard"));
  assert.equal(JSON.stringify(result).includes("DATABASE_URL"), false);
});
