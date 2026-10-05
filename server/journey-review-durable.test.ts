import assert from "node:assert/strict";
import test from "node:test";
import { JourneyReviewBridge } from "./journey-review-bridge";
import { createJourneyCase } from "./journey-state-machine";
import { PostgresReviewWriter, ReviewWriteError, type ReviewTransaction, type ReviewTransactionExecutor } from "./review/postgres-review-writer";
import { PostgresReviewReleaseReader } from "./review/postgres-review-release-reader";
import { InMemoryReviewRepository } from "./review/in-memory-review-repository";

// Transactional SQL test double shared across fresh repository instances.
class ReviewDatabase implements ReviewTransactionExecutor, ReviewTransaction {
  head = new Map<string, string>();
  versions = new Map<string, { stage: string; bindings: Record<string, unknown>; row: Record<string, unknown> }>();
  decisions = new Set<string>();
  superseded = new Set<string>();
  calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  failure: unknown;
  failApproval = false;
  failCommit = false;
  approvals = new Map<string, Record<string, unknown>>();
  inTransaction = false;

  async transaction<T>(work: (transaction: ReviewTransaction) => Promise<T>): Promise<T> {
    assert.equal(this.inTransaction, false);
    this.inTransaction = true;
    const snapshot = { head: new Map(this.head), versions: new Map(this.versions), decisions: new Set(this.decisions), superseded: new Set(this.superseded), approvals: new Map(this.approvals) };
    try {
      const result = await work(this);
      if (this.failCommit) throw new Error("commit failed");
      return result;
    } catch (error) { Object.assign(this, snapshot); throw error; }
    finally { this.inTransaction = false; }
  }

  async query<Row>(sql: string, values?: readonly unknown[]) {

    this.calls.push({ sql, values });
    if (this.failure) throw this.failure;
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] as Row[] };
    if (sql.includes("select version_id from drivable_review_case_heads")) {
      const version = this.head.get(String(values?.[0]));
      return { rows: (version ? [{ version_id: version }] : []) as Row[] };
    }
    if (sql.startsWith("insert into drivable_review_versions")) {
      this.versions.set(String(values?.[0]), { stage: String(values?.[2]), row: Object.fromEntries(["version_id","case_id","stage","initial_status","artifact_digest","recipient_digest","recipient_binding_version","policy_version","model_version","evidence_version","risk_level","mock","source_version_id","created_at"].map((key, i) => [key, values?.[i]])), bindings: {
        policy_version: values?.[7], model_version: values?.[8], evidence_version: values?.[9],
        recipient_digest: values?.[5], recipient_binding_version: values?.[6], risk_level: values?.[10],
      } });
      return { rows: [] as Row[] };
    }
    if (sql.includes("select stage from drivable_review_versions")) {
      const version = this.versions.get(String(values?.[0]));
      return { rows: (version ? [{ stage: version.stage }] : []) as Row[] };
    }
    if (sql.includes("select exists(select 1 from drivable_review_approvals")) {
      return { rows: [{ decided: this.decisions.has(String(values?.[0])) }] as Row[] };
    }
    if (sql.startsWith("select policy_version")) {
      const version = this.versions.get(String(values?.[0]));
      return { rows: (version ? [version.bindings] : []) as Row[] };
    }
    if (sql.startsWith("select version_id, case_id")) {
      const version = this.versions.get(String(values?.[0]));
      return { rows: (version ? [version.row] : []) as Row[] };
    }
    if (sql.startsWith("select a.approval_id")) return { rows: [this.approvals.get(String(values?.[0])) ?? {}] as Row[] };
    if (sql.startsWith("insert into drivable_review_approvals")) {
      if (this.failApproval) throw new Error("approval insert failed");
      this.approvals.set(String(values?.[1]), Object.fromEntries(["approval_id","version_id","case_id","approval_reviewer_ref","approved_at","approval_policy_version","approval_model_version","approval_evidence_version","approval_recipient_digest","approval_recipient_binding_version","approval_risk_level","high_risk_acknowledged"].map((key, i) => [key, values?.[i]])));
    }
    if (sql.startsWith("insert into drivable_review_approvals") || sql.startsWith("insert into drivable_review_rejections")) {
      this.decisions.add(String(values?.[1])); return { rows: [] as Row[] };
    }
    if (sql.startsWith("insert into drivable_review_supersessions")) {
      this.superseded.add(String(values?.[1])); return { rows: [] as Row[] };
    }
    if (sql.startsWith("insert into drivable_review_case_heads")) {
      this.head.set(String(values?.[0]), String(values?.[1])); return { rows: [] as Row[] };
    }
    if (sql.startsWith("delete from drivable_review_case_heads")) {
      if (this.head.get(String(values?.[0])) === String(values?.[1])) this.head.delete(String(values?.[0]));
      return { rows: [] as Row[] };
    }
    throw new Error(`Unexpected SQL in fake: ${sql}`);
  }
}

function bridge(database: ReviewDatabase) {
  return new JourneyReviewBridge({ requireDurable: true, runtimeProvider: async () => ({
    reader: new PostgresReviewReleaseReader(database), writer: new PostgresReviewWriter(database),
  }) });
}
function reviewCase() {
  return { ...createJourneyCase({ vehicleInfo: "2018 Honda Civic", description: "Grinding when braking", customerId: "customer-123", customerEmail: "owner@example.com" }), state: "human_review" as const, riskLevel: "low" as const, safetyTriggered: false };
}

test("durable Journey approval survives repository restart and permits release", async () => {
  const database = new ReviewDatabase(), first = bridge(database), caseData = reviewCase();
  await first.createReviewForCase(caseData);
  await first.finalizeReviewForCase(caseData);
  assert.equal((await first.checkReleaseAllowed(caseData)).allowed, false);
  const approval = await first.approveReview(caseData.id, "reviewer_12345678");
  const restarted = bridge(database);
  assert.equal((await restarted.getReviewStatus(caseData.id))?.reviewerRef, approval.reviewerRef);
  assert.equal((await restarted.getReviewStatus(caseData.id))?.reviewStatus, "approved");
  assert.equal((await restarted.checkReleaseAllowed(caseData)).allowed, true);
});

test("changed evidence cannot use a prior durable approval", async () => {
  const database = new ReviewDatabase(), review = bridge(database), caseData = reviewCase();
  caseData.evidence = [{ id: "evidence-1", kind: "photo", description: "Original brake photo" }];
  await review.createReviewForCase(caseData);
  await review.finalizeReviewForCase(caseData);
  await review.approveReview(caseData.id, "reviewer_12345678");
  const changed = { ...caseData, evidence: [{ ...caseData.evidence[0], description: "Different evidence" }] };
  assert.equal((await review.checkReleaseAllowed(changed)).allowed, false);
});

for (const failure of ["failApproval", "failCommit"] as const) {
  test(`Journey ${failure} rejects approval and blocks release after restart`, async () => {
    const database = new ReviewDatabase(), first = bridge(database), caseData = reviewCase();
    await first.createReviewForCase(caseData);
    await first.finalizeReviewForCase(caseData);
    database[failure] = true;
    await assert.rejects(first.approveReview(caseData.id, "reviewer_12345678"), (error) => error instanceof ReviewWriteError && error.code === "storage_unavailable");
    database[failure] = false;
    const restarted = bridge(database);
    assert.equal((await restarted.getReviewStatus(caseData.id))?.reviewStatus, "review_required");
    assert.equal((await restarted.checkReleaseAllowed(caseData)).allowed, false);
  });
}

test("production rejects ephemeral review and unavailable durable storage", async () => {
  const ephemeral = new JourneyReviewBridge({ repository: new InMemoryReviewRepository(), requireDurable: true });
  await assert.rejects(ephemeral.createReviewForCase(reviewCase()), /must be durable/);
  const database = new ReviewDatabase(); database.failure = new Error("database unavailable");
  await assert.rejects(bridge(database).checkReleaseAllowed(reviewCase()));
});


test("Journey approval endpoint reports write failure without resolving or releasing", async () => {
  const { default: express } = await import("express");
  const { createServer } = await import("node:http");
  const { registerJourneyRoutes } = await import("./journey-routes");
  const { setJourneyCase, getJourneyCase } = await import("./journey-store");
  const previousToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  const previousStore = process.env.JOURNEY_STORE_PATH;
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "journey-review-test-"));
  process.env.JOURNEY_STORE_PATH = join(directory, "cases.json");
  process.env.DRIVABLE_REVIEWER_TOKEN = "journey-durable-test-reviewer-token-with-at-least-32-characters";
  const database = new ReviewDatabase(), review = bridge(database), caseData = reviewCase();
  setJourneyCase(caseData);
  await review.createReviewForCase(caseData);
  await review.finalizeReviewForCase(caseData);
  database.failApproval = true;
  const app = express(); app.use(express.json()); registerJourneyRoutes(app, review);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/api/journey/review/${caseData.id}/approve`, {
      method: "POST", headers: { authorization: `Bearer ${process.env.DRIVABLE_REVIEWER_TOKEN}`, "content-type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 500);
    const body = await response.json() as { ok: boolean; approval?: unknown };
    assert.equal(body.ok, false); assert.equal(body.approval, undefined);
    assert.equal(getJourneyCase(caseData.id)?.state, "human_review");
    assert.equal((await bridge(database).getReviewStatus(caseData.id))?.reviewStatus, "review_required");
    assert.equal((await bridge(database).checkReleaseAllowed(caseData)).allowed, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = previousToken;
    if (previousStore === undefined) delete process.env.JOURNEY_STORE_PATH; else process.env.JOURNEY_STORE_PATH = previousStore;
    await rm(directory, { recursive: true });
  }
});


test("approval retry reuses durable approval after a failed case-resolution write", async () => {
  const { default: express } = await import("express");
  const { createServer } = await import("node:http");
  const { registerJourneyRoutes } = await import("./journey-routes");
  const { JourneyStorageUnavailableError } = await import("./journey-store-pg");
  const previousToken = process.env.DRIVABLE_REVIEWER_TOKEN;
  process.env.DRIVABLE_REVIEWER_TOKEN = "journey-durable-test-reviewer-token-with-at-least-32-characters";
  const database = new ReviewDatabase(), review = bridge(database), caseData = reviewCase();
  let stored: import("./journey-state-machine").JourneyCase = caseData;
  let failWrite = true;
  const storage = {
    get: async () => stored, listAll: async () => [stored], listByCustomer: async () => [stored],
    set: async (candidate: import("./journey-state-machine").JourneyCase) => {
      if (failWrite) throw new JourneyStorageUnavailableError();
      stored = candidate;
    },
  };
  const app = express(); app.use(express.json()); registerJourneyRoutes(app, review, storage);
  const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/journey/review/${caseData.id}/approve`;
    const request = { method: "POST", headers: { authorization: `Bearer ${process.env.DRIVABLE_REVIEWER_TOKEN}`, "content-type": "application/json" }, body: "{}" };
    const first = await fetch(url, request);
    assert.equal(first.status, 503);
    assert.equal(stored.state, "human_review");
    assert.equal((await review.getReviewStatus(caseData.id))?.reviewStatus, "approved");
    assert.equal(database.approvals.size, 1);
    failWrite = false;
    const second = await fetch(url, request);
    assert.equal(second.status, 200);
    const body = await second.json() as { ok: boolean; case: { state: string } };
    assert.equal(body.ok, true); assert.equal(body.case.state, "resolved");
    assert.equal(database.approvals.size, 1, "retry must not record a duplicate review approval");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousToken === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = previousToken;
  }
});
