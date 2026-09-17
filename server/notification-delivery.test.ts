import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const routes = source("./routes.ts");

test("deliverPublicCaseNotification function exists and builds packet before webhook", () => {
  const start = routes.indexOf("async function deliverPublicCaseNotification(");
  assert.ok(start >= 0, "deliverPublicCaseNotification must exist");
  const block = routes.slice(start, start + 800);
  assert.match(block, /buildPublicCasePacket/);
  assert.match(block, /logEvent\("public_case\.packet_queued"/);
  assert.match(block, /PUBLIC_CASE_WEBHOOK_URL/);
});

test("deliverPublicCaseNotification returns early when webhook URL is not configured", () => {
  const start = routes.indexOf("async function deliverPublicCaseNotification(");
  const block = routes.slice(start, start + 800);
  assert.match(block, /if \(!webhookUrl\) \{/);
  assert.match(block, /return;/);
});

test("deliverPublicCaseNotification calls fetchWebhookWithTimeout when URL is configured", () => {
  const start = routes.indexOf("async function deliverPublicCaseNotification(");
  const block = routes.slice(start, start + 800);
  assert.match(block, /await fetchWebhookWithTimeout\(webhookUrl,/);
  assert.match(block, /method: "POST"/);
  assert.match(block, /"Content-Type":\s*"application\/json"/);
});

test("deliverPublicCaseNotification catches and logs webhook errors without throwing", () => {
  const start = routes.indexOf("async function deliverPublicCaseNotification(");
  const block = routes.slice(start, start + 800);
  assert.match(block, /try \{/);
  assert.match(block, /catch \(webhookError\) \{/);
  assert.match(block, /logEventError\("webhook\.public_case_delivery_failed"/);
  assert.doesNotMatch(block, /throw/);
});

test("deliverDiagnosisWebhook function exists and builds payload before webhook", () => {
  const start = routes.indexOf("async function deliverDiagnosisWebhook(");
  assert.ok(start >= 0, "deliverDiagnosisWebhook must exist");
  const block = routes.slice(start, start + 2000);
  assert.match(block, /MECHANIC_EYE_INTAKE_WEBHOOK_URL/);
  assert.match(block, /type: "mechanics_eye_new_case"/);
  assert.match(block, /caseId: diagnosisCase\.id/);
  assert.match(block, /buildDrivableAiPayloadFields/);
});

test("deliverDiagnosisWebhook returns early when webhook URL is not configured", () => {
  const start = routes.indexOf("async function deliverDiagnosisWebhook(");
  const block = routes.slice(start, start + 2000);
  assert.match(block, /if \(!webhookUrl\) \{/);
  assert.match(block, /return;/);
});

test("deliverDiagnosisWebhook calls fetchWebhookWithTimeout when URL is configured", () => {
  const start = routes.indexOf("async function deliverDiagnosisWebhook(");
  const block = routes.slice(start, start + 2000);
  assert.match(block, /await fetchWebhookWithTimeout\(webhookUrl,/);
  assert.match(block, /method: "POST"/);
});

test("deliverDiagnosisWebhook catches and logs webhook errors without throwing", () => {
  const start = routes.indexOf("async function deliverDiagnosisWebhook(");
  const block = routes.slice(start, start + 2000);
  assert.match(block, /try \{/);
  assert.match(block, /catch \(webhookError\) \{/);
  assert.match(block, /logEventError\("webhook\.diagnosis_delivery_failed"/);
  assert.doesNotMatch(block, /throw/);
});

test("forwardMasterDiagnosisIntakeWebhook returns webhookConfigured false when URL missing", () => {
  const start = routes.indexOf("async function forwardMasterDiagnosisIntakeWebhook(");
  assert.ok(start >= 0, "forwardMasterDiagnosisIntakeWebhook must exist");
  const block = routes.slice(start, start + 1500);
  assert.match(block, /MASTER_INTAKE_WEBHOOK_URL/);
  assert.match(block, /if \(!webhookUrl\) \{/);
  assert.match(block, /return \{ webhookConfigured: false, webhookForwarded: false \};/);
});

test("forwardMasterDiagnosisIntakeWebhook handles non-2xx response as forwarded=false", () => {
  const start = routes.indexOf("async function forwardMasterDiagnosisIntakeWebhook(");
  const block = routes.slice(start, start + 1500);
  assert.match(block, /if \(!response\.ok\) \{/);
  assert.match(block, /webhookConfigured: true, webhookForwarded: false/);
  assert.match(block, /logEventError\("webhook\.master_intake_forward_rejected"/);
});

test("forwardMasterDiagnosisIntakeWebhook returns forwarded=true on success", () => {
  const start = routes.indexOf("async function forwardMasterDiagnosisIntakeWebhook(");
  const block = routes.slice(start, start + 1500);
  assert.match(block, /return \{ webhookConfigured: true, webhookForwarded: true \};/);
});

test("forwardMasterDiagnosisIntakeWebhook catches errors and returns forwarded=false", () => {
  const start = routes.indexOf("async function forwardMasterDiagnosisIntakeWebhook(");
  const block = routes.slice(start, start + 1500);
  assert.match(block, /catch \(error\) \{/);
  assert.match(block, /logEventError\("webhook\.master_intake_forward_failed"/);
  assert.match(block, /return \{ webhookConfigured: true, webhookForwarded: false \};/);
});