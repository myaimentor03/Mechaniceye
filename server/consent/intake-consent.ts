import { randomUUID } from "node:crypto";
import {
  CONSENT_PURPOSES,
  ConsentPurpose,
  appendConsentEvent,
  createConsentAcceptedEvent,
  createConsentPolicyConfig,
  createConsentRevokedEvent,
  decideConsentAuthorization,
  type ConsentAcceptedEventV1,
  type ConsentChoices,
  type ConsentEventV1,
  type ConsentPolicyConfig,
} from "../../shared/consent/index.js";
import type { PostgresConsentRepository } from "./postgres-consent-repository.js";

export type IntakeConsentInput = Readonly<{
  actorId: string;
  accountId: string;
  caseId: string;
  choices: unknown;
  hasMedia: boolean;
}>;

export class IntakeConsentError extends Error {
  constructor(
    readonly code: "CONSENT_CONFIGURATION_MISSING" | "CONSENT_REQUIRED" | "CONSENT_PERSISTENCE_FAILED" | "NO_ACCEPTANCE" | "INVALID_PURPOSES",
  ) {
    super(
      code === "CONSENT_REQUIRED" ? "Required consent choices were not accepted" :
      code === "CONSENT_CONFIGURATION_MISSING" ? "Approved consent policy versions are not configured" :
      code === "NO_ACCEPTANCE" ? "No active consent was found for this case" :
      code === "INVALID_PURPOSES" ? "Revocation purposes are not valid" :
      "Consent could not be recorded",
    );
    this.name = "IntakeConsentError";
  }
}

export async function persistAndAuthorizeIntakeConsent(
  repository: Pick<PostgresConsentRepository, "append">,
  input: IntakeConsentInput,
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: () => Date; generateId?: () => string } = {},
) {
  const config = policyFromEnvironment(env);
  const choices = explicitChoices(input.choices);
  if (!choices[ConsentPurpose.ServiceFulfillment] || !choices[ConsentPurpose.HumanReviewSharing]
      || (input.hasMedia && !choices[ConsentPurpose.MediaProcessing])) {
    throw new IntakeConsentError("CONSENT_REQUIRED");
  }
  const event = createConsentAcceptedEvent({
    actorId: input.actorId, accountId: input.accountId, caseId: input.caseId,
    eventId: `consent_${(options.generateId ?? randomUUID)()}`,
    acceptedAt: (options.now ?? (() => new Date()))().toISOString(),
    consentVersion: config.consentVersion, privacyNoticeVersion: config.privacyNoticeVersion,
    termsVersion: config.termsVersion, affirmativeChoices: choices,
  });
  try { await repository.append(event); }
  catch { throw new IntakeConsentError("CONSENT_PERSISTENCE_FAILED"); }

  const fulfillment = decideConsentAuthorization({ events: [event], subject: input,
    action: { kind: "fulfill_service" }, config });
  const review = decideConsentAuthorization({ events: [event], subject: input,
    action: { kind: "share_with_human_reviewer", providerId: "drivable-internal-review" }, config });
  const media = input.hasMedia ? decideConsentAuthorization({ events: [event], subject: input,
    action: { kind: "persist_media", providerId: "drivable-private-evidence" }, config }) : undefined;
  if (!fulfillment.allowed || !review.allowed || (media && !media.allowed)) throw new IntakeConsentError("CONSENT_REQUIRED");
  return Object.freeze({ event, fulfillment, review, media });
}

function explicitChoices(value: unknown): ConsentChoices {
  if (!value || typeof value !== "object") throw new IntakeConsentError("CONSENT_REQUIRED");
  const source = value as Record<string, unknown>;
  for (const purpose of [ConsentPurpose.ServiceFulfillment, ConsentPurpose.MediaProcessing, ConsentPurpose.HumanReviewSharing]) {
    if (typeof source[purpose] !== "boolean") throw new IntakeConsentError("CONSENT_REQUIRED");
  }
  if (source[ConsentPurpose.OptionalProductLearning] !== undefined && typeof source[ConsentPurpose.OptionalProductLearning] !== "boolean") {
    throw new IntakeConsentError("CONSENT_REQUIRED");
  }
  return Object.freeze({
    [ConsentPurpose.ServiceFulfillment]: source[ConsentPurpose.ServiceFulfillment] as boolean,
    [ConsentPurpose.MediaProcessing]: source[ConsentPurpose.MediaProcessing] as boolean,
    [ConsentPurpose.HumanReviewSharing]: source[ConsentPurpose.HumanReviewSharing] as boolean,
    [ConsentPurpose.OptionalProductLearning]: source[ConsentPurpose.OptionalProductLearning] === true,
  });
}

function policyFromEnvironment(env: NodeJS.ProcessEnv): ConsentPolicyConfig {
  const consentVersion = env.DRIVABLE_CONSENT_VERSION?.trim();
  const privacyNoticeVersion = env.DRIVABLE_PRIVACY_VERSION?.trim();
  const termsVersion = env.DRIVABLE_TERMS_VERSION?.trim();
  if (!consentVersion || !privacyNoticeVersion || !termsVersion) throw new IntakeConsentError("CONSENT_CONFIGURATION_MISSING");
  return createConsentPolicyConfig({ consentVersion, privacyNoticeVersion, termsVersion,
    providers: { mediaPersistence: ["drivable-private-evidence"], humanReviewSharing: ["drivable-internal-review"], productLearning: [] },
    retentionDeletionPolicy: { policyId: "drivable-retention", policyVersion: "unapproved-not-for-deletion",
      decide: () => ({ retention: "retain", deletionEligibility: "not_eligible", reasonCode: "owner_policy_required" }) },
  });
}

/**
 * Records a revocation for the subject's most recent acceptance. Revocation is
 * fail-closed: it requires an existing acceptance for the exact subject, and it
 * rejects purposes that were never granted to that subject.
 */
export type ConsentRevocationInput = Readonly<{
  actorId: string;
  accountId: string;
  caseId: string;
  purposes?: unknown;
}>;

export async function recordConsentRevocation(
  repository: Pick<PostgresConsentRepository, "append" | "listForSubject">,
  input: ConsentRevocationInput,
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: () => Date; generateId?: () => string } = {},
): Promise<ConsentEventV1> {
  policyFromEnvironment(env);
  const subject = Object.freeze({ actorId: input.actorId, accountId: input.accountId, caseId: input.caseId });
  let events: readonly ConsentEventV1[];
  try {
    events = await repository.listForSubject(subject);
  } catch {
    throw new IntakeConsentError("CONSENT_PERSISTENCE_FAILED");
  }

  const accepted = events
    .filter((event): event is ConsentAcceptedEventV1 => event.kind === "consent.accepted")
    .slice()
    .sort((left, right) => Date.parse(right.acceptedAt) - Date.parse(left.acceptedAt))[0];
  if (!accepted) throw new IntakeConsentError("NO_ACCEPTANCE");
  const granted = CONSENT_PURPOSES.filter((purpose) => accepted.affirmativeChoices[purpose]);
  if (granted.length === 0) throw new IntakeConsentError("NO_ACCEPTANCE");

  const purposes = explicitRevocationPurposes(input.purposes, granted);
  const revocable = granted.filter((purpose) => purposes.includes(purpose));
  if (revocable.length === 0) throw new IntakeConsentError("INVALID_PURPOSES");

  const event = createConsentRevokedEvent({
    actorId: input.actorId, accountId: input.accountId, caseId: input.caseId,
    eventId: `consent_${(options.generateId ?? randomUUID)()}`,
    acceptanceEventId: accepted.eventId,
    revokedAt: (options.now ?? (() => new Date()))().toISOString(),
    purposes: revocable,
  });

  try {
    appendConsentEvent(events, event);
    return await repository.append(event);
  } catch {
    throw new IntakeConsentError("CONSENT_PERSISTENCE_FAILED");
  }
}

function explicitRevocationPurposes(value: unknown, granted: readonly ConsentPurpose[]): readonly ConsentPurpose[] {
  if (value === undefined) return granted;
  if (!Array.isArray(value) || value.length === 0) throw new IntakeConsentError("INVALID_PURPOSES");
  const purposes: ConsentPurpose[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || !granted.includes(candidate as ConsentPurpose) || !CONSENT_PURPOSES.includes(candidate as ConsentPurpose)) {
      throw new IntakeConsentError("INVALID_PURPOSES");
    }
    purposes.push(candidate as ConsentPurpose);
  }
  return Object.freeze([...new Set(purposes)]);
}
