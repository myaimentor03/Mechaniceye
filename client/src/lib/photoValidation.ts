/**
 * Shared client-side photo validation for evidence intake.
 *
 * Mirrors the server contract in server/evidence-storage.ts (PHOTO_LIMITS,
 * ALLOWED_PHOTO_MEDIA_TYPES) so the UI never invites uploads the server
 * cannot persist, and rejection messages stay truthful in both the gallery
 * picker and the camera-capture paths.
 */

export const MAX_PHOTO_COUNT = 8;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export interface PhotoLike {
  name: string;
  type: string;
  size: number;
}

export interface PhotoValidationResult {
  validFiles: PhotoLike[];
  errors: string[];
}

/**
 * Split candidate files into acceptable photos vs human-readable rejection
 * reasons. Pure function (no DOM) so it can be unit-tested and reused by
 * every photo entry point (gallery picker, camera capture).
 */
export function validatePhotoFiles(
  candidates: readonly PhotoLike[],
  existingCount: number,
): PhotoValidationResult {
  const validFiles: PhotoLike[] = [];
  const errors: string[] = [];

  for (const file of candidates) {
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      errors.push(
        `${file.name}: Unsupported file type. Use JPEG, PNG, WebP, or HEIC.`,
      );
      continue;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      errors.push(`${file.name}: File too large (max 12 MB).`);
      continue;
    }
    validFiles.push(file);
  }

  const room = MAX_PHOTO_COUNT - existingCount;
  if (validFiles.length > room) {
    if (room <= 0) {
      return {
        validFiles: [],
        errors: [
          ...errors,
          `Photo limit reached (max ${MAX_PHOTO_COUNT} photos). Remove a photo to add another.`,
        ],
      };
    }
    return {
      validFiles: validFiles.slice(0, room),
      errors: [
        ...errors,
        `Maximum ${MAX_PHOTO_COUNT} photos allowed. Only ${room} more can be added.`,
      ],
    };
  }

  return { validFiles, errors };
}
