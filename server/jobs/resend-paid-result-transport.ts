import type { ApprovedPaidResult } from "./paid-delivery-context.js";
import { PaidDeliveryProviderError } from "./paid-result-delivery-consumer.js";
import { IdempotentPaidResultDeliveryProvider } from "./idempotent-paid-result-provider.js";
import type { PaidResultDeliveryTransport } from "./idempotent-paid-result-provider.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Start manual reconciliation one hour before Resend's documented 24-hour retention expires. */
export const RESEND_CONSERVATIVE_RETRY_WINDOW_MS = RESEND_IDEMPOTENCY_WINDOW_MS - 60 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_RETRY_AFTER_MS = 30_000;
const DEFAULT_MAX_BACKOFF_MS = 5_000;

export type ResendEmailPayload = Readonly<{
  from: string;
  to: readonly [string];
  subject: string;
  html: string;
}>;

export type ResendTransportOptions = Readonly<{
  apiKey?: string;
  from?: string;
  fetch?: typeof fetch;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
  maxRetryAfterMs?: number;
  maxBackoffMs?: number;
  requestTimeoutMs?: number;
}>;

export class ResendPaidResultError extends PaidDeliveryProviderError {
  constructor(readonly code: string, retryable: boolean) {
    super(retryable);
    this.name = "ResendPaidResultError";
  }
}

/**
 * Server-side Resend adapter. Every retry sends one pre-rendered immutable body
 * with the original outbox job ID as its idempotency key. After the conservative
 * window, uncertain/replayed jobs are dead-lettered for reconciliation; no new
 * idempotency key is generated. A successful POST means provider acceptance,
 * not recipient mailbox delivery.
 */
export class ResendPaidResultTransport implements PaidResultDeliveryTransport {
  readonly provider = "resend";
  readonly capabilities = Object.freeze({ idempotencyEnforcedByProvider: true });
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxAttempts: number;
  private readonly maxRetryAfterMs: number;
  private readonly maxBackoffMs: number;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: ResendTransportOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    this.maxAttempts = boundedInteger(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, 1, 5, "maxAttempts");
    this.maxRetryAfterMs = boundedInteger(options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS, 0, 60_000, "maxRetryAfterMs");
    this.maxBackoffMs = boundedInteger(options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS, 0, 60_000, "maxBackoffMs");
    this.requestTimeoutMs = boundedInteger(options.requestTimeoutMs ?? 15_000, 100, 120_000, "requestTimeoutMs");
  }

  async send(input: Parameters<PaidResultDeliveryTransport["send"]>[0]): Promise<Readonly<{ providerReference: string; acceptedAt: string }>> {
    const apiKey = this.options.apiKey?.trim();
    const from = this.options.from?.trim();
    if (!apiKey || !from || /[\r\n]/.test(apiKey) || !validFrom(from)) {
      throw new ResendPaidResultError("resend_configuration_missing_or_invalid", false);
    }
    if (!isStableKey(input.idempotencyKey) || !strictIso(input.jobCreatedAt) || !validEmail(input.recipient)) {
      throw new ResendPaidResultError("resend_request_binding_invalid", false);
    }
    const createdAt = Date.parse(input.jobCreatedAt);
    const requestDeadline = createdAt + RESEND_CONSERVATIVE_RETRY_WINDOW_MS;
    const payload: ResendEmailPayload = Object.freeze({
      from,
      to: Object.freeze([input.recipient]) as readonly [string],
      subject: "Your Drivable vehicle review is ready",
      html: renderApprovedResult(input.approvedResult),
    });
    // Capture once; every attempt uses the byte-identical JSON request body.
    const requestBody = JSON.stringify(payload);
    let lastRetryable: ResendPaidResultError | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (this.now().getTime() >= requestDeadline) {
        throw new ResendPaidResultError("resend_idempotency_window_elapsed_reconciliation_required", false);
      }
      let response: Response;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        try {
          response = await this.fetcher(RESEND_ENDPOINT, {
            method: "POST",
            headers: Object.freeze({
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": input.idempotencyKey,
            }),
            body: requestBody,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        lastRetryable = new ResendPaidResultError("resend_transport_ambiguous", true);
        if (attempt === this.maxAttempts) throw lastRetryable;
        await this.waitBeforeRetry(backoff(attempt, this.maxBackoffMs), requestDeadline);
        continue;
      }

      const body = await safeJson(response);
      if (response.ok) {
        if (!body || typeof body.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(body.id)) {
          lastRetryable = new ResendPaidResultError("resend_acceptance_response_ambiguous", true);
          if (attempt === this.maxAttempts) throw lastRetryable;
          await this.waitBeforeRetry(backoff(attempt, this.maxBackoffMs), requestDeadline);
          continue;
        }
        return Object.freeze({ providerReference: body.id, acceptedAt: this.now().toISOString() });
      }

      const providerCode = safeProviderCode(body);
      if (response.status === 409 && providerCode === "invalid_idempotent_request") {
        throw new ResendPaidResultError("resend_idempotency_payload_mismatch_reconciliation_required", false);
      }
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"), this.now().getTime());
      const retryable = (response.status === 409 && providerCode === "concurrent_idempotent_requests")
        || (response.status === 429 && providerCode === "rate_limit_exceeded")
        || response.status === 408 || response.status === 425 || response.status === 500 || response.status === 502
        || response.status === 503 || response.status === 504;
      if (!retryable) {
        throw new ResendPaidResultError(permanentErrorCode(response.status, providerCode), false);
      }
      if (retryAfter !== null && retryAfter > this.maxRetryAfterMs) {
        throw new ResendPaidResultError("resend_retry_after_exceeds_safe_bound_reconciliation_required", false);
      }
      lastRetryable = new ResendPaidResultError(retryableErrorCode(response.status, providerCode), true);
      if (attempt === this.maxAttempts) throw lastRetryable;
      await this.waitBeforeRetry(retryAfter ?? backoff(attempt, this.maxBackoffMs), requestDeadline);
    }
    throw lastRetryable ?? new ResendPaidResultError("resend_delivery_failed", false);
  }

  private async waitBeforeRetry(milliseconds: number, requestDeadline: number): Promise<void> {
    if (this.now().getTime() + milliseconds >= requestDeadline) {
      throw new ResendPaidResultError("resend_idempotency_window_elapsed_reconciliation_required", false);
    }
    if (milliseconds > 0) await this.sleep(milliseconds);
  }
}

/** Compose the provider from server-side environment values; construction does not send or start a worker. */
export function createResendPaidResultProvider(
  options: Omit<ResendTransportOptions, "apiKey" | "from"> = {},
  environment: Readonly<Record<string, string | undefined>> = process.env,
): IdempotentPaidResultDeliveryProvider {
  return new IdempotentPaidResultDeliveryProvider(new ResendPaidResultTransport({
    ...options,
    apiKey: environment.RESEND_API_KEY,
    from: environment.RESEND_PAID_RESULT_FROM,
  }));
}

function renderApprovedResult(result: ApprovedPaidResult): string {
  const content = canonicalJson(result.content);
  return `<!doctype html><html><body><main><h1>Your Drivable vehicle review is ready</h1>`
    + `<p>The email provider accepted this human-reviewed result. This does not confirm inbox delivery `
    + `or guarantee vehicle condition.</p>`
    + `<p><strong>Vehicle:</strong> ${escapeHtml(result.content.vehicleInfo)}</p>`
    + `<p><strong>Outcome:</strong> ${escapeHtml(String(result.content.outcome ?? "reviewed"))}</p>`
    + `<h2>Approved review details</h2><pre>${escapeHtml(content)}</pre></main></body></html>`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function validFrom(value: string): boolean {
  if (/[\r\n]/.test(value)) return false;
  const address = /<([^<>]+)>/.exec(value)?.[1] ?? value;
  return validEmail(address);
}

function isStableKey(value: string): boolean {
  return value.length >= 8 && value.length <= 256 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function strictIso(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`Invalid ${name}`);
  return value;
}

function safeProviderCode(body: Record<string, unknown> | null): string {
  const candidate = body?.name ?? body?.type ?? body?.code;
  return typeof candidate === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(candidate) ? candidate : "unknown_provider_error";
}

function retryableErrorCode(status: number, providerCode: string): string {
  if (status === 409) return "resend_concurrent_idempotent_request";
  if (status === 429) return "resend_rate_limited";
  if (providerCode === "service_unavailable" || status === 503) return "resend_service_unavailable";
  return "resend_transient_provider_error";
}

function permanentErrorCode(status: number, providerCode: string): string {
  if (providerCode === "daily_quota_exceeded" || providerCode === "monthly_quota_exceeded") return "resend_quota_blocked";
  if (status === 401 || status === 403) return "resend_auth_or_sender_rejected";
  if (status === 400 || status === 422) return "resend_request_rejected";
  return "resend_permanent_provider_error";
}

function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function backoff(attempt: number, cap: number): number {
  return Math.min(cap, 250 * (2 ** (attempt - 1)));
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
