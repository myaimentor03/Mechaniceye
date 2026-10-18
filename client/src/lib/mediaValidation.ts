/**
 * Shared client-side audio/video validation for evidence intake.
 *
 * Mirrors the server contract in server/evidence-storage.ts (AUDIO_LIMITS,
 * VIDEO_LIMITS, ALLOWED_AUDIO_MEDIA_TYPES, ALLOWED_VIDEO_MEDIA_TYPES) and the
 * multer fileFilter in server/routes.ts, so the UI never invites uploads the
 * server cannot persist.
 *
 * Also fixes in-browser MediaRecorder output: recorder MIME types carry codec
 * parameters (e.g. "audio/webm;codecs=opus", "video/webm;codecs=vp9") which the
 * server's strict allowlist rejects with 415. Recorded blobs must be stored
 * under their base MIME type before upload.
 */

export const MAX_AUDIO_COUNT = 4;
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const ALLOWED_AUDIO_TYPES: readonly string[] = [
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
];

export const MAX_VIDEO_COUNT = 4;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const ALLOWED_VIDEO_TYPES: readonly string[] = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
];

/** File picker accept attribute derived from the server allowlists. */
export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.webm,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/webm,audio/ogg";
export const VIDEO_ACCEPT = ".mp4,.mov,.avi,.webm,video/mp4,video/quicktime,video/x-msvideo,video/webm";

export interface MediaLike {
  name: string;
  type: string;
  size: number;
}

export interface MediaValidationResult<T extends MediaLike = MediaLike> {
  validFiles: T[];
  errors: string[];
}

/**
 * Strip MediaRecorder codec parameters ("audio/webm;codecs=opus" ->
 * "audio/webm") so the uploaded File carries a MIME the server accepts.
 * Returns "" when no usable base type remains.
 */
export function baseMimeType(mimeType: string): string {
  return (mimeType || "").split(";")[0].trim().toLowerCase();
}

/** Extension the server's verified-type mapping will accept for a base MIME. */
export function extensionForAudioMime(baseMime: string): string {
  switch (baseMime) {
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
      return ".wav";
    case "audio/mp4":
    case "audio/x-m4a":
      return ".m4a";
    case "audio/webm":
      return ".webm";
    case "audio/ogg":
      return ".ogg";
    default:
      return ".webm";
  }
}

/** Extension the server's verified-type mapping will accept for a base MIME. */
export function extensionForVideoMime(baseMime: string): string {
  switch (baseMime) {
    case "video/mp4":
      return ".mp4";
    case "video/quicktime":
      return ".mov";
    case "video/x-msvideo":
      return ".avi";
    case "video/webm":
      return ".webm";
    default:
      return ".webm";
  }
}

function validateCount<T extends MediaLike>(
  validFiles: T[],
  existingCount: number,
  maxCount: number,
  noun: string,
): { capped: T[]; errors: string[] } {
  const room = maxCount - existingCount;
  if (validFiles.length > room) {
    if (room <= 0) {
      return {
        capped: [],
        errors: [
          `${noun} limit reached (max ${maxCount} ${noun === "Audio" ? "files" : "videos"}). Remove one to add another.`,
        ],
      };
    }
    return {
      capped: validFiles.slice(0, room),
      errors: [`Maximum ${maxCount} ${noun === "Audio" ? "audio files" : "videos"} allowed. Only ${room} more can be added.`],
    };
  }
  return { capped: validFiles, errors: [] };
}

/**
 * Split candidate audio files into acceptable uploads vs human-readable
 * rejection reasons. Pure function (no DOM) so it can be unit-tested and
 * reused by every audio entry point (record, file picker).
 */
export function validateAudioFiles<T extends MediaLike>(
  candidates: readonly T[],
  existingCount: number,
): MediaValidationResult<T> {
  const validFiles: T[] = [];
  const errors: string[] = [];

  for (const file of candidates) {
    const base = baseMimeType(file.type);
    if (!ALLOWED_AUDIO_TYPES.includes(base)) {
      errors.push(`${file.name}: Unsupported audio type. Use MP3, WAV, M4A, WebM, or OGG.`);
      continue;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      errors.push(`${file.name}: Audio file too large (max 50 MB). Try a shorter recording.`);
      continue;
    }
    validFiles.push(file);
  }

  const { capped, errors: countErrors } = validateCount(validFiles, existingCount, MAX_AUDIO_COUNT, "Audio");
  return { validFiles: capped, errors: [...errors, ...countErrors] };
}

/**
 * Split candidate video files into acceptable uploads vs human-readable
 * rejection reasons. Pure function (no DOM) so it can be unit-tested and
 * reused by every video entry point (record, file picker).
 */
export function validateVideoFiles<T extends MediaLike>(
  candidates: readonly T[],
  existingCount: number,
): MediaValidationResult<T> {
  const validFiles: T[] = [];
  const errors: string[] = [];

  for (const file of candidates) {
    const base = baseMimeType(file.type);
    if (!ALLOWED_VIDEO_TYPES.includes(base)) {
      errors.push(`${file.name}: Unsupported video type. Use MP4, MOV, AVI, or WebM.`);
      continue;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      errors.push(`${file.name}: Video file too large (max 100 MB). Try a shorter recording.`);
      continue;
    }
    validFiles.push(file);
  }

  const { capped, errors: countErrors } = validateCount(validFiles, existingCount, MAX_VIDEO_COUNT, "Video");
  return { validFiles: capped, errors: [...errors, ...countErrors] };
}
