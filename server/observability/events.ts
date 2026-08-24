import type { ObservabilityRequestContext } from "./request-context.js";
import { correlationIdFrom, requestIdFrom } from "./request-context.js";
import { isObservabilityEventName, type ObservabilityEventName } from "./names.js";
import { sanitizeForObservability, type SafeLogValue } from "./privacy.js";

export type ObservabilityLevel = "debug" | "info" | "warn" | "error";

const OBSERVABILITY_LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error"]);

export interface StructuredObservabilityEvent {
  schemaVersion: 1;
  timestamp: string;
  service: "mechanic-eye";
  event: ObservabilityEventName;
  level: ObservabilityLevel;
  requestId?: string;
  correlationId?: string;
  attributes: SafeLogValue;
}

export interface BuildEventInput {
  event: ObservabilityEventName;
  level?: ObservabilityLevel;
  context?: ObservabilityRequestContext;
  attributes?: unknown;
  timestamp?: Date;
}

export function buildObservabilityEvent(input: BuildEventInput): StructuredObservabilityEvent {
  if (!isObservabilityEventName(input.event)) {
    throw new TypeError("Unknown observability event name");
  }
  if (input.level !== undefined && !OBSERVABILITY_LEVELS.has(input.level)) {
    throw new TypeError("Unknown observability level");
  }
  const timestamp = input.timestamp ?? new Date();
  if (Number.isNaN(timestamp.getTime())) throw new TypeError("Observability timestamp must be valid");
  const requestId = input.context ? requestIdFrom(input.context.requestId) : undefined;
  const correlationId = input.context
    ? correlationIdFrom(input.context.correlationId, requestId)
    : undefined;

  return {
    schemaVersion: 1,
    timestamp: timestamp.toISOString(),
    service: "mechanic-eye",
    event: input.event,
    level: input.level ?? "info",
    ...(requestId ? { requestId } : {}),
    ...(correlationId ? { correlationId } : {}),
    attributes: sanitizeForObservability(input.attributes ?? {}),
  };
}

export function stringifyObservabilityEvent(event: StructuredObservabilityEvent): string {
  return JSON.stringify(sanitizeForObservability(event));
}
