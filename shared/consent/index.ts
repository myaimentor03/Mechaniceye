export enum ConsentPurpose {
  ServiceFulfillment = "service_fulfillment",
  MediaProcessing = "media_processing",
  HumanReviewSharing = "human_review_sharing",
  OptionalProductLearning = "optional_product_learning",
}

export const CONSENT_EVENT_SCHEMA_VERSION = 1 as const;

export const CONSENT_PURPOSES = Object.freeze([
  ConsentPurpose.ServiceFulfillment,
  ConsentPurpose.MediaProcessing,
  ConsentPurpose.HumanReviewSharing,
  ConsentPurpose.OptionalProductLearning,
] as const);

export type ConsentSubject = Readonly<{
  actorId: string;
  accountId: string;
  caseId: string;
}>;

export type ConsentChoiceInput = Readonly<{
  [ConsentPurpose.ServiceFulfillment]: boolean;
  [ConsentPurpose.MediaProcessing]: boolean;
  [ConsentPurpose.HumanReviewSharing]: boolean;
  [ConsentPurpose.OptionalProductLearning]?: boolean;
}>;

export type ConsentChoices = Readonly<{
  [ConsentPurpose.ServiceFulfillment]: boolean;
  [ConsentPurpose.MediaProcessing]: boolean;
  [ConsentPurpose.HumanReviewSharing]: boolean;
  [ConsentPurpose.OptionalProductLearning]: boolean;
}>;

export type ConsentAcceptedEventV1 = ConsentSubject & Readonly<{
  kind: "consent.accepted";
  schemaVersion: typeof CONSENT_EVENT_SCHEMA_VERSION;
  eventId: string;
  acceptedAt: string;
  consentVersion: string;
  privacyNoticeVersion: string;
  termsVersion: string;
  affirmativeChoices: ConsentChoices;
}>;

export type ConsentRevokedEventV1 = ConsentSubject & Readonly<{
  kind: "consent.revoked";
  schemaVersion: typeof CONSENT_EVENT_SCHEMA_VERSION;
  eventId: string;
  acceptanceEventId: string;
  revokedAt: string;
  purposes: readonly ConsentPurpose[];
}>;

export type ConsentEventV1 = ConsentAcceptedEventV1 | ConsentRevokedEventV1;

export type ConsentAction =
  | Readonly<{ kind: "fulfill_service" }>
  | Readonly<{ kind: "persist_media"; providerId: string }>
  | Readonly<{ kind: "share_with_human_reviewer"; providerId: string }>
  | Readonly<{ kind: "use_for_product_learning"; providerId: string }>;

export type ConsentLifecycleState =
  | "missing"
  | "declined"
  | "active"
  | "partially_revoked"
  | "revoked";

export type RetentionDeletionPolicyContext = Readonly<{
  now: string;
  subject: ConsentSubject;
  consentState: ConsentLifecycleState;
  acceptedAt?: string;
  revokedPurposes: readonly ConsentPurpose[];
}>;

export type RetentionDeletionPolicyOutcome = Readonly<{
  retention: "retain" | "retention_not_required";
  deletionEligibility: "eligible" | "not_eligible";
  reasonCode: string;
  eligibleAt?: string;
}>;

export type RetentionDeletionDecision = RetentionDeletionPolicyOutcome & Readonly<{
  policyId: string;
  policyVersion: string;
  consentState: ConsentLifecycleState;
  revokedPurposes: readonly ConsentPurpose[];
}>;

export type ConsentPolicyConfig = Readonly<{
  consentVersion: string;
  privacyNoticeVersion: string;
  termsVersion: string;
  providers: Readonly<{
    mediaPersistence: readonly string[];
    humanReviewSharing: readonly string[];
    productLearning: readonly string[];
  }>;
  retentionDeletionPolicy: Readonly<{
    policyId: string;
    policyVersion: string;
    decide: (context: RetentionDeletionPolicyContext) => RetentionDeletionPolicyOutcome;
  }>;
}>;

export type ConsentDenialCode =
  | "missing_consent"
  | "wrong_actor"
  | "wrong_account"
  | "wrong_case"
  | "stale_consent"
  | "revoked_consent"
  | "purpose_not_granted"
  | "provider_not_configured";

export type ConsentAuthorizationDecision =
  | Readonly<{
      allowed: true;
      acceptanceEventId: string;
      requiredPurposes: readonly ConsentPurpose[];
    }>
  | Readonly<{
      allowed: false;
      code: ConsentDenialCode;
      requiredPurposes: readonly ConsentPurpose[];
    }>;

export type ConsentAcceptanceInput = ConsentSubject & Readonly<{
  eventId: string;
  acceptedAt: string;
  consentVersion: string;
  privacyNoticeVersion: string;
  termsVersion: string;
  affirmativeChoices: ConsentChoiceInput;
}>;

export type ConsentRevocationInput = ConsentSubject & Readonly<{
  eventId: string;
  acceptanceEventId: string;
  revokedAt: string;
  purposes: readonly ConsentPurpose[];
}>;

export type ConsentAuthorizationInput = Readonly<{
  events: readonly ConsentEventV1[];
  subject: ConsentSubject;
  action: ConsentAction;
  config: ConsentPolicyConfig;
}>;

export type RetentionDeletionInput = Readonly<{
  events: readonly ConsentEventV1[];
  subject: ConsentSubject;
  now: string;
  config: ConsentPolicyConfig;
}>;

export function createConsentPolicyConfig(config: ConsentPolicyConfig): ConsentPolicyConfig {
  requireText(config.consentVersion, "consentVersion");
  requireText(config.privacyNoticeVersion, "privacyNoticeVersion");
  requireText(config.termsVersion, "termsVersion");
  requireText(config.retentionDeletionPolicy.policyId, "retentionDeletionPolicy.policyId");
  requireText(config.retentionDeletionPolicy.policyVersion, "retentionDeletionPolicy.policyVersion");
  if (typeof config.retentionDeletionPolicy.decide !== "function") {
    throw new TypeError("retentionDeletionPolicy.decide is required");
  }

  const providers = Object.freeze({
    mediaPersistence: freezeProviderIds(config.providers.mediaPersistence, "mediaPersistence"),
    humanReviewSharing: freezeProviderIds(config.providers.humanReviewSharing, "humanReviewSharing"),
    productLearning: freezeProviderIds(config.providers.productLearning, "productLearning"),
  });

  return Object.freeze({
    ...config,
    providers,
    retentionDeletionPolicy: Object.freeze({ ...config.retentionDeletionPolicy }),
  });
}

export function createConsentAcceptedEvent(input: ConsentAcceptanceInput): ConsentAcceptedEventV1 {
  requireEventIdentity(input);
  requireIsoDate(input.acceptedAt, "acceptedAt");
  requireText(input.consentVersion, "consentVersion");
  requireText(input.privacyNoticeVersion, "privacyNoticeVersion");
  requireText(input.termsVersion, "termsVersion");

  const affirmativeChoices = Object.freeze({
    [ConsentPurpose.ServiceFulfillment]: requireBoolean(
      input.affirmativeChoices[ConsentPurpose.ServiceFulfillment],
      ConsentPurpose.ServiceFulfillment,
    ),
    [ConsentPurpose.MediaProcessing]: requireBoolean(
      input.affirmativeChoices[ConsentPurpose.MediaProcessing],
      ConsentPurpose.MediaProcessing,
    ),
    [ConsentPurpose.HumanReviewSharing]: requireBoolean(
      input.affirmativeChoices[ConsentPurpose.HumanReviewSharing],
      ConsentPurpose.HumanReviewSharing,
    ),
    [ConsentPurpose.OptionalProductLearning]:
      input.affirmativeChoices[ConsentPurpose.OptionalProductLearning] === undefined
        ? false
        : requireBoolean(
            input.affirmativeChoices[ConsentPurpose.OptionalProductLearning],
            ConsentPurpose.OptionalProductLearning,
          ),
  });

  if (!CONSENT_PURPOSES.some((purpose) => affirmativeChoices[purpose])) {
    throw new TypeError("At least one purpose must have an affirmative choice");
  }

  return Object.freeze({
    kind: "consent.accepted",
    schemaVersion: CONSENT_EVENT_SCHEMA_VERSION,
    eventId: input.eventId,
    acceptedAt: input.acceptedAt,
    actorId: input.actorId,
    accountId: input.accountId,
    caseId: input.caseId,
    consentVersion: input.consentVersion,
    privacyNoticeVersion: input.privacyNoticeVersion,
    termsVersion: input.termsVersion,
    affirmativeChoices,
  });
}

export function createConsentRevokedEvent(input: ConsentRevocationInput): ConsentRevokedEventV1 {
  requireEventIdentity(input);
  requireText(input.acceptanceEventId, "acceptanceEventId");
  requireIsoDate(input.revokedAt, "revokedAt");
  if (input.purposes.length === 0) {
    throw new TypeError("At least one revoked purpose is required");
  }
  const purposes = Object.freeze([...new Set(input.purposes)]);
  for (const purpose of purposes) {
    if (!CONSENT_PURPOSES.includes(purpose)) {
      throw new TypeError(`Unknown consent purpose: ${String(purpose)}`);
    }
  }

  return Object.freeze({
    kind: "consent.revoked",
    schemaVersion: CONSENT_EVENT_SCHEMA_VERSION,
    eventId: input.eventId,
    acceptanceEventId: input.acceptanceEventId,
    revokedAt: input.revokedAt,
    actorId: input.actorId,
    accountId: input.accountId,
    caseId: input.caseId,
    purposes,
  });
}

export function appendConsentEvent(
  events: readonly ConsentEventV1[],
  event: ConsentEventV1,
): readonly ConsentEventV1[] {
  if (events.some((existing) => existing.eventId === event.eventId)) {
    throw new TypeError(`Duplicate consent event ID: ${event.eventId}`);
  }

  if (event.kind === "consent.revoked") {
    const accepted = events.find(
      (candidate): candidate is ConsentAcceptedEventV1 =>
        candidate.kind === "consent.accepted" && candidate.eventId === event.acceptanceEventId,
    );
    if (!accepted) {
      throw new TypeError(`Acceptance event not found: ${event.acceptanceEventId}`);
    }
    if (!sameSubject(accepted, event)) {
      throw new TypeError("Revocation subject must match its acceptance event");
    }
    if (Date.parse(event.revokedAt) < Date.parse(accepted.acceptedAt)) {
      throw new TypeError("revokedAt cannot precede acceptedAt");
    }
  }

  return Object.freeze([...events, event]);
}

export function decideConsentAuthorization(
  input: ConsentAuthorizationInput,
): ConsentAuthorizationDecision {
  const requiredPurposes = requiredPurposesFor(input.action);
  const acceptedEvents = input.events.filter(
    (event): event is ConsentAcceptedEventV1 => event.kind === "consent.accepted",
  );
  if (acceptedEvents.length === 0) {
    return denied("missing_consent", requiredPurposes);
  }

  const actorMatches = acceptedEvents.filter((event) => event.actorId === input.subject.actorId);
  if (actorMatches.length === 0) {
    return denied("wrong_actor", requiredPurposes);
  }
  const accountMatches = actorMatches.filter((event) => event.accountId === input.subject.accountId);
  if (accountMatches.length === 0) {
    return denied("wrong_account", requiredPurposes);
  }
  const subjectMatches = accountMatches.filter((event) => event.caseId === input.subject.caseId);
  if (subjectMatches.length === 0) {
    return denied("wrong_case", requiredPurposes);
  }

  const accepted = latestAcceptance(subjectMatches);
  if (!accepted) {
    return denied("missing_consent", requiredPurposes);
  }
  if (
    accepted.consentVersion !== input.config.consentVersion ||
    accepted.privacyNoticeVersion !== input.config.privacyNoticeVersion ||
    accepted.termsVersion !== input.config.termsVersion
  ) {
    return denied("stale_consent", requiredPurposes);
  }

  const revokedPurposes = revokedPurposesFor(input.events, accepted);
  if (requiredPurposes.some((purpose) => revokedPurposes.includes(purpose))) {
    return denied("revoked_consent", requiredPurposes);
  }
  if (requiredPurposes.some((purpose) => !accepted.affirmativeChoices[purpose])) {
    return denied("purpose_not_granted", requiredPurposes);
  }

  const provider = providerRequirement(input.action, input.config);
  if (provider && !provider.configuredIds.includes(provider.providerId)) {
    return denied("provider_not_configured", requiredPurposes);
  }

  return Object.freeze({
    allowed: true,
    acceptanceEventId: accepted.eventId,
    requiredPurposes,
  });
}

export function decideRetentionAndDeletion(
  input: RetentionDeletionInput,
): RetentionDeletionDecision {
  requireIsoDate(input.now, "now");
  const accepted = latestAcceptance(
    input.events.filter(
      (event): event is ConsentAcceptedEventV1 =>
        event.kind === "consent.accepted" && sameSubject(event, input.subject),
    ),
  );
  const revokedPurposes = accepted
    ? revokedPurposesFor(input.events, accepted)
    : Object.freeze([] as ConsentPurpose[]);
  const consentState = lifecycleState(accepted, revokedPurposes);
  const outcome = input.config.retentionDeletionPolicy.decide(
    Object.freeze({
      now: input.now,
      subject: Object.freeze({ ...input.subject }),
      consentState,
      acceptedAt: accepted?.acceptedAt,
      revokedPurposes,
    }),
  );
  validateRetentionDeletionOutcome(outcome);

  return Object.freeze({
    ...outcome,
    policyId: input.config.retentionDeletionPolicy.policyId,
    policyVersion: input.config.retentionDeletionPolicy.policyVersion,
    consentState,
    revokedPurposes,
  });
}

function requiredPurposesFor(action: ConsentAction): readonly ConsentPurpose[] {
  switch (action.kind) {
    case "fulfill_service":
      return Object.freeze([ConsentPurpose.ServiceFulfillment]);
    case "persist_media":
      return Object.freeze([
        ConsentPurpose.ServiceFulfillment,
        ConsentPurpose.MediaProcessing,
      ]);
    case "share_with_human_reviewer":
      return Object.freeze([
        ConsentPurpose.ServiceFulfillment,
        ConsentPurpose.MediaProcessing,
        ConsentPurpose.HumanReviewSharing,
      ]);
    case "use_for_product_learning":
      return Object.freeze([
        ConsentPurpose.ServiceFulfillment,
        ConsentPurpose.MediaProcessing,
        ConsentPurpose.OptionalProductLearning,
      ]);
  }
}

function providerRequirement(
  action: ConsentAction,
  config: ConsentPolicyConfig,
): Readonly<{ providerId: string; configuredIds: readonly string[] }> | undefined {
  switch (action.kind) {
    case "fulfill_service":
      return undefined;
    case "persist_media":
      return { providerId: action.providerId, configuredIds: config.providers.mediaPersistence };
    case "share_with_human_reviewer":
      return { providerId: action.providerId, configuredIds: config.providers.humanReviewSharing };
    case "use_for_product_learning":
      return { providerId: action.providerId, configuredIds: config.providers.productLearning };
  }
}

function latestAcceptance(
  acceptedEvents: readonly ConsentAcceptedEventV1[],
): ConsentAcceptedEventV1 | undefined {
  let latest: ConsentAcceptedEventV1 | undefined;
  for (const event of acceptedEvents) {
    if (!latest || Date.parse(event.acceptedAt) > Date.parse(latest.acceptedAt)) {
      latest = event;
    }
  }
  return latest;
}

function revokedPurposesFor(
  events: readonly ConsentEventV1[],
  accepted: ConsentAcceptedEventV1,
): readonly ConsentPurpose[] {
  const revoked = new Set<ConsentPurpose>();
  for (const event of events) {
    if (
      event.kind === "consent.revoked" &&
      event.acceptanceEventId === accepted.eventId &&
      sameSubject(event, accepted)
    ) {
      for (const purpose of event.purposes) revoked.add(purpose);
    }
  }
  return Object.freeze([...revoked]);
}

function lifecycleState(
  accepted: ConsentAcceptedEventV1 | undefined,
  revokedPurposes: readonly ConsentPurpose[],
): ConsentLifecycleState {
  if (!accepted) return "missing";
  const granted = CONSENT_PURPOSES.filter(
    (purpose) => accepted.affirmativeChoices[purpose],
  );
  if (granted.length === 0) return "declined";
  const revokedGrants = granted.filter((purpose) => revokedPurposes.includes(purpose));
  if (revokedGrants.length === 0) return "active";
  return revokedGrants.length === granted.length ? "revoked" : "partially_revoked";
}

function denied(
  code: ConsentDenialCode,
  requiredPurposes: readonly ConsentPurpose[],
): ConsentAuthorizationDecision {
  return Object.freeze({ allowed: false, code, requiredPurposes });
}

function sameSubject(left: ConsentSubject, right: ConsentSubject): boolean {
  return (
    left.actorId === right.actorId &&
    left.accountId === right.accountId &&
    left.caseId === right.caseId
  );
}

function requireEventIdentity(input: ConsentSubject & { eventId: string }): void {
  requireText(input.eventId, "eventId");
  requireText(input.actorId, "actorId");
  requireText(input.accountId, "accountId");
  requireText(input.caseId, "caseId");
}

function requireText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} is required`);
  }
  return value;
}

function requireBoolean(value: boolean, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${field} must be an explicit boolean choice`);
  }
  return value;
}

function requireIsoDate(value: string, field: string): string {
  requireText(value, field);
  if (!Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be an ISO date-time`);
  }
  return value;
}

function freezeProviderIds(ids: readonly string[], field: string): readonly string[] {
  if (!Array.isArray(ids)) {
    throw new TypeError(`providers.${field} is required`);
  }
  for (const id of ids) requireText(id, `providers.${field}`);
  return Object.freeze([...new Set(ids)]);
}

function validateRetentionDeletionOutcome(outcome: RetentionDeletionPolicyOutcome): void {
  if (!outcome || !["retain", "retention_not_required"].includes(outcome.retention)) {
    throw new TypeError("Retention/deletion policy returned an invalid retention decision");
  }
  if (!["eligible", "not_eligible"].includes(outcome.deletionEligibility)) {
    throw new TypeError("Retention/deletion policy returned an invalid deletion eligibility decision");
  }
  requireText(outcome.reasonCode, "retentionDeletionPolicy reasonCode");
  if (outcome.eligibleAt !== undefined) requireIsoDate(outcome.eligibleAt, "eligibleAt");
}
