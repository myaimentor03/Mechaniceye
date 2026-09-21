import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPgJourneyStore } from "./journey-store-pg";
import { createJourneyCase } from "./journey-state-machine";

/**
 * Simplified in-memory SQL executor for testing the PG journey store.
 * Uses a Map<string, Record<string, unknown>> to simulate table storage
 * and pattern-matches trimmed SQL to dispatch operations.
 */
function createFakeExecutor() {
  const table = new Map<string, Record<string, unknown>>();

  return {
    table,
    executor: {
      async query(text: string, values?: unknown[]) {
        const sql = text.replace(/\s+/g, " ").trim();

        if (sql.includes("information_schema.tables")) {
          return { rows: [{ "1": 1 }] };
        }

        if (sql.startsWith("insert into journey_cases")) {
          const row: Record<string, unknown> = {};
          const cols = [
            "id", "state", "created_at", "updated_at", "vehicle_info", "description",
            "timing", "urgency", "can_drive", "customer_id", "customer_email",
          ];
          for (let i = 0; i < cols.length; i++) {
            row[cols[i]] = values?.[i] ?? null;
          }
          // JSONB params come after the text params
          const jsonbCols = [
            "evidence", "safety_flags", "safety_triggered", "confidence_score",
            "confidence_level", "risk_level", "outcome", "decision_path",
            "resolution_note", "human_review_requested", "escalation_reason",
            "next_action", "next_action_prompt", "matched_symptom_categories",
            "planned_evidence", "current_evidence_prompt",
          ];
          for (let i = 0; i < jsonbCols.length; i++) {
            const val = values?.[11 + i];
            const col = jsonbCols[i];
            if (col === "evidence" || col === "safety_flags" || col === "matched_symptom_categories" || col === "planned_evidence") {
              row[col] = typeof val === "string" ? JSON.parse(val) : val;
            } else {
              row[col] = val;
            }
          }
          table.set(String(row.id), row);
          return { rows: [] };
        }

        if (sql.startsWith("select * from journey_cases where id")) {
          const id = values?.[0] as string;
          const row = table.get(id);
          return { rows: row ? [row] : [] };
        }

        if (sql.startsWith("select * from journey_cases where customer_id")) {
          const customerId = values?.[0] as string;
          const matching = Array.from(table.values())
            .filter((r) => r.customer_id === customerId)
            .sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1));
          return { rows: matching };
        }

        if (sql.startsWith("select * from journey_cases order by")) {
          const all = Array.from(table.values())
            .sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1));
          return { rows: all };
        }

        if (sql.includes("count(*)")) {
          return { rows: [{ cnt: table.size }] };
        }

        return { rows: [] };
      },
    },
  };
}

describe("journey-store-pg", () => {
  let store: ReturnType<typeof createPgJourneyStore>;
  let fake: ReturnType<typeof createFakeExecutor>;

  beforeEach(() => {
    fake = createFakeExecutor();
    store = createPgJourneyStore(fake.executor);
  });

  it("returns undefined for non-existent case", async () => {
    const result = await store.get("JRN-nonexistent");
    assert.equal(result, undefined);
  });

  it("round-trips a case through set and get", async () => {
    const caseData = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Car makes a grinding noise when braking at low speeds",
      timing: "Braking",
      urgency: "Safe to Drive",
      canDrive: "Yes",
    });

    await store.set(caseData);
    const retrieved = await store.get(caseData.id);

    assert.ok(retrieved, "case should be retrievable after set");
    assert.equal(retrieved.id, caseData.id);
    assert.equal(retrieved.state, caseData.state);
    assert.equal(retrieved.vehicleInfo, "2018 Honda Civic");
    assert.equal(retrieved.description, "Car makes a grinding noise when braking at low speeds");
    assert.equal(retrieved.timing, "Braking");
    assert.equal(retrieved.urgency, "Safe to Drive");
    assert.equal(retrieved.canDrive, "Yes");
    assert.equal(retrieved.safetyTriggered, false);
    assert.equal(retrieved.confidenceScore, caseData.confidenceScore);
    assert.equal(retrieved.confidenceLevel, caseData.confidenceLevel);
  });

  it("persists evidence records", async () => {
    const caseData = createJourneyCase({
      vehicleInfo: "2020 Toyota Camry",
      description: "Check engine light is on and car shakes at highway speeds",
      timing: "Highway Speed",
    });

    caseData.evidence = [
      {
        id: "ev-test-001",
        kind: "photo",
        addedAt: new Date().toISOString(),
        description: "Dashboard warning light",
        status: "persisted",
        mimeType: "image/jpeg",
        byteSize: 1024000,
      },
      {
        id: "ev-test-002",
        kind: "text",
        addedAt: new Date().toISOString(),
        description: "Shaking starts above 60mph",
        status: "text_only",
      },
    ];

    await store.set(caseData);
    const retrieved = await store.get(caseData.id);

    assert.ok(retrieved, "case should be retrievable");
    assert.equal(retrieved.evidence.length, 2);
    assert.equal(retrieved.evidence[0].kind, "photo");
    assert.equal((retrieved.evidence[0] as any).status, "persisted");
    assert.equal(retrieved.evidence[1].kind, "text");
  });

  it("persists safety flags and matched symptoms", async () => {
    const caseData = createJourneyCase({
      vehicleInfo: "2019 Ford F-150",
      description: "Brakes failed completely, cannot stop the truck",
      urgency: "Not Safe to Drive",
    });

    await store.set(caseData);
    const retrieved = await store.get(caseData.id);

    assert.ok(retrieved, "case should be retrievable");
    assert.equal(retrieved.safetyTriggered, true);
    assert.ok(retrieved.safetyFlags.length > 0);
    assert.ok(retrieved.safetyFlags.some((f) => (f as any).triggerId === "brakes"));
    assert.equal(retrieved.state, "escalation_required");
  });

  it("updates a case (upsert)", async () => {
    const caseData = createJourneyCase({
      vehicleInfo: "2017 Subaru Outback",
      description: "Oil light flickering at idle, low oil pressure warning",
    });

    await store.set(caseData);

    caseData.state = "triage";
    caseData.confidenceScore = 50;
    caseData.updatedAt = new Date().toISOString();
    await store.set(caseData);

    const retrieved = await store.get(caseData.id);
    assert.ok(retrieved, "case should be retrievable after update");
    assert.equal(retrieved.state, "triage");
    assert.equal(retrieved.confidenceScore, 50);
  });

  it("lists cases by customer", async () => {
    const case1 = createJourneyCase({
      vehicleInfo: "2020 Honda Civic",
      description: "Car pulls to the left when braking at highway speeds",
      customerId: "cust-abc",
    });
    const case2 = createJourneyCase({
      vehicleInfo: "2019 Toyota RAV4",
      description: "Transmission slipping between second and third gear",
      customerId: "cust-abc",
    });
    const case3 = createJourneyCase({
      vehicleInfo: "2021 Ford Explorer",
      description: "AC blowing warm air, compressor clicking noise",
      customerId: "cust-other",
    });

    await store.set(case1);
    await store.set(case2);
    await store.set(case3);

    const results = await store.listByCustomer("cust-abc");
    assert.equal(results.length, 2);
    assert.ok(results.every((c) => c.customerId === "cust-abc"));
  });

  it("lists all cases", async () => {
    const case1 = createJourneyCase({
      vehicleInfo: "2018 Honda Accord",
      description: "Brake pedal feels spongy, reduced stopping power",
    });
    const case2 = createJourneyCase({
      vehicleInfo: "2020 Chevrolet Malibu",
      description: "Battery dying overnight, electrical parasitic draw suspected",
    });

    await store.set(case1);
    await store.set(case2);

    const all = await store.listAll();
    assert.equal(all.length, 2);
  });

  it("returns empty array for listByCustomer with no matches", async () => {
    const results = await store.listByCustomer("nonexistent-customer");
    assert.equal(results.length, 0);
  });

  it("returns size correctly", async () => {
    assert.equal(await store.size(), 0);

    const case1 = createJourneyCase({
      vehicleInfo: "2015 Nissan Altima",
      description: "Engine misfiring, rough idle and poor acceleration",
    });
    await store.set(case1);
    assert.equal(await store.size(), 1);

    const case2 = createJourneyCase({
      vehicleInfo: "2022 Hyundai Tucson",
      description: "Grinding noise when turning left at low speeds",
    });
    await store.set(case2);
    assert.equal(await store.size(), 2);
  });

  it("handles nullable fields correctly", async () => {
    const caseData = createJourneyCase({
      vehicleInfo: "2021 BMW X5",
      description: "Intermittent electrical issue, dashboard lights flickering randomly",
    });

    assert.equal(caseData.timing, undefined);
    assert.equal(caseData.urgency, undefined);
    assert.equal(caseData.canDrive, undefined);
    assert.equal(caseData.customerId, undefined);
    assert.equal(caseData.outcome, undefined);
    assert.equal(caseData.resolutionNote, undefined);
    assert.equal(caseData.escalationReason, undefined);

    await store.set(caseData);
    const retrieved = await store.get(caseData.id);

    assert.ok(retrieved, "case should be retrievable");
    assert.equal(retrieved.timing, undefined);
    assert.equal(retrieved.urgency, undefined);
    assert.equal(retrieved.canDrive, undefined);
  });
});
