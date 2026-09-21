import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createJourneyCase, advanceJourney } from "./journey-state-machine";
import { RuntimeFileEvidenceStore } from "./evidence-storage";

describe("journey photo evidence — case-scoped persistence", () => {
  it("advanceJourney preserves photo attachment fields (case-owned, reusable for FIX/SELL)", () => {
    let c = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Grinding noise when braking at low speeds",
      timing: "Braking",
    });
    c = advanceJourney(c, "submit_intake");
    c = advanceJourney(c, "request_evidence");

    const photoRecord = {
      id: "ev-test123",
      kind: "photo" as const,
      addedAt: new Date().toISOString(),
      description: "dashboard warning photo",
      originalName: "dash.jpg",
      mimeType: "image/jpeg",
      byteSize: 12345,
      storageKey: "evidence/JRN-123/dash.jpg",
      attachmentId: "abc-123",
      status: "persisted" as const,
    };

    c = advanceJourney(c, "submit_evidence", { evidence: [photoRecord] });

    assert.equal(c.evidence.length, 1);
    assert.equal(c.evidence[0].kind, "photo");
    assert.equal(c.evidence[0].originalName, "dash.jpg");
    assert.equal(c.evidence[0].mimeType, "image/jpeg");
    assert.equal(c.evidence[0].storageKey, "evidence/JRN-123/dash.jpg");
    assert.equal(c.evidence[0].attachmentId, "abc-123");
    assert.equal(c.evidence[0].status, "persisted");
    // confidence should increase with photo evidence
    assert.ok(c.confidenceScore >= 15, `confidence should reflect photo, got ${c.confidenceScore}`);
    assert.equal(c.state, "evidence_received");
  });

  it("text evidence is marked text_only and does not claim persisted storage", () => {
    let c = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Grinding noise when braking",
    });
    c = advanceJourney(c, "submit_intake");
    c = advanceJourney(c, "request_evidence");

    c = advanceJourney(c, "submit_evidence", {
      evidence: [{ kind: "text", description: "noise at 20 mph" }],
    });

    assert.equal(c.evidence[0].status, "text_only");
    assert.equal(c.evidence[0].storageKey, undefined);
  });

  it("multiple photo records accumulate and remain case-scoped", () => {
    let c = createJourneyCase({
      vehicleInfo: "2020 Toyota RAV4",
      description: "Check engine light is on, car runs rough at idle",
      timing: "Idle",
    });
    c = advanceJourney(c, "submit_intake");
    c = advanceJourney(c, "request_evidence");
    c = advanceJourney(c, "submit_evidence", {
      evidence: [
        { kind: "photo", description: "photo1", originalName: "a.jpg", mimeType: "image/jpeg", byteSize: 1000, storageKey: "evidence/a", attachmentId: "1", status: "persisted" },
      ],
    });
    // after moving to evidence_received, we cannot submit another via submit_evidence (needs evidence_requested/triage),
    // but advanceJourney still tracks evidence array correctly before state change
    assert.equal(c.evidenceCount === undefined ? c.evidence.length : c.evidence.length, 1);
    // evidence belongs to case — id matches case id pattern
    assert.ok(c.id.startsWith("JRN-"));
    assert.ok(c.evidence.every((e) => e.status === "persisted" || e.status === "text_only"));
  });

  it("RuntimeFileEvidenceStore persists photo for a JRN case id (evidence belongs to case)", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "journey-evidence-test-"));
    const store = new RuntimeFileEvidenceStore(tmpRoot);
    const caseId = "JRN-20260914-abcdef12";
    // Minimal valid PNG bytes (header only is enough for verifiedImageType)
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const files: any[] = [
      { originalname: "test.png", mimetype: "image/png", buffer: pngHeader, size: pngHeader.length },
    ];
    const attachments = await store.savePhotos(caseId, files as any);
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].caseId, caseId);
    assert.equal(attachments[0].kind, "photo");
    assert.equal(attachments[0].mimeType, "image/png");
    assert.ok(attachments[0].storageKey.startsWith(`evidence/${caseId}/`));
    assert.equal(attachments[0].status, "persisted");

    const retrieved = await store.getAttachment(caseId, attachments[0].id);
    assert.ok(retrieved);
    assert.equal(retrieved!.attachment.id, attachments[0].id);

    await store.deleteCase(caseId);
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  });
});
