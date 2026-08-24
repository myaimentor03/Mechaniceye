import type { RecipientIdentityBinding, ReviewVersionBindings } from "./types.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const REVIEWER_REF = /^reviewer_[A-Za-z0-9_-]{8,120}$/;
const SHA256_DIGEST = /^[a-f0-9]{64}$/;
const VERSION_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function assertSafeId(value: string, field: string): void {
  if (!SAFE_ID.test(value)) {
    throw new ReviewValidationError(`${field} must be an opaque safe identifier`);
  }
}

export function assertReviewerRef(value: string): void {
  if (!REVIEWER_REF.test(value)) {
    throw new ReviewValidationError("reviewerRef must be an opaque reviewer reference");
  }
}

export function isValidRecipientBinding(binding: RecipientIdentityBinding): boolean {
  return binding.algorithm === "sha256"
    && SHA256_DIGEST.test(binding.digest)
    && VERSION_TOKEN.test(binding.bindingVersion);
}

export function assertRecipientBinding(binding: RecipientIdentityBinding): void {
  if (!isValidRecipientBinding(binding)) {
    throw new ReviewValidationError(
      "recipient must contain only a SHA-256 identity digest and binding version",
    );
  }
}

export function assertArtifactDigest(value: string): void {
  if (!SHA256_DIGEST.test(value)) {
    throw new ReviewValidationError("artifactDigest must be a lowercase SHA-256 digest");
  }
}

export function assertVersionBindings(bindings: ReviewVersionBindings): void {
  const values = {
    policyVersion: bindings.policyVersion,
    modelVersion: bindings.modelVersion,
    evidenceVersion: bindings.evidenceVersion,
  };
  for (const [field, value] of Object.entries(values)) {
    if (!VERSION_TOKEN.test(value)) {
      throw new ReviewValidationError(`${field} must be an opaque version token`);
    }
  }
}

export function sameRecipient(
  left: RecipientIdentityBinding,
  right: RecipientIdentityBinding,
): boolean {
  return left.algorithm === right.algorithm
    && left.digest === right.digest
    && left.bindingVersion === right.bindingVersion;
}

export function sameVersionBindings(
  left: ReviewVersionBindings,
  right: ReviewVersionBindings,
): boolean {
  return left.policyVersion === right.policyVersion
    && left.modelVersion === right.modelVersion
    && left.evidenceVersion === right.evidenceVersion;
}

export class ReviewValidationError extends Error {
  readonly code = "invalid_review_input";

  constructor(message: string) {
    super(message);
    this.name = "ReviewValidationError";
  }
}
