import assert from "node:assert/strict";
import test from "node:test";
import {
  LAUNCH_METRIC_NAMES,
  OBSERVABILITY_EVENT_NAMES,
  REDACTED_VALUE,
  buildObservabilityEvent,
  createRequestContext,
  isSafeObservabilityId,
  observabilityResponseHeaders,
  recordLaunchMetric,
  sanitizeForObservability,
  serializeErrorSafely,
  stringifyObservabilityEvent,
} from "./index.js";

const PRIVATE_VALUES = {
  email: "casey.driver@example.com",
  phone: "(415) 555-0199",
  vin: "1HGCM82633A004352",
  token: "top-secret-token-value",
  cookie: "sid=private-cookie-value",
  authorization: "Bearer private-access-token",
  freeText: "Customer says the car shakes near their home",
};

function assertNoPrivateValues(serialized: string): void {
  for (const value of Object.values(PRIVATE_VALUES)) {
    assert.equal(serialized.includes(value), false, `serialized output leaked ${value}`);
  }
}

test("structured events recursively redact PII, credentials, free text, and sensitive keys", () => {
  const attributes: Record<string, unknown> = {
    mode: "buy",
    contact: {
      email: PRIVATE_VALUES.email,
      phone_number: PRIVATE_VALUES.phone,
    },
    vehicle: { vin: PRIVATE_VALUES.vin, result: "review_required" },
    credentials: {
      accessToken: PRIVATE_VALUES.token,
      cookie: PRIVATE_VALUES.cookie,
      authorization: PRIVATE_VALUES.authorization,
    },
    notes: PRIVATE_VALUES.freeText,
    innocuous: `Reach ${PRIVATE_VALUES.email} at ${PRIVATE_VALUES.phone} about ${PRIVATE_VALUES.vin}`,
    embeddedAuth: PRIVATE_VALUES.authorization,
  };
  attributes.self = attributes;

  const event = buildObservabilityEvent({
    event: OBSERVABILITY_EVENT_NAMES.ANALYSIS_COMPLETED,
    attributes,
    timestamp: new Date("2026-08-24T12:00:00.000Z"),
  });
  const serialized = stringifyObservabilityEvent(event);

  assertNoPrivateValues(serialized);
  assert.equal(serialized.includes("private-access-token"), false);
  assert.equal(serialized.includes("[REDACTED_EMAIL]"), true);
  assert.equal(serialized.includes("[REDACTED_PHONE]"), true);
  assert.equal(serialized.includes("[REDACTED_VIN]"), true);
  assert.equal(serialized.includes("[CIRCULAR]"), true);
  assert.equal(event.event, "launch.analysis.completed");
  assert.equal(event.schemaVersion, 1);
  assert.throws(
    () => buildObservabilityEvent({ event: PRIVATE_VALUES.email as never }),
    /Unknown observability event name/,
  );
  assert.throws(
    () => buildObservabilityEvent({
      event: OBSERVABILITY_EVENT_NAMES.APP_READY,
      level: PRIVATE_VALUES.token as never,
    }),
    /Unknown observability level/,
  );

  const maliciousContext = buildObservabilityEvent({
    event: OBSERVABILITY_EVENT_NAMES.HTTP_REQUEST_COMPLETED,
    context: {
      requestId: PRIVATE_VALUES.email,
      correlationId: PRIVATE_VALUES.authorization,
    },
  });
  assertNoPrivateValues(stringifyObservabilityEvent(maliciousContext));
});

test("redaction does not invoke accessors and also cleans sensitive object keys", () => {
  let getterCalled = false;
  const input = {
    [`owner-${PRIVATE_VALUES.email}`]: "present",
    get dangerous() {
      getterCalled = true;
      return PRIVATE_VALUES.token;
    },
  };

  const serialized = JSON.stringify(sanitizeForObservability(input));
  assert.equal(getterCalled, false);
  assertNoPrivateValues(serialized);
  assert.equal(serialized.includes("[ACCESSOR]"), true);
});

test("request helpers retain UUIDs but replace injected or private identifiers", () => {
  const trustedRequestId = "d9428888-122b-4c26-9f56-0c5b987c1844";
  const trustedCorrelationId = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const trusted = createRequestContext({
    "X-Request-ID": trustedRequestId,
    "x-correlation-id": trustedCorrelationId,
  });
  assert.deepEqual(trusted, {
    requestId: trustedRequestId,
    correlationId: trustedCorrelationId,
  });

  const untrusted = createRequestContext({
    "x-request-id": PRIVATE_VALUES.email,
    "x-correlation-id": PRIVATE_VALUES.authorization,
  });
  assert.equal(isSafeObservabilityId(untrusted.requestId), true);
  assert.equal(isSafeObservabilityId(untrusted.correlationId), true);
  assert.notEqual(untrusted.requestId, PRIVATE_VALUES.email);
  assert.notEqual(untrusted.correlationId, PRIVATE_VALUES.authorization);
  assertNoPrivateValues(JSON.stringify(observabilityResponseHeaders(untrusted)));
});

test("safe error serialization never exposes messages, stacks, causes, or unsafe codes", () => {
  const error = new Error(
    `${PRIVATE_VALUES.freeText}; ${PRIVATE_VALUES.email}; ${PRIVATE_VALUES.authorization}`,
    { cause: { token: PRIVATE_VALUES.token } },
  ) as Error & { code: string; status: number; cookie: string };
  error.code = PRIVATE_VALUES.token;
  error.status = 503;
  error.cookie = PRIVATE_VALUES.cookie;

  const safe = serializeErrorSafely(error);
  const serialized = JSON.stringify(safe);
  assertNoPrivateValues(serialized);
  assert.deepEqual(safe, {
    type: "Error",
    category: "dependency",
    retryable: true,
    status: 503,
  });
  assert.equal("message" in safe, false);
  assert.equal("stack" in safe, false);
  assert.equal("cause" in safe, false);
});

test("launch metrics use a fixed name set, finite values, and redacted tags", () => {
  const metric = recordLaunchMetric({
    name: LAUNCH_METRIC_NAMES.ANALYSIS_DURATION_MS,
    kind: "histogram",
    value: 812.5,
    tags: {
      mode: "diagnose",
      email: PRIVATE_VALUES.email,
      details: `${PRIVATE_VALUES.phone} ${PRIVATE_VALUES.vin}`,
      token: PRIVATE_VALUES.token,
    },
    timestamp: new Date("2026-08-24T12:00:00.000Z"),
  });

  const serialized = stringifyObservabilityEvent(metric);
  assertNoPrivateValues(serialized);
  assert.equal(metric.event, OBSERVABILITY_EVENT_NAMES.METRIC_RECORDED);
  assert.match(serialized, /launch_analysis_duration_ms/);
  assert.throws(
    () => recordLaunchMetric({
      name: LAUNCH_METRIC_NAMES.ACTIVE_REQUESTS,
      kind: "gauge",
      value: Number.NaN,
    }),
    /finite/,
  );
  assert.throws(
    () => recordLaunchMetric({
      name: PRIVATE_VALUES.email as never,
      kind: "counter",
      value: 1,
    }),
    /Unknown launch metric name/,
  );
  assert.throws(
    () => recordLaunchMetric({
      name: LAUNCH_METRIC_NAMES.HTTP_REQUESTS_TOTAL,
      kind: PRIVATE_VALUES.token as never,
      value: 1,
    }),
    /Unknown launch metric kind/,
  );
});

test("sensitive top-level values use the stable redaction marker", () => {
  const safe = sanitizeForObservability({ email: PRIVATE_VALUES.email });
  assert.deepEqual(safe, { email: REDACTED_VALUE });
});
