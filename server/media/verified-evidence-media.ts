import { PrivateObjectStorageError } from "./private-object-storage.js";
import type {
  EvidenceMediaExtension,
  EvidenceMediaType,
} from "./private-object-storage.js";

export interface VerifiedEvidenceMedia {
  readonly mediaType: EvidenceMediaType;
  readonly extension: EvidenceMediaExtension;
}

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset + start, end - start).toString("ascii");
}

function startsWith(bytes: Uint8Array, signature: Uint8Array): boolean {
  if (bytes.byteLength < signature.byteLength) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function detectEvidenceMedia(bytes: Uint8Array): VerifiedEvidenceMedia | null {
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mediaType: "image/jpeg", extension: ".jpg" };
  }

  if (startsWith(bytes, PNG_SIGNATURE)) {
    return { mediaType: "image/png", extension: ".png" };
  }

  if (
    bytes.byteLength >= 12
    && ascii(bytes, 0, 4) === "RIFF"
    && ascii(bytes, 8, 12) === "WEBP"
  ) {
    return { mediaType: "image/webp", extension: ".webp" };
  }

  if (
    bytes.byteLength >= 12
    && ascii(bytes, 4, 8) === "ftyp"
    && HEIC_BRANDS.has(ascii(bytes, 8, 12))
  ) {
    return { mediaType: "image/heic", extension: ".heic" };
  }

  return null;
}

function normalizeDeclaredMediaType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/**
 * Detect from bytes first, then compare with transport metadata. The client
 * filename and its extension are intentionally not part of verification.
 */
export function verifyEvidenceMedia(
  bytes: Uint8Array,
  declaredMediaType: string,
): VerifiedEvidenceMedia {
  if (bytes.byteLength === 0) {
    throw new PrivateObjectStorageError("invalid_media", "Empty evidence media is not allowed");
  }

  const detected = detectEvidenceMedia(bytes);
  if (!detected) {
    throw new PrivateObjectStorageError(
      "invalid_media",
      "Evidence bytes do not match a supported media signature",
    );
  }

  const declared = normalizeDeclaredMediaType(declaredMediaType);
  const heifAlias = detected.mediaType === "image/heic" && declared === "image/heif";
  if (declared !== detected.mediaType && !heifAlias) {
    throw new PrivateObjectStorageError(
      "invalid_media",
      `Declared media type ${declared || "(missing)"} does not match verified ${detected.mediaType}`,
    );
  }

  return detected;
}
