import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createJourneyCase, advanceJourney } from "./journey-state-machine";
import { RuntimeFileEvidenceStore, verifiedVibrationType } from "./evidence-storage";

function vibrationBuffer(sampleCount: number = 50): Buffer {
  const samples = Array.from({ length: sampleCount }, (_, i) => ({
    x: Math.sin(i * 0.1) * 9.81,
    y: Math.cos(i * 0.1) * 9.81,
    z: 9.81 + Math.sin(i * 0.05) * 0.5,
    t: Date.now() + i * 20,
  }));
  return Buffer.from(JSON.stringify({ samples }), "utf8");
}

function invalidVibrationBuffer(): Buffer {
  return Buffer.from(JSON.stringify({ notSamples: "invalid" }), "utf8");
}

describe("journey vibration evidence — case-scoped persistence", () => {
  it("verifiedVibrationType accepts valid sensor JSON and rejects invalid payloads", () => {
    assert.ok(verifiedVibrationType(vibrationBuffer(10)) !== null, "Should accept valid vibration data");
    assert.ok(verifiedVibrationType(vibrationBuffer(2)) !== null, "Should accept minimum sample count");
    assert.ok(verifiedVibrationType(vibrationBuffer(20000)) !== null, "Should accept maximum sample count");
    assert.equal(verifiedVibrationType(invalidVibrationBuffer()), null, "Should reject invalid structure");
    assert.equal(verifiedVibrationType(Buffer.from("not json at all")), null, "Should reject non-JSON");
    assert.equal(verifiedVibrationType(Buffer.alloc(0)), null, "Should reject empty buffer");
  });

  it("advanceJourney preserves vibration attachment fields and raises confidence", () => {
    let c = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Steering wheel vibrates at highway speeds",
      timing: "Highway",
    });
    const before = c.confidenceScore;
    c = advanceJourney(c, "submit_intake");
    c = advanceJourney(c, "request_evidence");

    const vibrationRecord = {
      id: "ev-vib123",
      kind: "vibration" as const,
      addedAt: new Date().toISOString(),
      description: "highway_vibration.json",
      originalName: "highway_vibration.json",
      mimeType: "application/json",
      byteSize: 43210,
      storageKey: "evidence/JRN-123/highway_vibration.json",
      attachmentId: "vib-123",
      status: "persisted" as const,
    };

    c = advanceJourney(c, "submit_evidence", { evidence: [vibrationRecord] });

    assert.equal(c.evidence.length, 1);
    assert.equal(c.evidence[0].kind, "vibration");
    assert.equal(c.evidence[0].originalName, "highway_vibration.json");
    assert.equal(c.evidence[0].mimeType, "application/json");
    assert.equal(c.evidence[0].attachmentId, "vib-123");
    assert.equal(c.evidence[0].status, "persisted");
    assert.ok(c.confidenceScore >= before, `vibration should not lower confidence (${before} -> ${c.confidenceScore})`);
    assert.equal(c.state, "evidence_received");
  });

  it("RuntimeFileEvidenceStore persists vibration for a JRN case id and merges with photo manifest", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "journey-vibration-test-"));
    const store = new RuntimeFileEvidenceStore(tmpRoot);
    const caseId = "JRN-20260914-vib01";

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const photos = await store.savePhotos(caseId, [
      { originalname: "dash.png", mimetype: "image/png", buffer: pngHeader, size: pngHeader.length },
    ] as any);
    assert.equal(photos.length, 1);

    const vibData = vibrationBuffer(100);
    const vibration = await store.saveVibration(caseId, [
      { originalname: "highway_vib.json", mimetype: "application/json", buffer: vibData, size: vibData.length },
    ] as any);
    assert.equal(vibration.length, 1);
    assert.equal(vibration[0].caseId, caseId);
    assert.equal(vibration[0].kind, "vibration");
    assert.equal(vibration[0].mimeType, "application/json");
    assert.ok(vibration[0].storageKey.startsWith(`evidence/${caseId}/`));
    assert.equal(vibration[0].status, "persisted");
    assert.equal(vibration[0].analysisStatus, "uploaded_not_analyzed");
    assert.ok(vibration[0].provenance === "uploaded_media");

    // Manifest must still contain the earlier photo — vibration belongs to the same case.
    const manifest = JSON.parse(
      await fs.promises.readFile(path.join(tmpRoot, caseId, "attachments.json"), "utf8")
    );
    assert.equal(manifest.length, 2);
    assert.deepEqual(
      manifest.map((m: any) => m.kind).sort(),
      ["photo", "vibration"]
    );

    // Both attachments retrievable, customer-scoped by case id.
    const gotVibration = await store.getAttachment(caseId, vibration[0].id);
    assert.ok(gotVibration);
    assert.equal(gotVibration!.attachment.kind, "vibration");
    const gotPhoto = await store.getAttachment(caseId, photos[0].id);
    assert.ok(gotPhoto);
    assert.equal(gotPhoto!.attachment.kind, "photo");

    // Rejects non-vibration content truthfully without destroying existing evidence.
    await assert.rejects(
      () => store.saveVibration(caseId, [
        { originalname: "fake.json", mimetype: "application/json", buffer: Buffer.from('{"invalid": "data"}'), size: 18 },
      ] as any),
      /not a supported vibration format/
    );
    const manifestAfter = JSON.parse(
      await fs.promises.readFile(path.join(tmpRoot, caseId, "attachments.json"), "utf8")
    );
    assert.equal(manifestAfter.length, 2);

    await store.deleteCase(caseId);
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  });
});