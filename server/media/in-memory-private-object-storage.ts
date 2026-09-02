import { createHash, randomUUID } from "node:crypto";
import {
  PrivateObjectStorageError,
  type CreateSignedPrivateReadAccessInput,
  type DeletePrivateEvidenceObjectResult,
  type EvidenceMediaExtension,
  type EvidenceObjectScope,
  type PrivateEvidenceObjectMetadata,
  type PrivateEvidenceObjectRead,
  type PrivateEvidenceObjectStorage,
  type PrivateObjectLocator,
  type PrivateObjectStorageCapabilities,
  type PutPrivateEvidenceObjectInput,
  type PutPrivateEvidenceObjectResult,
  type SignedPrivateReadAccess,
} from "./private-object-storage.js";
import { verifyEvidenceMedia } from "./verified-evidence-media.js";

type FakeOperation = "put" | "get" | "delete" | "signed_read";

interface StoredRecord {
  readonly metadata: PrivateEvidenceObjectMetadata;
  readonly bytes: Uint8Array;
}

interface IdempotencyRecord {
  readonly objectKey: string;
  readonly fingerprint: string;
}

export interface InMemoryPrivateObjectStorageOptions {
  readonly maxBytes?: number;
  readonly now?: () => Date;
}

export const IN_MEMORY_PRIVATE_STORAGE_CAPABILITIES: PrivateObjectStorageCapabilities =
  Object.freeze({
    backendClass: "ephemeral-test-double",
    durable: false,
    horizontallyScalable: false,
    privateByDefault: true,
    generatedKeysOnly: true,
    supportsIdempotentPut: true,
    deleteIsIdempotent: true,
    signedRead: Object.freeze({ supported: false, maxTtlSeconds: null }),
  });

const SAFE_SCOPE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,200}$/;
const GENERATED_KEY = /^private\/drivable-evidence\/v1\/cases\/([^/]+)\/attachments\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp|heic)$/;

function validateScopeId(label: "caseId" | "attachmentId", value: string): void {
  if (!SAFE_SCOPE_ID.test(value)) {
    throw new PrivateObjectStorageError("invalid_input", `Invalid ${label}`);
  }
}

function validateScope(scope: EvidenceObjectScope): void {
  validateScopeId("caseId", scope.caseId);
  validateScopeId("attachmentId", scope.attachmentId);
}

function extensionWithoutDot(extension: EvidenceMediaExtension): string {
  return extension.slice(1);
}

function generateObjectKey(scope: EvidenceObjectScope, extension: EvidenceMediaExtension): string {
  return [
    "private",
    "drivable-evidence",
    "v1",
    "cases",
    scope.caseId,
    "attachments",
    scope.attachmentId,
    `${randomUUID()}.${extensionWithoutDot(extension)}`,
  ].join("/");
}

function parseGeneratedKey(objectKey: string): { caseId: string; attachmentId: string } {
  const match = GENERATED_KEY.exec(objectKey);
  if (!match) {
    throw new PrivateObjectStorageError("invalid_input", "Invalid generated evidence object key");
  }
  return { caseId: match[1], attachmentId: match[2] };
}

function locatorMatchesKey(locator: PrivateObjectLocator): boolean {
  validateScope(locator);
  const keyScope = parseGeneratedKey(locator.objectKey);
  return keyScope.caseId === locator.caseId && keyScope.attachmentId === locator.attachmentId;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function idempotencyMapKey(input: EvidenceObjectScope, idempotencyKey: string): string {
  return `${input.caseId}\u0000${input.attachmentId}\u0000${idempotencyKey}`;
}

function cloneMetadata(metadata: PrivateEvidenceObjectMetadata): PrivateEvidenceObjectMetadata {
  return {
    ...metadata,
    access: {
      ...metadata.access,
      signedRead: { ...metadata.access.signedRead },
    },
  };
}

/**
 * Process-local contract fake for tests and development only. Its capability
 * descriptor intentionally prevents it from being mistaken for production
 * durable/scalable storage.
 */
export class InMemoryPrivateEvidenceObjectStorage implements PrivateEvidenceObjectStorage {
  readonly capabilities = IN_MEMORY_PRIVATE_STORAGE_CAPABILITIES;

  private readonly objects = new Map<string, StoredRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly scheduledFailures = new Map<FakeOperation, Error>();
  private readonly maxBytes: number;
  private readonly now: () => Date;

  constructor(options: InMemoryPrivateObjectStorageOptions = {}) {
    this.maxBytes = options.maxBytes ?? 100 * 1024 * 1024;
    this.now = options.now ?? (() => new Date());
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes <= 0) {
      throw new PrivateObjectStorageError("invalid_input", "maxBytes must be a positive integer");
    }
  }

  /** Test-only observability; callers never gain direct access to stored bytes. */
  get storedObjectCount(): number {
    return this.objects.size;
  }

  /** Schedule one deterministic backend failure without partially mutating data. */
  failNext(
    operation: FakeOperation,
    error: Error = new PrivateObjectStorageError(
      "storage_unavailable",
      `Injected ${operation} storage failure`,
      true,
    ),
  ): void {
    this.scheduledFailures.set(operation, error);
  }

  async put(input: PutPrivateEvidenceObjectInput): Promise<PutPrivateEvidenceObjectResult> {
    this.throwScheduledFailure("put");
    validateScope(input);
    if (!SAFE_IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      throw new PrivateObjectStorageError("invalid_input", "Invalid idempotency key");
    }
    if (input.bytes.byteLength > this.maxBytes) {
      throw new PrivateObjectStorageError("invalid_media", "Evidence media exceeds the storage limit");
    }

    const verified = verifyEvidenceMedia(input.bytes, input.declaredMediaType);
    const checksumSha256 = sha256(input.bytes);
    const fingerprint = `${verified.mediaType}:${input.bytes.byteLength}:${checksumSha256}`;
    const idempotencyKey = idempotencyMapKey(input, input.idempotencyKey);
    const prior = this.idempotency.get(idempotencyKey);

    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new PrivateObjectStorageError(
          "idempotency_conflict",
          "Idempotency key was already used for different evidence content",
        );
      }
      const existing = this.objects.get(prior.objectKey);
      if (!existing) {
        throw new PrivateObjectStorageError(
          "idempotency_conflict",
          "The idempotent upload was already completed and later deleted",
        );
      }
      return { disposition: "idempotent_replay", object: cloneMetadata(existing.metadata) };
    }

    const objectKey = generateObjectKey(input, verified.extension);
    const createdAt = this.now().toISOString();
    const metadata: PrivateEvidenceObjectMetadata = {
      caseId: input.caseId,
      attachmentId: input.attachmentId,
      objectKey,
      mediaType: verified.mediaType,
      extension: verified.extension,
      byteSize: input.bytes.byteLength,
      checksumSha256,
      createdAt,
      access: {
        visibility: "private",
        signedRead: { ...this.capabilities.signedRead },
      },
    };

    const record: StoredRecord = {
      metadata,
      bytes: Uint8Array.from(input.bytes),
    };
    this.objects.set(objectKey, record);
    this.idempotency.set(idempotencyKey, { objectKey, fingerprint });
    return { disposition: "created", object: cloneMetadata(metadata) };
  }

  async get(locator: PrivateObjectLocator): Promise<PrivateEvidenceObjectRead | null> {
    this.throwScheduledFailure("get");
    if (!locatorMatchesKey(locator)) return null;
    const record = this.objects.get(locator.objectKey);
    if (!record) return null;
    return {
      object: cloneMetadata(record.metadata),
      bytes: Uint8Array.from(record.bytes),
    };
  }

  async delete(locator: PrivateObjectLocator): Promise<DeletePrivateEvidenceObjectResult> {
    this.throwScheduledFailure("delete");
    const matches = locatorMatchesKey(locator);
    const deleted = matches && this.objects.delete(locator.objectKey);
    return { ...locator, status: deleted ? "deleted" : "not_found" };
  }

  async createSignedReadAccess(
    input: CreateSignedPrivateReadAccessInput,
  ): Promise<SignedPrivateReadAccess> {
    this.throwScheduledFailure("signed_read");
    validateScope(input);
    parseGeneratedKey(input.objectKey);
    throw new PrivateObjectStorageError(
      "unsupported_capability",
      "The in-memory test double does not issue signed read URLs",
    );
  }

  private throwScheduledFailure(operation: FakeOperation): void {
    const error = this.scheduledFailures.get(operation);
    if (!error) return;
    this.scheduledFailures.delete(operation);
    throw error;
  }
}
