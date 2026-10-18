/**
 * Test-only adapter that exposes the synchronous in-memory review fake through
 * the async `DurableReviewRepository` surface the JourneyReviewBridge consumes.
 *
 * It reports the honest ephemeral capabilities of the underlying fake, so any
 * production code path that demands durability (PostgresDurableReviewRepository
 * constructor, assertDurableReviewRepository) will reject it. Only tests that
 * explicitly assert the fail-closed durability gate may use it for that purpose.
 */
import { InMemoryReviewRepository, type InMemoryReviewRepositoryOptions } from "./in-memory-review-repository.js";
import type { DurableReviewRepository } from "./durable-review-repository.js";
import type {
  CreateFinalReviewVersionInput,
  CreateReviewVersionInput,
  ApproveReviewVersionInput,
  RejectReviewVersionInput,
  SupersedeReviewVersionInput,
} from "./types.js";

export class InMemoryAsyncReviewRepository implements DurableReviewRepository {
  readonly capabilities;

  private readonly delegate: InMemoryReviewRepository;

  constructor(options: InMemoryReviewRepositoryOptions = {}) {
    this.delegate = new InMemoryReviewRepository(options);
    this.capabilities = this.delegate.capabilities;
  }

  async createDraft(input: CreateReviewVersionInput) {
    return this.delegate.createDraft(input);
  }

  async createFinal(input: CreateFinalReviewVersionInput) {
    return this.delegate.createFinal(input);
  }

  async approve(input: ApproveReviewVersionInput) {
    return this.delegate.approve(input);
  }

  async reject(input: RejectReviewVersionInput) {
    return this.delegate.reject(input);
  }

  async supersede(input: SupersedeReviewVersionInput) {
    return this.delegate.supersede(input);
  }

  async getVersion(versionId: string) {
    return this.delegate.getVersion(versionId);
  }

  async getVersionState(versionId: string) {
    return this.delegate.getVersionState(versionId);
  }

  async getCurrentVersionId(caseId: string) {
    return this.delegate.getCurrentVersionId(caseId);
  }
}
