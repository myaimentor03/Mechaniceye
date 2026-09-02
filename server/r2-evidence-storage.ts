import { createReadStream } from "fs";
import { rm } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

const RETENTION_DAYS = 30;

type EvidenceField = "photos" | "audio" | "video" | "vibration";

export type UploadedEvidenceFiles = Partial<Record<EvidenceField, Express.Multer.File[]>>;

export type StoredEvidenceKeys = Partial<Record<EvidenceField, string[]>>;

function safeCaseSegment(value: string) {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (!sanitized) throw new Error("A positive case ID is required for evidence storage.");
  return sanitized;
}

function getR2Configuration() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim() || "mechanicseye-evidence";

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function isR2EvidenceStorageConfigured() {
  return Boolean(getR2Configuration());
}

function createR2Client() {
  const configuration = getR2Configuration();
  if (!configuration) {
    throw new Error("Private evidence storage is not configured.");
  }

  return {
    bucket: configuration.bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey
      }
    })
  };
}

function extensionFor(file: Express.Multer.File) {
  const originalExtension = path.extname(file.originalname).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(originalExtension)) {
    return originalExtension;
  }

  const extensionsByMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi"
  };

  return extensionsByMime[file.mimetype] || ".bin";
}

async function removeTemporaryFiles(files: UploadedEvidenceFiles) {
  await Promise.all(
    Object.values(files)
      .flat()
      .map((file) => rm(file.path, { force: true }))
  );
}

type ObjectStoreCommand = PutObjectCommand | DeleteObjectCommand;

type ObjectStoreClient = {
  bucket: string;
  send(command: ObjectStoreCommand): Promise<unknown>;
};

export async function storeEvidenceFilesWithClient(
  caseId: string,
  files: UploadedEvidenceFiles,
  store: ObjectStoreClient,
  now: Date = new Date()
): Promise<StoredEvidenceKeys> {
  const storedKeys: StoredEvidenceKeys = {};
  const uploadedKeys: string[] = [];
  const deleteAfter = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const safeCaseId = safeCaseSegment(caseId);

  try {
    for (const field of ["photos", "audio", "video", "vibration"] as const) {
      const fieldFiles = files[field] || [];
      storedKeys[field] = [];

      for (const file of fieldFiles) {
        const key = `cases/${safeCaseId}/${field}/${randomUUID()}${extensionFor(file)}`;
        await store.send(new PutObjectCommand({
          Bucket: store.bucket,
          Key: key,
          Body: createReadStream(file.path),
          ContentType: file.mimetype,
          CacheControl: "private, no-store",
          Metadata: {
            case_id: safeCaseId,
            evidence_type: field,
            evidence_status: "uploaded_not_analyzed",
            delete_after: deleteAfter
          }
        }));
        storedKeys[field]?.push(key);
        uploadedKeys.push(key);
      }
    }

    return storedKeys;
  } catch (error) {
    await Promise.allSettled(
      uploadedKeys.map((key) => store.send(new DeleteObjectCommand({ Bucket: store.bucket, Key: key })))
    );
    throw error;
  } finally {
    await removeTemporaryFiles(files);
  }
}

export async function storeEvidenceFiles(
  caseId: string,
  files: UploadedEvidenceFiles
): Promise<StoredEvidenceKeys> {
  const { bucket, client } = createR2Client();
  try {
    return await storeEvidenceFilesWithClient(caseId, files, { bucket, send: (command) => client.send(command) });
  } finally {
    client.destroy();
  }
}
