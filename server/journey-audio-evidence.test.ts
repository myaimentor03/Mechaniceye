import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createJourneyCase, advanceJourney } from "./journey-state-machine";
import { RuntimeFileEvidenceStore, verifiedAudioType } from "./evidence-storage";

function mp3Buffer(): Buffer {
  // ID3 header + padding — enough for verifiedAudioType
  return Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x01\x01", "binary"), Buffer.alloc(64, 0)]);
}

function wavBuffer(): Buffer {
  const header = Buffer.alloc(44, 0);
  header.write("RIFF", 0);
  header.writeUInt32LE(36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  return header;
}

describe("journey audio evidence — case-scoped persistence", () => {
  it("verifiedAudioType accepts mp3/wav and rejects non-audio bytes", () => {
    assert.equal(verifiedAudioType(mp3Buffer())?.mimeType, "audio/mpeg");
    assert.equal(verifiedAudioType(wavBuffer())?.mimeType, "audio/wav");
    assert.equal(verifiedAudioType(Buffer.from("not audio at all, just text")), null);
    assert.equal(verifiedAudioType(Buffer.alloc(0)), null);
  });

  it("advanceJourney preserves audio attachment fields and raises confidence", () => {
    let c = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Grinding noise when braking at low speeds",
      timing: "Braking",
    });
    const before = c.confidenceScore;
    c = advanceJourney(c, "submit_intake");
    c = advanceJourney(c, "request_evidence");

    const audioRecord = {
      id: "ev-audio123",
      kind: "audio" as const,
      addedAt: new Date().toISOString(),
      description: "grinding.mp3",
      originalName: "grinding.mp3",
      mimeType: "audio/mpeg",
      byteSize: 43210,
      storageKey: "evidence/JRN-123/grinding.mp3",
      attachmentId: "aud-123",
      status: "persisted" as const,
    };

    c = advanceJourney(c, "submit_evidence", { evidence: [audioRecord] });

    assert.equal(c.evidence.length, 1);
    assert.equal(c.evidence[0].kind, "audio");
    assert.equal(c.evidence[0].originalName, "grinding.mp3");
    assert.equal(c.evidence[0].mimeType, "audio/mpeg");
    assert.equal(c.evidence[0].attachmentId, "aud-123");
    assert.equal(c.evidence[0].status, "persisted");
    assert.ok(c.confidenceScore >= before, `audio should not lower confidence (${before} -> ${c.confidenceScore})`);
    assert.equal(c.state, "evidence_received");
  });

  it("RuntimeFileEvidenceStore persists audio for a JRN case id and merges with photo manifest", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "journey-audio-test-"));
    const store = new RuntimeFileEvidenceStore(tmpRoot);
    const caseId = "JRN-20260914-audio01";

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const photos = await store.savePhotos(caseId, [
      { originalname: "dash.png", mimetype: "image/png", buffer: pngHeader, size: pngHeader.length },
    ] as any);
    assert.equal(photos.length, 1);

    const mp3 = mp3Buffer();
    const audio = await store.saveAudio(caseId, [
      { originalname: "grinding.mp3", mimetype: "audio/mpeg", buffer: mp3, size: mp3.length },
    ] as any);
    assert.equal(audio.length, 1);
    assert.equal(audio[0].caseId, caseId);
    assert.equal(audio[0].kind, "audio");
    assert.equal(audio[0].mimeType, "audio/mpeg");
    assert.ok(audio[0].storageKey.startsWith(`evidence/${caseId}/`));
    assert.equal(audio[0].status, "persisted");
    assert.equal(audio[0].analysisStatus, "uploaded_not_analyzed");

    // Manifest must still contain the earlier photo — audio belongs to the same case.
    const manifest = JSON.parse(
      await fs.promises.readFile(path.join(tmpRoot, caseId, "attachments.json"), "utf8")
    );
    assert.equal(manifest.length, 2);
    assert.deepEqual(
      manifest.map((m: any) => m.kind).sort(),
      ["audio", "photo"]
    );

    // Both attachments retrievable, customer-scoped by case id.
    const gotAudio = await store.getAttachment(caseId, audio[0].id);
    assert.ok(gotAudio);
    assert.equal(gotAudio!.attachment.kind, "audio");
    const gotPhoto = await store.getAttachment(caseId, photos[0].id);
    assert.ok(gotPhoto);
    assert.equal(gotPhoto!.attachment.kind, "photo");

    // Rejects non-audio content truthfully without destroying existing evidence.
    await assert.rejects(
      () => store.saveAudio(caseId, [
        { originalname: "fake.mp3", mimetype: "audio/mpeg", buffer: Buffer.from("plain text, not audio"), size: 21 },
      ] as any),
      /not a supported audio type/
    );
    const manifestAfter = JSON.parse(
      await fs.promises.readFile(path.join(tmpRoot, caseId, "attachments.json"), "utf8")
    );
    assert.equal(manifestAfter.length, 2);

    await store.deleteCase(caseId);
    await fs.promises.rm(tmpRoot, { recursive: true, force: true });
  });
});
