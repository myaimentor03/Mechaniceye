export type SafeErrorCategory =
  | "authentication"
  | "authorization"
  | "conflict"
  | "dependency"
  | "internal"
  | "not_found"
  | "rate_limit"
  | "timeout"
  | "validation";

export interface SafeErrorDetails {
  type: "Error" | "TypeError" | "RangeError" | "SyntaxError" | "NonErrorThrown";
  category: SafeErrorCategory;
  retryable: boolean;
  code?: string;
  status?: number;
}

const SAFE_ERROR_CODES = new Set([
  "CONFLICT",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
]);

function dataProperty(value: object, key: string): unknown {
  let current: object | null = value;
  while (current) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
    } catch {
      return undefined;
    }
    if (descriptor) return "value" in descriptor ? descriptor.value : undefined;
    try {
      current = Object.getPrototypeOf(current) as object | null;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function safeStatus(value: object): number | undefined {
  const raw = dataProperty(value, "status") ?? dataProperty(value, "statusCode");
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 400 && raw <= 599
    ? raw
    : undefined;
}

function safeCode(value: object): string | undefined {
  const raw = dataProperty(value, "code");
  return typeof raw === "string" && SAFE_ERROR_CODES.has(raw) ? raw : undefined;
}

function categoryFor(status: number | undefined, code: string | undefined): SafeErrorCategory {
  if (status === 400 || status === 422 || code === "VALIDATION_ERROR") return "validation";
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 408 || status === 504 || code === "ETIMEDOUT") return "timeout";
  if (status === 429) return "rate_limit";
  if (status === 502 || status === 503) return "dependency";
  return "internal";
}

function errorType(value: unknown): SafeErrorDetails["type"] {
  try {
    if (value instanceof TypeError) return "TypeError";
    if (value instanceof RangeError) return "RangeError";
    if (value instanceof SyntaxError) return "SyntaxError";
    if (value instanceof Error) return "Error";
  } catch {
    return "NonErrorThrown";
  }
  return "NonErrorThrown";
}

/** Serializes only bounded diagnostic fields; messages, stacks, causes, and arbitrary properties are omitted. */
export function serializeErrorSafely(error: unknown): SafeErrorDetails {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) {
    return { type: "NonErrorThrown", category: "internal", retryable: false };
  }

  const status = safeStatus(error);
  const code = safeCode(error);
  const category = categoryFor(status, code);
  const explicitRetryable = dataProperty(error, "retryable");
  const retryable = typeof explicitRetryable === "boolean"
    ? explicitRetryable
    : status === 408 || status === 429 || (status !== undefined && status >= 500);

  return {
    type: errorType(error),
    category,
    retryable,
    ...(code ? { code } : {}),
    ...(status ? { status } : {}),
  };
}
