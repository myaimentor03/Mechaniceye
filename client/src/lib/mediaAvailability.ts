export interface MediaCapabilities {
  photoUpload: boolean;
  audioUpload: boolean;
  videoUpload: boolean;
  vibrationSensorCapture: boolean;
}

export const MEDIA_UNAVAILABLE: MediaCapabilities = {
  photoUpload: false,
  audioUpload: false,
  videoUpload: false,
  vibrationSensorCapture: false,
};

function isTrue(value: unknown): boolean {
  return value === true;
}

/**
 * Parse /api/capabilities into strict booleans. Anything that is not an
 * explicit `true` reads as unavailable so the UI never invites uploads the
 * server cannot persist.
 */
export function parseMediaCapabilities(body: unknown): MediaCapabilities {
  if (!body || typeof body !== "object") return { ...MEDIA_UNAVAILABLE };
  const record = body as Record<string, unknown>;
  return {
    photoUpload: isTrue(record.photoUpload),
    audioUpload: isTrue(record.audioUpload),
    videoUpload: isTrue(record.videoUpload),
    vibrationSensorCapture: isTrue(record.vibrationSensorCapture),
  };
}

export interface EvidenceFileGroups {
  photos: File[];
  audio: File[];
  video: File[];
  vibration: File[];
}

/**
 * Drop files for modalities the server reports as unavailable. Callers pass
 * the currently selected files; the result is what may be appended to the
 * intake FormData. Unavailable selections are never submitted, so a stale
 * recording cannot turn a good case into a 507.
 */
export function filterSubmittableEvidence(
  files: EvidenceFileGroups,
  capabilities: MediaCapabilities,
): EvidenceFileGroups {
  return {
    photos: capabilities.photoUpload ? files.photos : [],
    audio: capabilities.audioUpload ? files.audio : [],
    video: capabilities.videoUpload ? files.video : [],
    vibration: capabilities.vibrationSensorCapture ? files.vibration : [],
  };
}

export type EvidenceModality = "photos" | "audio" | "video" | "vibration";

export function isModalityAvailable(
  modality: EvidenceModality,
  capabilities: MediaCapabilities,
): boolean {
  if (modality === "photos") return capabilities.photoUpload;
  if (modality === "audio") return capabilities.audioUpload;
  if (modality === "video") return capabilities.videoUpload;
  return capabilities.vibrationSensorCapture;
}

export function mediaUnavailableMessage(modality: EvidenceModality): string {
  if (modality === "photos") {
    return "Photo upload is temporarily unavailable until private hosted storage and reviewer access pass launch verification.";
  }
  if (modality === "audio") {
    return "Audio upload is temporarily unavailable until private hosted storage passes launch verification. You can still describe the noise in words.";
  }
  if (modality === "video") {
    return "Video upload is temporarily unavailable until private hosted storage passes launch verification. Photos or a written description still help.";
  }
  return "Vibration measurement upload is temporarily unavailable until private hosted storage passes launch verification. Describe where you feel it and at what speed instead.";
}
