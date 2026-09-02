export type LaunchCapabilityState = {
  durableEvidence: boolean;
  durableConsent: boolean;
  durableHumanReview: boolean;
  verifiedPaymentEntitlement: boolean;
  verifiedEmailDelivery: boolean;
};

export type LaunchReadinessCheck = {
  key: string;
  ready: boolean;
  detail: string;
};

export type LaunchReadinessReport = {
  ready: boolean;
  checkedAt: string;
  checks: LaunchReadinessCheck[];
};

function configured(env: NodeJS.ProcessEnv, key: string, minimumLength = 1): boolean {
  return (env[key]?.trim().length ?? 0) >= minimumLength;
}

function validPublicOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value.replace(/\/$/, "") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function evaluateLaunchReadiness(
  env: NodeJS.ProcessEnv,
  capabilities: LaunchCapabilityState,
  now = new Date(),
): LaunchReadinessReport {
  const checks: LaunchReadinessCheck[] = [
    { key: "database", ready: configured(env, "DATABASE_URL"), detail: "DATABASE_URL is configured." },
    { key: "session_secret", ready: configured(env, "DRIVABLE_SESSION_SECRET", 32), detail: "Session secret has at least 32 characters." },
    { key: "reviewer_token", ready: configured(env, "DRIVABLE_REVIEWER_TOKEN", 32), detail: "Reviewer token has at least 32 characters." },
    { key: "beta_invite", ready: configured(env, "DRIVABLE_BETA_INVITE_CODE", 12), detail: "Beta invite code has at least 12 characters." },
    { key: "public_origin", ready: validPublicOrigin(env.DRIVABLE_PUBLIC_ORIGIN?.trim()), detail: "Canonical public origin is an exact HTTPS origin." },
    { key: "terms_version", ready: configured(env, "DRIVABLE_TERMS_VERSION"), detail: "Terms version is configured." },
    { key: "privacy_version", ready: configured(env, "DRIVABLE_PRIVACY_VERSION"), detail: "Privacy version is configured." },
    { key: "consent_version", ready: configured(env, "DRIVABLE_CONSENT_VERSION"), detail: "Consent version is configured." },
    { key: "durable_evidence", ready: capabilities.durableEvidence, detail: "Evidence uses durable private object storage." },
    { key: "durable_consent", ready: capabilities.durableConsent, detail: "Versioned per-purpose consent is durably recorded." },
    { key: "durable_human_review", ready: capabilities.durableHumanReview, detail: "Human-review release state is durable and fail-closed." },
    { key: "payment_entitlement", ready: capabilities.verifiedPaymentEntitlement, detail: "Paid access is verified server-side." },
    { key: "email_delivery", ready: capabilities.verifiedEmailDelivery, detail: "Transactional delivery is configured and verified." },
  ];

  return { ready: checks.every((check) => check.ready), checkedAt: now.toISOString(), checks };
}
