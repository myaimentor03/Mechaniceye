import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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
  readonly durability: "runtime_local" | "private_object_storage";
  savePhotos(caseId: string, files: Express.Multer.File[]): Promise<EvidenceAttachment[]>;
  deleteCase(caseId: string): Promise<void>;
  getAttachment(caseId: string, attachmentId: string): Promise<{ attachment: EvidenceAttachment; bytes: Buffer } | null>;
}

function safeCaseSegment(value: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error("Invalid server case ID");
  return value;
}

export class RuntimeFileEvidenceStore implements EvidenceStore {
  readonly durability = "runtime_local" as const;
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

  async getAttachment(caseId: string, attachmentId: string) {
    const caseRoot = this.caseRoot(caseId);
    const manifest = JSON.parse(await fs.readFile(path.join(caseRoot, "attachments.json"), "utf8")) as EvidenceAttachment[];
    const attachment = manifest.find((item) => item.id === safeCaseSegment(attachmentId));
    if (!attachment) return null;
    const fileName = path.posix.basename(attachment.storageKey);
    return { attachment, bytes: await fs.readFile(path.join(caseRoot, fileName)) };
  }
}

type S3CommandClient = { send(command: unknown): Promise<any> };

export type PrivateObjectStorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
};

function manifestKey(caseId: string) {
  return path.posix.join("evidence", safeCaseSegment(caseId), "attachments.json");
}

async function bodyToBuffer(body: any): Promise<Buffer> {
  if (!body) throw new Error("Object storage returned an empty body");
  if (typeof body.transformToByteArray === "function") return Buffer.from(await body.transformToByteArray());
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export class S3PrivateEvidenceStore implements EvidenceStore {
  readonly durability = "private_object_storage" as const;

  constructor(
    private readonly config: PrivateObjectStorageConfig,
    private readonly client: S3CommandClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
    }) as S3CommandClient,
  ) {}

  async savePhotos(caseId: string, files: Express.Multer.File[]) {
    if (files.length > PHOTO_LIMITS.maxCount) throw new Error("Too many photos");
    const safeCaseId = safeCaseSegment(caseId);
    const attachments: EvidenceAttachment[] = [];
    const writtenKeys: string[] = [];
    try {
      for (const file of files) {
        if (!file.buffer?.length || file.size <= 0) throw new Error("Empty photo rejected");
        if (file.size > PHOTO_LIMITS.maxBytesEach) throw new Error("Photo is too large");
        const verified = verifiedImageType(file.buffer);
        if (!verified) throw new Error("Photo content is not a supported image");
        const heifCompatible = verified.mimeType === "image/heic" && ["image/heic", "image/heif"].includes(file.mimetype);
        if (file.mimetype !== verified.mimeType && !heifCompatible) throw new Error("Photo MIME type does not match its content");
        const id = randomUUID();
        const storageKey = path.posix.join("evidence", safeCaseId, `${id}${verified.extension}`);
        await this.client.send(new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: storageKey,
          Body: file.buffer,
          ContentType: verified.mimeType,
          CacheControl: "no-store",
        }));
        writtenKeys.push(storageKey);
        attachments.push({
          id, caseId: safeCaseId, kind: "photo", originalName: path.basename(file.originalname),
          mimeType: verified.mimeType, byteSize: file.size, status: "persisted",
          serverAttachmentId: id, storageKey, createdAt: new Date().toISOString(),
          provenance: "uploaded_media", analysisStatus: "uploaded_not_analyzed",
        });
      }
      const key = manifestKey(safeCaseId);
      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: Buffer.from(JSON.stringify(attachments)),
        ContentType: "application/json",
        CacheControl: "no-store",
      }));
      writtenKeys.push(key);
      return attachments;
    } catch (error) {
      await Promise.allSettled(writtenKeys.map((Key) => this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key }))));
      throw error;
    }
  }

  async getAttachment(caseId: string, attachmentId: string) {
    const safeCaseId = safeCaseSegment(caseId);
    const safeAttachmentId = safeCaseSegment(attachmentId);
    try {
      const manifestObject = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: manifestKey(safeCaseId) }));
      const manifest = JSON.parse((await bodyToBuffer(manifestObject.Body)).toString("utf8")) as EvidenceAttachment[];
      const attachment = manifest.find((item) => item.id === safeAttachmentId);
      if (!attachment || !attachment.storageKey.startsWith(`evidence/${safeCaseId}/`)) return null;
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: attachment.storageKey }));
      return { attachment, bytes: await bodyToBuffer(object.Body) };
    } catch (error: any) {
      if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  async deleteCase(caseId: string) {
    const safeCaseId = safeCaseSegment(caseId);
    let attachments: EvidenceAttachment[] = [];
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: manifestKey(safeCaseId) }));
      attachments = JSON.parse((await bodyToBuffer(object.Body)).toString("utf8"));
    } catch (error: any) {
      if (error?.name !== "NoSuchKey" && error?.$metadata?.httpStatusCode !== 404) throw error;
    }
    const casePrefix = `evidence/${safeCaseId}/`;
    const keys = [
      ...attachments.map((item) => item.storageKey).filter((key) => key.startsWith(casePrefix)),
      manifestKey(safeCaseId),
    ];
    await Promise.all(keys.map((Key) => this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key }))));
  }
}

export function privateObjectStorageConfigFromEnvironment(): PrivateObjectStorageConfig | null {
  const bucket = process.env.DRIVABLE_EVIDENCE_S3_BUCKET?.trim();
  const region = process.env.DRIVABLE_EVIDENCE_S3_REGION?.trim();
  if (!bucket || !region) return null;
  const accessKeyId = process.env.DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY?.trim();
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) throw new Error("Both S3 evidence credentials must be configured together");
  return {
    bucket,
    region,
    endpoint: process.env.DRIVABLE_EVIDENCE_S3_ENDPOINT?.trim() || undefined,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.DRIVABLE_EVIDENCE_S3_FORCE_PATH_STYLE === "true",
  };
}

export function createEvidenceStoreFromEnvironment(): EvidenceStore {
  const config = privateObjectStorageConfigFromEnvironment();
  return config ? new S3PrivateEvidenceStore(config) : new RuntimeFileEvidenceStore();
}
