import { eq } from "drizzle-orm";
import { drivableEvidenceAttachments } from "../shared/schema";
import { logEvent, logEventError } from "./observability/safe-log";
import { getDb } from "./db";
import type { EvidenceAttachment } from "../shared/drivableEvidence";

export type EvidenceDbPersistResult =
  | { ok: true; inserted: number }
  | { ok: false; error: string };

function errorMessage(error: unknown) {
  let message = error instanceof Error ? error.message : "Unknown database error";
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    message = message.replaceAll(databaseUrl, "[redacted]");
  }
  return message;
}

/**
 * Persist evidence attachment metadata to the database.
 * Called after files are saved to the filesystem/S3 EvidenceStore so the DB has
 * a durable record of every attachment even if the manifest file is lost.
 */
export async function persistEvidenceAttachments(
  attachments: EvidenceAttachment[],
): Promise<EvidenceDbPersistResult> {
  if (attachments.length === 0) {
    return { ok: true, inserted: 0 };
  }

  try {
    const values = attachments.map((a) => ({
      id: a.id,
      caseId: a.caseId,
      kind: a.kind,
      originalName: a.originalName,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
      status: a.status,
      storageKey: a.storageKey,
      provenance: a.provenance,
      analysisStatus: a.analysisStatus,
      notes: a.notes ?? null,
      createdAt: new Date(a.createdAt),
    }));

    await getDb()
      .insert(drivableEvidenceAttachments)
      .values(values)
      .onConflictDoNothing({ target: drivableEvidenceAttachments.id });

    logEvent("evidence_db.persisted", { caseId: attachments[0].caseId, count: attachments.length });
    return { ok: true, inserted: attachments.length };
  } catch (error) {
    const msg = errorMessage(error);
    logEventError("evidence_db.persist_failed", error, { caseId: attachments[0]?.caseId });
    return { ok: false, error: msg };
  }
}

/**
 * List evidence attachments from the database for a given case.
 * Returns an empty array if no records exist.
 */
export async function listEvidenceAttachmentsFromDb(
  caseId: string,
): Promise<EvidenceAttachment[]> {
  try {
    const rows = await getDb()
      .select()
      .from(drivableEvidenceAttachments)
      .where(eq(drivableEvidenceAttachments.caseId, caseId));

    return rows.map((r) => ({
      id: r.id,
      caseId: r.caseId,
      kind: r.kind as EvidenceAttachment["kind"],
      originalName: r.originalName,
      mimeType: r.mimeType,
      byteSize: r.byteSize,
      status: r.status as EvidenceAttachment["status"],
      serverAttachmentId: r.id,
      storageKey: r.storageKey,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      provenance: r.provenance as EvidenceAttachment["provenance"],
      analysisStatus: r.analysisStatus as EvidenceAttachment["analysisStatus"],
      notes: r.notes ?? undefined,
    }));
  } catch (error) {
    logEventError("evidence_db.list_failed", error, { caseId });
    return [];
  }
}
