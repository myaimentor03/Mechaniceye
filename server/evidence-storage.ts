import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { EvidenceAttachment } from "../shared/drivableEvidence.js";

export const PHOTO_LIMITS = { maxCount: 8, maxBytesEach: 12 * 1024 * 1024 } as const;
export const ALLOWED_PHOTO_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
]);

type VerifiedImage = { mimeType: string; extension: string };

function verifiedImageType(buffer: Buffer): VerifiedImage | null {
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png", extension: ".png" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { mimeType: "image/webp", extension: ".webp" };
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return { mimeType: "image/heic", extension: ".heic" };
    }
  }
  return null;
}

export interface EvidenceStore {
  savePhotos(caseId: string, files: Express.Multer.File[]): Promise<EvidenceAttachment[]>;
  deleteCase(caseId: string): Promise<void>;
}

function safeCaseSegment(value: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error("Invalid server case ID");
  return value;
}

export class RuntimeFileEvidenceStore implements EvidenceStore {
  constructor(private readonly root = path.join(process.cwd(), "uploads", "evidence")) {}

  private caseRoot(caseId: string) {
    return path.join(this.root, safeCaseSegment(caseId));
  }

  async savePhotos(caseId: string, files: Express.Multer.File[]) {
    if (files.length > PHOTO_LIMITS.maxCount) throw new Error("Too many photos");
    const caseRoot = this.caseRoot(caseId);
    await fs.mkdir(caseRoot, { recursive: true });
    const attachments: EvidenceAttachment[] = [];
    const writtenPaths: string[] = [];

    try {
      for (const file of files) {
        if (!file.buffer?.length || file.size <= 0) throw new Error("Empty photo rejected");
        if (file.size > PHOTO_LIMITS.maxBytesEach) throw new Error("Photo is too large");
        const verified = verifiedImageType(file.buffer);
        if (!verified) throw new Error("Photo content is not a supported image");
        const heifCompatible = verified.mimeType === "image/heic" && ["image/heic", "image/heif"].includes(file.mimetype);
        if (file.mimetype !== verified.mimeType && !heifCompatible) {
          throw new Error("Photo MIME type does not match its content");
        }

        const id = randomUUID();
        const storedName = `${id}${verified.extension}`;
        const storageKey = path.posix.join("evidence", safeCaseSegment(caseId), storedName);
        const target = path.join(caseRoot, storedName);
        await fs.writeFile(target, file.buffer, { flag: "wx" });
        writtenPaths.push(target);
        attachments.push({
          id, caseId, kind: "photo", originalName: path.basename(file.originalname),
          mimeType: verified.mimeType, byteSize: file.size, status: "persisted",
          serverAttachmentId: id, storageKey, createdAt: new Date().toISOString(),
          provenance: "uploaded_media", analysisStatus: "uploaded_not_analyzed",
        });
      }

      await fs.writeFile(path.join(caseRoot, "attachments.json"), JSON.stringify(attachments, null, 2), { encoding: "utf8", flag: "wx" });
      return attachments;
    } catch (error) {
      await Promise.all(writtenPaths.map((filePath) => fs.rm(filePath, { force: true })));
      await fs.rm(caseRoot, { recursive: true, force: true });
      throw error;
    }
  }

  async deleteCase(caseId: string) {
    await fs.rm(this.caseRoot(caseId), { recursive: true, force: true });
  }
}
