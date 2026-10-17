import assert from "node:assert/strict";
import test from "node:test";
import type { ApprovedPaidResult } from "./paid-delivery-context.js";
import { createResendPaidResultProvider, ResendPaidResultError, ResendPaidResultTransport,
  RESEND_CONSERVATIVE_RETRY_WINDOW_MS } from "./resend-paid-result-transport.js";

const NOW = "2026-10-16T12:00:00.000Z";
const approvedResult = Object.freeze({
  caseId: "case_test_123", versionId: "review_version_1", artifactDigest: "a".repeat(64),
  recipientEmail: "customer@example.invalid",
  content: Object.freeze({ vehicleInfo: "2018 Honda Civic", description: "<script>alert(1)</script>",
    outcome: "repair" as const, confidenceLevel: "high" as const, confidenceScore: 0.9, riskLevel: "moderate" as const,
    decisionPath: "repair_path" as const, matchedSymptomCategories: [], safetyFlags: [], safetyTriggered: false, evidence: [] }),
}) as ApprovedPaidResult;

function input(overrides: Record<string, unknown> = {}) {
  return { idempotencyKey: "job_stable_delivery_123", jobCreatedAt: NOW,
    recipient: approvedResult.recipientEmail, approvedResult, caseId: approvedResult.caseId,
    versionId: approvedResult.versionId, approvalId: "approval_12345678", ...overrides } as Parameters<ResendPaidResultTransport["send"]>[0];
}

function ok(id = "email_accepted_123") {
  return new Response(JSON.stringify({ id }), { status: 200, headers: { "content-type": "application/json" } });
}

function error(status: number, name: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ name, message: "synthetic provider error" }),
    { status, headers: { "content-type": "application/json", ...headers } });
}

function resendError(code: string, retryable: boolean) {
  return (value: unknown) => value instanceof ResendPaidResultError && value.code === code && value.retryable === retryable;
}

test("Resend retries a concurrent idempotency request with byte-identical body and stable key", async () => {
  const calls: Array<{ url: string; key: string | null; body: string }> = [];
  const waits: number[] = [];
  let nowMs = Date.parse(NOW);
  const transport = new ResendPaidResultTransport({ apiKey: "synthetic_api_key", from: "Drivable <reviews@example.invalid>",
    now: () => new Date(nowMs), sleep: async ms => { waits.push(ms); nowMs += ms; },
    async fetch(url, init) {
      calls.push({ url: String(url), key: new Headers(init?.headers).get("Idempotency-Key"), body: String(init?.body) });
      return calls.length === 1 ? error(409, "concurrent_idempotent_requests", { "retry-after": "2" }) : ok();
    } });
  const accepted = await transport.send(input());
  assert.equal(accepted.providerReference, "email_accepted_123");
  assert.equal(accepted.acceptedAt, new Date(nowMs).toISOString());
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url === "https://api.resend.com/emails"));
  assert.ok(calls.every(call => call.key === "job_stable_delivery_123"));
  assert.equal(calls[0].body, calls[1].body);
  assert.deepEqual(waits, [2_000]);
  const payload = JSON.parse(calls[0].body);
  assert.deepEqual(payload.to, [approvedResult.recipientEmail]);
  assert.match(payload.html, /&lt;script&gt;/);
  assert.doesNotMatch(payload.html, /<script>/);
  assert.match(payload.html, /does not confirm inbox delivery/);
});

test("Resend payload-mismatch conflict is permanent and never generates a replacement key", async () => {
  const keys: string[] = [];
  let calls = 0;
  const transport = new ResendPaidResultTransport({ apiKey: "synthetic_api_key", from: "reviews@example.invalid",
    async fetch(_url, init) { calls += 1; keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      return error(409, "invalid_idempotent_request"); } });
  await assert.rejects(transport.send(input()), resendError("resend_idempotency_payload_mismatch_reconciliation_required", false));
  assert.equal(calls, 1);
  assert.deepEqual(keys, ["job_stable_delivery_123"]);
});

test("Resend honors a bounded rate-limit Retry-After and retries with the same request", async () => {
  const waits: number[] = [];
  let nowMs = Date.parse(NOW);
  let calls = 0;
  const bodies: string[] = [];
  const transport = new ResendPaidResultTransport({ apiKey: "synthetic_api_key", from: "reviews@example.invalid",
    now: () => new Date(nowMs), sleep: async ms => { waits.push(ms); nowMs += ms; },
    async fetch(_url, init) { calls += 1; bodies.push(String(init?.body));
      return calls === 1 ? error(429, "rate_limit_exceeded", { "retry-after": "0.5" }) : ok(); } });
  await transport.send(input());
  assert.equal(calls, 2);
  assert.deepEqual(waits, [500]);
  assert.equal(bodies[0], bodies[1]);
});

test("Resend refuses to retry before a provider Retry-After beyond the safe bound", async () => {
  let calls = 0;
  const transport = new ResendPaidResultTransport({ apiKey: "synthetic_api_key", from: "reviews@example.invalid",
    maxRetryAfterMs: 1_000, async fetch() { calls += 1; return error(429, "rate_limit_exceeded", { "retry-after": "60" }); } });
  await assert.rejects(transport.send(input()), resendError("resend_retry_after_exceeds_safe_bound_reconciliation_required", false));
  assert.equal(calls, 1);
});

test("ambiguous network failure retries inside the conservative 24-hour window with same key and payload", async () => {
  let calls = 0;
  const keys: string[] = [];
  const bodies: string[] = [];
  const transport = new ResendPaidResultTransport({ apiKey: "synthetic_api_key", from: "reviews@example.invalid",
    sleep: async () => {}, async fetch(_url, init) { calls += 1; keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      bodies.push(String(init?.body)); if (calls === 1) throw new TypeError("synthetic socket timeout"); return ok(); } });
  await transport.send(input());
  assert.equal(calls, 2);
  assert.deepEqual(keys, ["job_stable_delivery_123", "job_stable_delivery_123"]);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(RESEND_CONSERVATIVE_RETRY_WINDOW_MS, 23 * 60 * 60 * 1000);
});

test("expired outbox idempotency window requires reconciliation before any HTTP request", async () => {
  let calls = 0;
  const now = Date.parse(NOW);
  const transport = new ResendPaidResultTransport({ apiKey: "synthetic_api_key", from: "reviews@example.invalid",
    now: () => new Date(now), async fetch() { calls += 1; return ok(); } });
  const createdAt = new Date(now - RESEND_CONSERVATIVE_RETRY_WINDOW_MS).toISOString();
  await assert.rejects(transport.send(input({ jobCreatedAt: createdAt })),
    resendError("resend_idempotency_window_elapsed_reconciliation_required", false));
  assert.equal(calls, 0);
});

test("missing configuration and permanent provider errors fail closed without retry", async () => {
  let calls = 0;
  const missing = new ResendPaidResultTransport({ async fetch() { calls += 1; return ok(); } });
  await assert.rejects(missing.send(input()), resendError("resend_configuration_missing_or_invalid", false));
  const unauthorized = new ResendPaidResultTransport({ apiKey: "synthetic_api_key", from: "reviews@example.invalid",
    async fetch() { calls += 1; return error(401, "missing_api_key"); } });
  await assert.rejects(unauthorized.send(input()), resendError("resend_auth_or_sender_rejected", false));
  assert.equal(calls, 1);
});

test("environment factory reads server-side Resend config and missing values still fail closed", async () => {
  let calls = 0;
  const provider = createResendPaidResultProvider({ async fetch() { calls += 1; return ok(); } }, {});
  assert.equal(provider.capabilities.idempotentByKey, true);
  await assert.rejects(provider.deliver({ idempotencyKey: "job_stable_delivery_123",
    job: { jobId: "job_stable_delivery_123", createdAt: NOW } as never,
    approvedResult, authorization: { allowed: true, caseId: approvedResult.caseId,
      versionId: approvedResult.versionId, approvalId: "approval_test", orderId: "order_test",
      casePersistenceVersion: "c".repeat(64), offer: { offerId: "review", offerVersion: "v1",
        label: "Review", amountMinor: 1000, currency: "USD" }, recipient: { algorithm: "sha256",
        digest: "b".repeat(64), bindingVersion: "v1" }, evaluatedAt: NOW } as never }),
    resendError("resend_configuration_missing_or_invalid", false));
  assert.equal(calls, 0);
});

test("retryable Resend responses are bounded and return a retryable error to the durable outbox", async () => {
  let calls = 0;
  const transport = new ResendPaidResultTransport({ apiKey: "synthetic_api_key", from: "reviews@example.invalid",
    maxAttempts: 2, sleep: async () => {}, async fetch() { calls += 1; return error(503, "service_unavailable"); } });
  await assert.rejects(transport.send(input()), resendError("resend_service_unavailable", true));
  assert.equal(calls, 2);
});
