import { serializeErrorSafely } from "./errors.js";
import { sanitizeForObservability } from "./privacy.js";

type LogAttributes = Readonly<Record<string, unknown>>;

function safeLine(
  level: "info" | "warn" | "error",
  event: string,
  attributes?: LogAttributes,
  error?: unknown,
): string {
  const payload = sanitizeForObservability({
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(attributes ?? {}),
    ...(error !== undefined ? { error: serializeErrorSafely(error) } : {}),
  });
  return JSON.stringify(payload);
}

/**
 * Structured logging that always passes attributes through the observability
 * privacy layer and never serializes raw Error objects, messages, or stacks.
 */
export function logEvent(event: string, attributes?: LogAttributes): void {
  console.log(safeLine("info", event, attributes));
}

export function logEventWarn(event: string, attributes?: LogAttributes): void {
  console.warn(safeLine("warn", event, attributes));
}

export function logEventError(event: string, error: unknown, attributes?: LogAttributes): void {
  console.error(safeLine("error", event, attributes, error));
}