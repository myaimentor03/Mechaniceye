import assert from "node:assert/strict";
import test from "node:test";
import { logEvent, logEventError, logEventWarn } from "./safe-log.js";

const PRIVATE = {
  email: "jordan.driver@example.com",
  phone: "(415) 555-0199",
  token: "secret-bearer-token-value",
};

function capture(kind: "log" | "warn" | "error", run: () => void): string {
  const prior = console[kind];
  let output = "";
  console[kind] = ((line: unknown) => {
    output = String(line);
  }) as typeof console.log;
  try {
    run();
  } finally {
    (console as { [key: string]: unknown })[kind] = prior;
  }
  return output;
}

function assertNoPrivate(output: string): void {
  for (const value of Object.values(PRIVATE)) {
    assert.equal(output.includes(value), false, `output leaked ${value}`);
  }
}

test("logEvent emits a structured JSON line and redacts PII attributes", () => {
  const output = capture("log", () => {
    logEvent("webhook.forward_succeeded", { diagnosisCaseId: "case_1", email: PRIVATE.email, contact: { phone: PRIVATE.phone } });
  });
  const parsed = JSON.parse(output) as Record<string, unknown>;
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.level, "info");
  assert.equal(parsed.event, "webhook.forward_succeeded");
  assertNoPrivate(output);
});

test("logEventWarn emits a warn-severity structured line", () => {
  const output = capture("warn", () => {
    logEventWarn("rate_limit.exceeded", { scope: "auth-login-ip" });
  });
  const parsed = JSON.parse(output) as Record<string, unknown>;
  assert.equal(parsed.level, "warn");
  assert.equal(parsed.event, "rate_limit.exceeded");
});

test("logEventError never leaks the raw error message, stack, or cause", () => {
  const error = new Error(`connection failed ${PRIVATE.token}`, { cause: { token: PRIVATE.token } });
  const output = capture("error", () => {
    logEventError("api.diagnosis_creation_failed", error, { email: PRIVATE.email });
  });
  const parsed = JSON.parse(output) as Record<string, unknown>;
  assert.equal(parsed.level, "error");
  assert.equal(parsed.event, "api.diagnosis_creation_failed");
  assert.equal("error" in parsed, true);
  const serialized = JSON.stringify(parsed.error);
  assert.equal(serialized.includes("message"), false);
  assert.equal(serialized.includes("stack"), false);
  assert.equal(serialized.includes("cause"), false);
  assertNoPrivate(output);
});

test("logEventError with no error still emits a structured line", () => {
  const output = capture("error", () => {
    logEventError("webhook.master_intake_forward_rejected", undefined, { status: 502 });
  });
  const parsed = JSON.parse(output) as Record<string, unknown>;
  assert.equal(parsed.level, "error");
  assert.equal(parsed.status, 502);
  assert.equal("error" in parsed, false);
});