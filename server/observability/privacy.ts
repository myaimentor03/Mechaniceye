export const REDACTED_VALUE = "[REDACTED]" as const;
export const TRUNCATED_VALUE = "[TRUNCATED]" as const;

export type SafeLogValue =
  | null
  | boolean
  | number
  | string
  | SafeLogValue[]
  | { [key: string]: SafeLogValue };

const MAX_DEPTH = 6;
const MAX_COLLECTION_SIZE = 64;
const MAX_STRING_LENGTH = 1_024;

const SENSITIVE_KEYS = new Set([
  "address",
  "apikey",
  "authorization",
  "authtoken",
  "body",
  "cause",
  "comment",
  "comments",
  "cookie",
  "cookies",
  "credential",
  "credentials",
  "description",
  "detail",
  "details",
  "email",
  "emailaddress",
  "freetext",
  "fullname",
  "idtoken",
  "input",
  "message",
  "mobile",
  "name",
  "note",
  "notes",
  "password",
  "passwd",
  "phone",
  "phonenumber",
  "prompt",
  "proxyauthorization",
  "query",
  "reason",
  "refreshtoken",
  "requestbody",
  "responsebody",
  "search",
  "searchterm",
  "secret",
  "session",
  "sessionid",
  "setcookie",
  "stack",
  "street",
  "text",
  "token",
  "transcript",
  "username",
  "userinput",
  "vehicleidentificationnumber",
  "vin",
]);

const SENSITIVE_KEY_PARTS = [
  "apikey",
  "authorization",
  "cookie",
  "credential",
  "email",
  "freetext",
  "password",
  "phone",
  "secret",
  "sessionid",
  "token",
  "transcript",
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const VIN_PATTERN = /\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=[A-HJ-NPR-Z0-9]*\d)[A-HJ-NPR-Z0-9]{17}\b/gi;
const US_PHONE_PATTERN = /(?<![\w])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![\w])/g;
const INTERNATIONAL_PHONE_PATTERN = /(?<![\w])\+\d(?:[\s.-]?\d){7,14}(?![\w])/g;
const AUTH_SCHEME_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,})?\b/g;
const SECRET_ASSIGNMENT_PATTERN = /\b(api[_-]?key|auth|jwt|password|secret|session(?:id)?|token)=([^\s;,]+)/gi;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveFieldName(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEYS.has(normalized) || SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

/** Redacts recognizable PII and credentials that appear inside an otherwise safe field. */
export function redactString(value: string): string {
  const redacted = value
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(VIN_PATTERN, "[REDACTED_VIN]")
    .replace(US_PHONE_PATTERN, "[REDACTED_PHONE]")
    .replace(INTERNATIONAL_PHONE_PATTERN, "[REDACTED_PHONE]")
    .replace(AUTH_SCHEME_PATTERN, "$1 [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_TOKEN]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1=[REDACTED]");

  return redacted.length <= MAX_STRING_LENGTH
    ? redacted
    : `${redacted.slice(0, MAX_STRING_LENGTH)}${TRUNCATED_VALUE}`;
}

function safeKey(key: string): string {
  const redacted = redactString(key);
  return redacted || "[EMPTY_KEY]";
}

function sanitize(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): SafeLogValue {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return "[UNDEFINED]";
  if (typeof value === "function") return "[FUNCTION]";
  if (typeof value === "symbol") return "[SYMBOL]";

  const objectValue = value as object;
  if (depth >= MAX_DEPTH) return TRUNCATED_VALUE;
  if (seen.has(objectValue)) return "[CIRCULAR]";
  seen.add(objectValue);

  let isDate = false;
  let isArray = false;
  try {
    isDate = value instanceof Date;
    isArray = Array.isArray(value);
  } catch {
    return "[UNREADABLE_OBJECT]";
  }

  if (isDate) {
    const dateValue = value as Date;
    try {
      return Number.isNaN(dateValue.getTime()) ? "Invalid Date" : dateValue.toISOString();
    } catch {
      return "[INVALID_DATE]";
    }
  }

  if (isArray) {
    const arrayValue = value as unknown[];
    const safeItems = arrayValue
      .slice(0, MAX_COLLECTION_SIZE)
      .map((item) => sanitize(item, depth + 1, seen));
    if (arrayValue.length > MAX_COLLECTION_SIZE) safeItems.push(TRUNCATED_VALUE);
    return safeItems;
  }

  const safeObject: Record<string, SafeLogValue> = {};
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(objectValue);
  } catch {
    return "[UNREADABLE_OBJECT]";
  }

  const entries = Object.entries(descriptors)
    .filter(([, descriptor]) => descriptor.enumerable)
    .slice(0, MAX_COLLECTION_SIZE);

  for (const [rawKey, descriptor] of entries) {
    const key = safeKey(rawKey);
    if (isSensitiveFieldName(rawKey)) {
      safeObject[key] = REDACTED_VALUE;
    } else if ("value" in descriptor) {
      safeObject[key] = sanitize(descriptor.value, depth + 1, seen);
    } else {
      safeObject[key] = "[ACCESSOR]";
    }
  }

  if (Object.keys(descriptors).length > MAX_COLLECTION_SIZE) {
    safeObject[TRUNCATED_VALUE] = true;
  }
  return safeObject;
}

/**
 * Produces a JSON-safe copy without invoking getters or `toJSON` methods.
 * Sensitive fields are removed at every nesting level and recognizable PII is
 * redacted even when it was placed in a field with an innocuous name.
 */
export function sanitizeForObservability(value: unknown): SafeLogValue {
  return sanitize(value, 0, new WeakSet());
}
