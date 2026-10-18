import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createJourneyCase, advanceJourney, isValidTransition } from "./journey-state-machine";

describe("journey incremental evidence — one action at a time, multiple items", () => {
  it("allows add_more_evidence from evidence_received and stays in evidence_received", () => {
    let c = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Grinding noise when braking at low speeds",
      timing: "Braking",
    });
    assert.equal(isValidTransition("evidence_received", "add_more_evidence"), true);
    c = advanceJourney(c, "submit_intake");
    c = advanceJourney(c, "request_evidence");
    c = advanceJourney(c, "submit_evidence", {
      evidence: [{ kind: "photo", description: "Brake rotor photo" }],
    });
    assert.equal(c.state, "evidence_received");
    assert.equal(c.evidence.length, 1);

    c = advanceJourney(c, "add_more_evidence", {
      evidence: [{ kind: "text", description: "Noise only at low speed, worse when cold" }],
    });
    assert.equal(c.state, "evidence_received");
    assert.equal(c.evidence.length, 2);
    assert.equal(c.evidence[1].kind, "text");

    // Confidence grows (or at least does not regress) with more evidence
    const afterFirst = c.confidenceScore;
    c = advanceJourney(c, "add_more_evidence", {
      evidence: [{ kind: "audio", description: "Grinding sound clip" }],
    });
    assert.equal(c.state, "evidence_received");
    assert.equal(c.evidence.length, 3);
    assert.ok(c.confidenceScore >= afterFirst, `confidence should not regress, got ${c.confidenceScore} < ${afterFirst}`);

    // Single next action remains evaluate
    assert.equal(c.nextAction, "evaluate");
    assert.ok((c.nextActionPrompt || "").length > 0);

    // Full path still resolves after incremental adds
    c = advanceJourney(c, "evaluate");
    c = advanceJourney(c, "ready_diagnosis");
    assert.equal(c.state, "diagnosis_ready");
    assert.ok(c.outcome, "Should have determined an outcome");
  });

  it("rejects add_more_evidence from evidence_requested (use submit_evidence there)", () => {
    assert.equal(isValidTransition("evidence_requested", "add_more_evidence"), false);
    assert.equal(isValidTransition("evidence_requested", "submit_evidence"), true);
  });

  it("preserves persisted attachment fields across incremental adds (case-owned)", () => {
    let c = createJourneyCase({
      vehicleInfo: "2020 Toyota RAV4",
      description: "Check engine light is on, car runs rough at idle",
      timing: "Idle",
    });
    c = advanceJourney(c, "submit_intake");
    c = advanceJourney(c, "request_evidence");
    c = advanceJourney(c, "submit_evidence", {
      evidence: [
        { kind: "photo", description: "dash.jpg", originalName: "dash.jpg", mimeType: "image/jpeg", byteSize: 1000, storageKey: "evidence/k1", attachmentId: "a1", status: "persisted" },
      ],
    });
    c = advanceJourney(c, "add_more_evidence", {
      evidence: [
        { kind: "photo", description: "engine.jpg", originalName: "engine.jpg", mimeType: "image/jpeg", byteSize: 2000, storageKey: "evidence/k2", attachmentId: "a2", status: "persisted" },
      ],
    });
    assert.equal(c.evidence.length, 2);
    assert.ok(c.evidence.every((e) => e.status === "persisted"));
    assert.equal(c.evidence[1].attachmentId, "a2");
  });
});
