import type { AsyncReviewReleaseReader } from "./async-release-gate.js";
import type { AsyncReviewMutationRepository } from "./postgres-review-writer.js";
import { assertDurableReviewRepository } from "./release-gate.js";
import type { ReviewRepositoryCapabilities } from "./types.js";

/**
 * The single durable review surface: mutations (append-only audit) plus
 * release reads. Consumers that need both halves must never assemble them from
 * an ephemeral test double, so this interface is deliberately only
 * satisfiable by a repository that reports durable capabilities.
 */
export interface DurableReviewRepository
  extends AsyncReviewMutationRepository, AsyncReviewReleaseReader {}

export class NonDurableReviewRepositoryError extends Error {
  readonly code = "NON_DURABLE_REVIEW_REPOSITORY";
  constructor() {
    super("Review repository must be durable, append-only, case-bound, and use generated identifiers");
    this.name = "NonDurableReviewRepositoryError";
  }
}

/**
 * Composes the durable Postgres writer and release reader behind one
 * repository. The durability assertion runs at construction so a wiring
 * mistake fails loudly at boot instead of silently serving ephemeral review
 * state.
 */
export class PostgresDurableReviewRepository implements DurableReviewRepository {
  readonly capabilities: ReviewRepositoryCapabilities;

  constructor(
    private readonly writer: AsyncReviewMutationRepository,
    private readonly reader: AsyncReviewReleaseReader,
  ) {
    try {
      assertDurableReviewRepository(writer);
      assertDurableReviewRepository(reader);
    } catch {
      throw new NonDurableReviewRepositoryError();
    }
    this.capabilities = Object.freeze({
      backendClass: "durable-repository",
      durable: true,
      appendOnlyAudit: true,
      caseBoundTransitions: true,
      generatedIdentifiers: true,
    });
    Object.freeze(this);
  }

  createDraft(input: Parameters<AsyncReviewMutationRepository["createDraft"]>[0]) {
    return this.writer.createDraft(input);
  }

  createFinal(input: Parameters<AsyncReviewMutationRepository["createFinal"]>[0]) {
    return this.writer.createFinal(input);
  }

  approve(input: Parameters<AsyncReviewMutationRepository["approve"]>[0]) {
    return this.writer.approve(input);
  }

  reject(input: Parameters<AsyncReviewMutationRepository["reject"]>[0]) {
    return this.writer.reject(input);
  }

  supersede(input: Parameters<AsyncReviewMutationRepository["supersede"]>[0]) {
    return this.writer.supersede(input);
  }

  getVersion(versionId: string) {
    return this.reader.getVersion(versionId);
  }

  getVersionState(versionId: string) {
    return this.reader.getVersionState(versionId);
  }

  getCurrentVersionId(caseId: string) {
    return this.reader.getCurrentVersionId(caseId);
  }
}
