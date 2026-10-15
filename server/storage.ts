import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { diagnoses, followUpRequests } from "./shared/shared/schema";
import { drivableEvidenceAttachments } from "../shared/schema";
import type { EvidenceAttachment } from "../shared/drivableEvidence.js";

type DiagnosisRow = typeof diagnoses.$inferSelect;

/**
 * Raised by operations that have no durable implementation. These previously
 * returned `{ success: true }` after storing nothing, which reported a
 * completed action for work that was never performed.
 */
export class CapabilityNotAvailableError extends Error {
  readonly code = "CAPABILITY_NOT_AVAILABLE";
  readonly capability: string;
  constructor(capability: string, message: string) {
    super(message);
    this.name = "CapabilityNotAvailableError";
    this.capability = capability;
  }
}

export function mapDiagnosisRowToRecord(row: DiagnosisRow): DiagnosisRecord {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : typeof row.createdAt === "string"
        ? row.createdAt
        : new Date().toISOString();

  return {
    id: row.id,
    userId: row.userId ?? undefined,
    vehicleInfo: row.vehicleInfo ?? undefined,
    description: row.description ?? undefined,
    timing: row.timing ?? undefined,
    audioFile: row.audioFile ?? null,
    videoFile: row.videoFile ?? null,
    vibrationData: row.vibrationData ?? null,
    photoAttachmentIds: [],
    confidenceScore: row.confidenceScore ?? 0,
    confidenceLevel: row.confidenceLevel ?? "low",
    inputTypes: Array.isArray(row.inputTypes) ? row.inputTypes : [],
    iterationCount: row.iterationCount ?? 1,
    primaryDiagnosis: (row.primaryDiagnosis as DiagnosisRecord["primaryDiagnosis"]) ?? null,
    alternativeScenarios: (row.alternativeScenarios as DiagnosisRecord["alternativeScenarios"]) ?? [],
    status: row.isResolved === true ? "resolved" : "received",
    createdAt,
  };
}

type DiagnosisRecord = {
  id: string;
  userId?: string;
  vehicleInfo?: string;
  description?: string;
  timing?: string;
  audioFile?: string | null;
  videoFile?: string | null;
  vibrationData?: unknown;
  photoAttachmentIds?: string[];
  confidenceScore?: number;
  confidenceLevel?: string;
  inputTypes?: string[];
  iterationCount?: number;
  primaryDiagnosis?: { title?: string; confidence?: number } | null;
  alternativeScenarios?: Array<{ title?: string }>;
  status?: string;
  attachments?: EvidenceAttachment[];
  evidenceSummary?: Record<string, { provided: number; persisted: number; status: string }>;
  createdAt: string;
};

type FollowUpRecord = {
  id: string;
  originalDiagnosisId: string;
  userId?: string;
  additionalInfo?: string;
  newAudioFile?: string | null;
  newVideoFile?: string | null;
  newVibrationData?: unknown;
  photoAttachmentIds?: string[];
  createdAt: string;
};

type ConsultationRecord = {
  id: string;
  diagnosisId: string;
  mechanicId: string;
  userId?: string;
  status: string;
  overallScore?: string;
  completedAt?: Date | string;
  politenessRating?: number;
  effectivenessRating?: number;
  easeOfWorkRating?: number;
  wasFixed?: boolean;
};

class LocalStorage {
  private diagnoses = new Map<string, DiagnosisRecord>();
  private followUps = new Map<string, FollowUpRecord[]>();

  private async dbDiagnoses(): Promise<DiagnosisRecord[]> {
    try {
      const rows = await getDb().select().from(diagnoses).limit(500);
      return rows.map(mapDiagnosisRowToRecord);
    } catch {
      return [];
    }
  }

  async getRecentDiagnoses(limit: number) {
    const local = Array.from(this.diagnoses.values());
    const remote = await this.dbDiagnoses();
    const merged = new Map<string, DiagnosisRecord>();
    for (const record of remote) merged.set(record.id, record);
    for (const record of local) merged.set(record.id, record);
    return Array.from(merged.values())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  }

  async getFixHistory(_diagnosisId: string) {
    // No durable fix-history table exists. Returning [] would be
    // indistinguishable from "this case genuinely has no fix history", so the
    // absence of the capability is reported instead of fabricated data.
    throw new CapabilityNotAvailableError(
      "fix_history",
      "Fix history is not recorded by this release.",
    );
  }

  async updateStepCompletion(_diagnosisId: string, _data: any): Promise<never> {
    throw new CapabilityNotAvailableError(
      "step_completion",
      "Repair step completion is not recorded by this release.",
    );
  }

  async markFixComplete(_diagnosisId: string, _data: any): Promise<never> {
    throw new CapabilityNotAvailableError(
      "fix_completion",
      "Repair completion is not recorded by this release.",
    );
  }

  async exportChatForMechanic(diagnosisId: string) {
    const diagnosis = this.diagnoses.get(diagnosisId);
    if (!diagnosis) {
      throw new Error("Diagnosis not found");
    }

    return {
      timestamp: new Date().toISOString(),
      diagnosisId,
      userInputs: {
        vehicleInfo: diagnosis.vehicleInfo,
        description: diagnosis.description,
        timing: diagnosis.timing,
        audioFile: diagnosis.audioFile,
        videoFile: diagnosis.videoFile,
        vibrationData: diagnosis.vibrationData
      },
      aiSuggestions: {
        primaryDiagnosis: diagnosis.primaryDiagnosis || null,
        alternativeScenarios: diagnosis.alternativeScenarios || [],
        confidence: diagnosis.confidenceScore || 0
      },
      fixHistory: [],
      summary: {
        totalAttempts: 1,
        successfulFixes: 0,
        averageTime: 0
      }
    };
  }

  async sendToMechanic(diagnosisId: string): Promise<never> {
    // There is no mechanic delivery queue behind this call. It used to return
    // `success: true` with the message "sent to available mechanics" while
    // nothing was sent anywhere.
    await this.exportChatForMechanic(diagnosisId);
    throw new CapabilityNotAvailableError(
      "mechanic_delivery",
      "No mechanic delivery channel is configured for this release.",
    );
  }

  async getDiagnosesByUser() {
    const local = Array.from(this.diagnoses.values());
    const remote = await this.dbDiagnoses();
    const merged = new Map<string, DiagnosisRecord>();
    for (const record of remote) merged.set(record.id, record);
    for (const record of local) merged.set(record.id, record);
    return Array.from(merged.values())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async getDiagnosis(id: string) {
    if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
      const rows = await getDb().select().from(diagnoses).where(eq(diagnoses.id, id)).limit(1);
      return rows.length > 0 ? mapDiagnosisRowToRecord(rows[0]) : null;
    }
    return this.diagnoses.get(id) ?? null;
  }

  async createDiagnosis(data: Partial<DiagnosisRecord>) {
    const diagnosis: DiagnosisRecord = {
      id: data.id || randomUUID(),
      userId: data.userId || "",
      vehicleInfo: data.vehicleInfo || "",
      description: data.description || "",
      timing: data.timing || "",
      audioFile: data.audioFile ?? null,
      videoFile: data.videoFile ?? null,
      vibrationData: data.vibrationData ?? null,
      photoAttachmentIds: data.photoAttachmentIds ?? [],
      confidenceScore: data.confidenceScore || 0,
      confidenceLevel: data.confidenceLevel || "low",
      inputTypes: data.inputTypes || [],
      iterationCount: data.iterationCount || 1,
      primaryDiagnosis: data.primaryDiagnosis || null,
      alternativeScenarios: data.alternativeScenarios || [],
      createdAt: new Date().toISOString(),
      status: data.status || "received"
    };

    if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
      const [row] = await getDb().insert(diagnoses).values({
        id: diagnosis.id,
        userId: diagnosis.userId || null,
        vehicleInfo: diagnosis.vehicleInfo || null,
        description: diagnosis.description || null,
        timing: diagnosis.timing || null,
        audioFile: diagnosis.audioFile ?? null,
        videoFile: diagnosis.videoFile ?? null,
        vibrationData: diagnosis.vibrationData as any,
        primaryDiagnosis: diagnosis.primaryDiagnosis as any,
        alternativeScenarios: diagnosis.alternativeScenarios as any,
        iterationCount: diagnosis.iterationCount,
        confidenceScore: diagnosis.confidenceScore,
        confidenceLevel: diagnosis.confidenceLevel,
        inputTypes: diagnosis.inputTypes,
      }).returning();
      if (!row) throw new Error("Diagnosis persistence did not return a stored record");
      return mapDiagnosisRowToRecord(row);
    }

    this.diagnoses.set(diagnosis.id, diagnosis);
    return diagnosis;
  }

  async createFollowUp(data: Partial<FollowUpRecord>) {
    const followUp: FollowUpRecord = {
      id: randomUUID(),
      originalDiagnosisId: data.originalDiagnosisId || "",
      userId: data.userId || "",
      additionalInfo: data.additionalInfo || "",
      newAudioFile: data.newAudioFile ?? null,
      newVideoFile: data.newVideoFile ?? null,
      newVibrationData: data.newVibrationData ?? null,
      photoAttachmentIds: data.photoAttachmentIds ?? [],
      createdAt: new Date().toISOString()
    };

    if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
      const [row] = await getDb().insert(followUpRequests).values({
        id: followUp.id,
        originalDiagnosisId: followUp.originalDiagnosisId,
        userId: followUp.userId || "",
        additionalInfo: followUp.additionalInfo,
        newAudioFile: followUp.newAudioFile,
        newVideoFile: followUp.newVideoFile,
        newVibrationData: followUp.newVibrationData as any,
      }).returning();
      if (!row) throw new Error("Follow-up persistence did not return a stored record");
      return {
        id: row.id,
        originalDiagnosisId: row.originalDiagnosisId,
        userId: row.userId,
        additionalInfo: row.additionalInfo ?? "",
        newAudioFile: row.newAudioFile,
        newVideoFile: row.newVideoFile,
        newVibrationData: row.newVibrationData,
        // The current PostgreSQL schema has no follow-up-to-photo relation.
        // Do not report the caller's process-local IDs as restart-durable.
        photoAttachmentIds: [],
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date().toISOString(),
      };
    }

    const existing = this.followUps.get(followUp.originalDiagnosisId) || [];
    existing.push(followUp);
    this.followUps.set(followUp.originalDiagnosisId, existing);
    return followUp;
  }

  async getFollowUpsByDiagnosis(diagnosisId: string) {
    if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
      const rows = await getDb().select().from(followUpRequests)
        .where(eq(followUpRequests.originalDiagnosisId, diagnosisId));
      return rows.map((row) => ({
        id: row.id,
        originalDiagnosisId: row.originalDiagnosisId,
        userId: row.userId,
        additionalInfo: row.additionalInfo ?? "",
        newAudioFile: row.newAudioFile,
        newVideoFile: row.newVideoFile,
        newVibrationData: row.newVibrationData,
        photoAttachmentIds: [],
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date().toISOString(),
      }));
    }
    return this.followUps.get(diagnosisId) || [];
  }

  async createFollowUpAndDiagnosis(
    followUpData: Partial<FollowUpRecord>,
    diagnosisData: Partial<DiagnosisRecord>,
    evidenceAttachments: readonly EvidenceAttachment[] = [],
  ) {
    const followUp: FollowUpRecord = {
      id: randomUUID(),
      originalDiagnosisId: followUpData.originalDiagnosisId || "",
      userId: followUpData.userId || "",
      additionalInfo: followUpData.additionalInfo || "",
      newAudioFile: followUpData.newAudioFile ?? null,
      newVideoFile: followUpData.newVideoFile ?? null,
      newVibrationData: followUpData.newVibrationData ?? null,
      photoAttachmentIds: followUpData.photoAttachmentIds ?? [],
      createdAt: new Date().toISOString(),
    };
    const diagnosis: DiagnosisRecord = {
      id: diagnosisData.id || randomUUID(),
      userId: diagnosisData.userId || "",
      vehicleInfo: diagnosisData.vehicleInfo || "",
      description: diagnosisData.description || "",
      timing: diagnosisData.timing || "",
      audioFile: diagnosisData.audioFile ?? null,
      videoFile: diagnosisData.videoFile ?? null,
      vibrationData: diagnosisData.vibrationData ?? null,
      photoAttachmentIds: diagnosisData.photoAttachmentIds ?? [],
      confidenceScore: diagnosisData.confidenceScore || 0,
      confidenceLevel: diagnosisData.confidenceLevel || "low",
      inputTypes: diagnosisData.inputTypes || [],
      iterationCount: diagnosisData.iterationCount || 1,
      primaryDiagnosis: diagnosisData.primaryDiagnosis || null,
      alternativeScenarios: diagnosisData.alternativeScenarios || [],
      createdAt: new Date().toISOString(),
      status: diagnosisData.status || "received",
    };

    if (process.env.DATABASE_URL || process.env.NODE_ENV === "production") {
      return getDb().transaction(async (tx) => {
        const [followUpRow] = await tx.insert(followUpRequests).values({
          id: followUp.id,
          originalDiagnosisId: followUp.originalDiagnosisId,
          userId: followUp.userId || "",
          additionalInfo: followUp.additionalInfo,
          newAudioFile: followUp.newAudioFile,
          newVideoFile: followUp.newVideoFile,
          newVibrationData: followUp.newVibrationData as any,
        }).returning();
        if (!followUpRow) throw new Error("Follow-up persistence did not return a stored record");

        const [diagnosisRow] = await tx.insert(diagnoses).values({
          id: diagnosis.id,
          userId: diagnosis.userId || null,
          vehicleInfo: diagnosis.vehicleInfo || null,
          description: diagnosis.description || null,
          timing: diagnosis.timing || null,
          audioFile: diagnosis.audioFile ?? null,
          videoFile: diagnosis.videoFile ?? null,
          vibrationData: diagnosis.vibrationData as any,
          primaryDiagnosis: diagnosis.primaryDiagnosis as any,
          alternativeScenarios: diagnosis.alternativeScenarios as any,
          iterationCount: diagnosis.iterationCount,
          confidenceScore: diagnosis.confidenceScore,
          confidenceLevel: diagnosis.confidenceLevel,
          inputTypes: diagnosis.inputTypes,
        }).returning();
        if (!diagnosisRow) throw new Error("Follow-up diagnosis persistence did not return a stored record");

        if (evidenceAttachments.length > 0) {
          await tx.insert(drivableEvidenceAttachments).values(evidenceAttachments.map((attachment) => ({
            id: attachment.id,
            caseId: attachment.caseId,
            kind: attachment.kind,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            byteSize: attachment.byteSize,
            status: attachment.status,
            storageKey: attachment.storageKey,
            provenance: attachment.provenance,
            analysisStatus: attachment.analysisStatus,
            notes: attachment.notes ?? null,
            createdAt: new Date(attachment.createdAt),
          }))).onConflictDoNothing({ target: drivableEvidenceAttachments.id });
        }

        return {
          followUp: {
            id: followUpRow.id,
            originalDiagnosisId: followUpRow.originalDiagnosisId,
            userId: followUpRow.userId,
            additionalInfo: followUpRow.additionalInfo ?? "",
            newAudioFile: followUpRow.newAudioFile,
            newVideoFile: followUpRow.newVideoFile,
            newVibrationData: followUpRow.newVibrationData,
            // Evidence remains associated with the case until a normalized
            // follow-up-to-attachment relation is added by an approved migration.
            photoAttachmentIds: [],
            createdAt: followUpRow.createdAt instanceof Date ? followUpRow.createdAt.toISOString() : followUp.createdAt,
          } satisfies FollowUpRecord,
          diagnosis: mapDiagnosisRowToRecord(diagnosisRow),
        };
      });
    }

    const existing = this.followUps.get(followUp.originalDiagnosisId) || [];
    this.followUps.set(followUp.originalDiagnosisId, [...existing, followUp]);
    this.diagnoses.set(diagnosis.id, diagnosis);
    return { followUp, diagnosis };
  }

  async getActiveMechanics(): Promise<never> {
    // The only entry was a hardcoded placeholder ("Mechanic Queue", rating 5).
    // Fabricated supply is worse than an empty directory.
    throw new CapabilityNotAvailableError(
      "mechanic_directory",
      "No verified mechanic directory is available in this release.",
    );
  }

  async createConsultation(_data: Partial<ConsultationRecord>): Promise<never> {
    // Consultations were held in a process-local Map keyed by mechanic, so a
    // 201 here reported a booking that a restart would erase.
    throw new CapabilityNotAvailableError(
      "consultation_booking",
      "Mechanic consultation booking is not available in this release.",
    );
  }

  async updateConsultation(_id: string, _updates: Partial<ConsultationRecord>): Promise<never> {
    throw new CapabilityNotAvailableError(
      "consultation_update",
      "Mechanic consultation updates are not available in this release.",
    );
  }

  async getConsultationsByMechanic(_mechanicId: string): Promise<never> {
    throw new CapabilityNotAvailableError(
      "consultation_lookup",
      "Mechanic consultation lookups are not available in this release.",
    );
  }

  async updateMechanicRating(_mechanicId: string, _averageRating: number): Promise<never> {
    throw new CapabilityNotAvailableError(
      "mechanic_rating",
      "Mechanic ratings are not persisted in this release.",
    );
  }
}

export const storage = new LocalStorage();
