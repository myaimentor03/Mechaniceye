/**
 * Pure per-modality evidence status mappers shared by intake (diagnosis)
 * and follow-up pages.
 *
 * Evidence belongs to the vehicle/case. These helpers translate server
 * truth (persisted counts / evidenceProcessing boundary) and local truth
 * (files the customer selected) into the tri-state UI status consumed by
 * EvidenceCapture: "persisted" | "not_provided" | "failed".
 *
 * Media is stored for human review only — these statuses never imply
 * analysis happened. See analysisStatus: "uploaded_not_analyzed".
 */

export type EvidenceModalityStatus = "persisted" | "not_provided" | "failed";

export type EvidenceStatusByModality = {
  photo: EvidenceModalityStatus;
  audio: EvidenceModalityStatus;
  video: EvidenceModalityStatus;
  vibration: EvidenceModalityStatus;
};

export const FOLLOW_UP_STORED_VALUE = "stored_for_human_review_not_analyzed" as const;

type FollowUpEvidenceProcessing = {
  photo?: unknown;
  audio?: unknown;
  video?: unknown;
  vibration?: unknown;
} | null | undefined;

/**
 * Map a follow-up response's `evidenceProcessing` boundary to UI status.
 * Only the exact "stored_for_human_review_not_analyzed" marker counts as
 * persisted; anything else (including "not_provided" or unknown values)
 * is truthfully reported as not provided — never as failed, since no
 * failure was observed on this path.
 */
export function followUpProcessingToStatus(
  evidenceProcessing: FollowUpEvidenceProcessing,
): EvidenceStatusByModality {
  const toStatus = (value: unknown): EvidenceModalityStatus =>
    value === FOLLOW_UP_STORED_VALUE ? "persisted" : "not_provided";
  return {
    photo: toStatus(evidenceProcessing?.photo),
    audio: toStatus(evidenceProcessing?.audio),
    video: toStatus(evidenceProcessing?.video),
    vibration: toStatus(evidenceProcessing?.vibration),
  };
}

/**
 * Map an intake response's `evidenceSummary` ({ status } per modality) to
 * UI status, defaulting missing entries to "not_provided".
 */
export function intakeSummaryToStatus(
  summary: {
    photos?: { status?: unknown };
    audio?: { status?: unknown };
    video?: { status?: unknown };
    vibration?: { status?: unknown };
  } | null | undefined,
): EvidenceStatusByModality {
  const toStatus = (value: unknown): EvidenceModalityStatus =>
    value === "persisted" || value === "failed" ? value : "not_provided";
  return {
    photo: toStatus(summary?.photos?.status),
    audio: toStatus(summary?.audio?.status),
    video: toStatus(summary?.video?.status),
    vibration: toStatus(summary?.vibration?.status),
  };
}

/**
 * Build the failure status after an upload error: every modality the
 * customer had files for is "failed" (so Retry UI surfaces), everything
 * else is "not_provided". Never claims persistence.
 */
export function failedUploadStatus(counts: {
  photo: number;
  audio: number;
  video: number;
  vibration: number;
}): EvidenceStatusByModality {
  const toStatus = (count: number): EvidenceModalityStatus =>
    count > 0 ? "failed" : "not_provided";
  return {
    photo: toStatus(counts.photo),
    audio: toStatus(counts.audio),
    video: toStatus(counts.video),
    vibration: toStatus(counts.vibration),
  };
}
