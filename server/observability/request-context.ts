import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id" as const;
export const CORRELATION_ID_HEADER = "x-correlation-id" as const;

export interface ObservabilityRequestContext {
  requestId: string;
  correlationId: string;
}

export interface HeaderGetter {
  get(name: string): string | null;
}

export type HeaderSource =
  | HeaderGetter
  | Readonly<Record<string, string | readonly string[] | undefined>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createRequestId(): string {
  return randomUUID();
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function isSafeObservabilityId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function requestIdFrom(candidate: unknown): string {
  return isSafeObservabilityId(candidate) ? candidate.toLowerCase() : createRequestId();
}

export function correlationIdFrom(candidate: unknown, fallbackRequestId?: string): string {
  if (isSafeObservabilityId(candidate)) return candidate.toLowerCase();
  return isSafeObservabilityId(fallbackRequestId) ? fallbackRequestId.toLowerCase() : createCorrelationId();
}

function readHeader(headers: HeaderSource | undefined, headerName: string): string | undefined {
  if (!headers) return undefined;

  if (typeof (headers as HeaderGetter).get === "function") {
    const value = (headers as HeaderGetter).get(headerName);
    return typeof value === "string" ? value : undefined;
  }

  const record = headers as Readonly<Record<string, string | readonly string[] | undefined>>;
  const matchingKey = Object.keys(record).find((key) => key.toLowerCase() === headerName);
  const value = matchingKey ? record[matchingKey] : undefined;
  return typeof value === "string" ? value : undefined;
}

export function createRequestContext(headers?: HeaderSource): ObservabilityRequestContext {
  const requestId = requestIdFrom(readHeader(headers, REQUEST_ID_HEADER));
  const correlationId = correlationIdFrom(readHeader(headers, CORRELATION_ID_HEADER), requestId);
  return { requestId, correlationId };
}

export function observabilityResponseHeaders(
  context: ObservabilityRequestContext,
): Readonly<Record<typeof REQUEST_ID_HEADER | typeof CORRELATION_ID_HEADER, string>> {
  const requestId = requestIdFrom(context.requestId);
  return {
    [REQUEST_ID_HEADER]: requestId,
    [CORRELATION_ID_HEADER]: correlationIdFrom(context.correlationId, requestId),
  };
}
