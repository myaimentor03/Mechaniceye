/**
 * Vendor-neutral boundary for private Drivable evidence objects.
 *
 * Object keys are assigned by the implementation. Callers provide only the
 * case/attachment scope and untrusted upload facts; there is deliberately no
 * caller-supplied key or permanent/public URL in this contract.
 */

export type EvidenceMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic";

export type EvidenceMediaExtension = ".jpg" | ".png" | ".webp" | ".heic";

export interface EvidenceObjectScope {
  readonly caseId: string;
  readonly attachmentId: string;
}

export interface PrivateObjectLocator extends EvidenceObjectScope {
  readonly objectKey: string;
}

export interface PrivateReadAccessMetadata {
  readonly visibility: "private";
  readonly signedRead: {
    readonly supported: boolean;
    readonly maxTtlSeconds: number | null;
  };
  /** A stored evidence object never has a permanent public URL. */
  readonly publicUrl?: never;
}

export interface PrivateObjectStorageCapabilities {
  readonly backendClass: "durable-object-store" | "ephemeral-test-double";
  readonly durable: boolean;
  readonly horizontallyScalable: boolean;
  readonly privateByDefault: true;
  readonly generatedKeysOnly: true;
  readonly supportsIdempotentPut: boolean;
  readonly deleteIsIdempotent: true;
  readonly signedRead: {
    readonly supported: boolean;
    readonly maxTtlSeconds: number | null;
  };
}

export interface PutPrivateEvidenceObjectInput extends EvidenceObjectScope {
  readonly bytes: Uint8Array;
  readonly declaredMediaType: string;
  /**
   * Untrusted display-only input. Implementations must not use it to create a
   * key or decide the stored media type/extension.
   */
  readonly clientFilename?: string;
  /** Stable per logical upload; reuse with different content is a conflict. */
  readonly idempotencyKey: string;
}

export interface PrivateEvidenceObjectMetadata extends PrivateObjectLocator {
  readonly mediaType: EvidenceMediaType;
  readonly extension: EvidenceMediaExtension;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly createdAt: string;
  readonly access: PrivateReadAccessMetadata;
}

export interface PutPrivateEvidenceObjectResult {
  readonly disposition: "created" | "idempotent_replay";
  readonly object: PrivateEvidenceObjectMetadata;
}

export interface PrivateEvidenceObjectRead {
  readonly object: PrivateEvidenceObjectMetadata;
  readonly bytes: Uint8Array;
}

export interface DeletePrivateEvidenceObjectResult extends PrivateObjectLocator {
  /** Repeated and cross-scope deletes return not_found and do not throw. */
  readonly status: "deleted" | "not_found";
}

export interface CreateSignedPrivateReadAccessInput extends PrivateObjectLocator {
  readonly ttlSeconds: number;
}

export interface SignedPrivateReadAccess extends PrivateObjectLocator {
  readonly kind: "signed_private_read";
  readonly signedUrl: string;
  readonly expiresAt: string;
  readonly publicUrl?: never;
}

export type PrivateObjectStorageErrorCode =
  | "invalid_input"
  | "invalid_media"
  | "idempotency_conflict"
  | "not_found"
  | "unsupported_capability"
  | "storage_unavailable";

export class PrivateObjectStorageError extends Error {
  constructor(
    readonly code: PrivateObjectStorageErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "PrivateObjectStorageError";
  }
}

export interface PrivateEvidenceObjectStorage {
  readonly capabilities: PrivateObjectStorageCapabilities;

  put(input: PutPrivateEvidenceObjectInput): Promise<PutPrivateEvidenceObjectResult>;

  /** Missing objects, including scope mismatches, resolve to null. */
  get(locator: PrivateObjectLocator): Promise<PrivateEvidenceObjectRead | null>;

  /** Delete is idempotent; not-found is represented in the result. */
  delete(locator: PrivateObjectLocator): Promise<DeletePrivateEvidenceObjectResult>;

  /**
   * Issues time-limited private access when capabilities.signedRead.supported
   * is true. A signed URL is a temporary credential, never a public object URL.
   */
  createSignedReadAccess(
    input: CreateSignedPrivateReadAccessInput,
  ): Promise<SignedPrivateReadAccess>;
}

export const PRODUCTION_PRIVATE_STORAGE_REQUIREMENTS = Object.freeze({
  backendClass: "durable-object-store",
  durable: true,
  horizontallyScalable: true,
  privateByDefault: true,
  generatedKeysOnly: true,
  deleteIsIdempotent: true,
} as const);

/** Fail startup/configuration rather than silently using process-local storage. */
export function assertDurableScalablePrivateStorage(
  storage: Pick<PrivateEvidenceObjectStorage, "capabilities">,
): void {
  const capability = storage.capabilities;
  if (
    capability.backendClass !== "durable-object-store"
    || !capability.durable
    || !capability.horizontallyScalable
    || !capability.privateByDefault
    || !capability.generatedKeysOnly
    || !capability.deleteIsIdempotent
  ) {
    throw new PrivateObjectStorageError(
      "unsupported_capability",
      "Production evidence storage must be durable, horizontally scalable, private, and generated-key-only",
    );
  }
}
