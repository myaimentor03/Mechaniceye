#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULTS, HARD_CAPS, parseArgs, validateConfig } from "./guardrails.mjs";
import { buildScenarioCatalog, buildWeightedScenarioPlan } from "./scenarios.mjs";

const MAX_CAPTURED_RESPONSE_BYTES = 128 * 1024;

function delay(milliseconds) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return sorted[index];
}

function rounded(value) {
  return value === null ? null : Math.round(value * 10) / 10;
}

async function readBoundedBody(response, captureText) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = captureText ? new TextDecoder() : null;
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CAPTURED_RESPONSE_BYTES) {
        await reader.cancel("load-cert response capture limit");
        throw new Error(`response exceeded ${MAX_CAPTURED_RESPONSE_BYTES} captured bytes`);
      }
      if (decoder) text += decoder.decode(value, { stream: true });
    }
    if (decoder) text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function responseIdFrom(text) {
  if (!text) return null;
  try {
    const body = JSON.parse(text);
    const value = body?.id ?? body?.caseId ?? null;
    return typeof value === "string" || typeof value === "number" ? String(value) : null;
  } catch {
    return null;
  }
}

async function executeRequest({ config, safeTarget, scenario, sequence, occurrence, runId, fetchImpl }) {
  const correlationId = `launch-cert-${runId}-${String(sequence).padStart(6, "0")}`;
  const spec = scenario.request({ correlationId, sequence, occurrence });
  const url = new URL(spec.path, `${safeTarget.origin}/`);
  if (url.origin !== safeTarget.origin) throw new Error(`Scenario ${scenario.name} escaped the target origin`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("request timeout")), config.requestTimeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(url, {
      method: spec.method,
      headers: {
        ...spec.headers,
        "x-mechaniceye-load-cert": "synthetic-staging-only",
        "x-load-test-request-id": correlationId,
      },
      body: spec.body,
      redirect: "manual",
      signal: controller.signal,
    });
    let responseText = "";
    let captureError = null;
    let captureErrorType = null;
    try {
      responseText = await readBoundedBody(response, Boolean(spec.expectsUniqueResponseId));
    } catch (error) {
      captureError = error instanceof Error ? error.message : "response capture failed";
      captureErrorType = controller.signal.aborted
        ? "timeout"
        : captureError.startsWith("response exceeded") ? "response-too-large" : "response-read-error";
    }

    const durationMs = performance.now() - startedAt;
    const expectedStatus = spec.expectedStatuses.has(response.status);
    const responseId = spec.expectsUniqueResponseId ? responseIdFrom(responseText) : null;
    const missingResponseId = Boolean(spec.expectsUniqueResponseId && !responseId);
    const ok = expectedStatus && !captureError && !missingResponseId;
    return {
      sequence,
      scenario: scenario.name,
      correlationId,
      attempted: true,
      httpResponse: true,
      status: response.status,
      durationMs,
      ok,
      responseId,
      expectsUniqueResponseId: Boolean(spec.expectsUniqueResponseId),
      errorType: captureError
        ? captureErrorType
        : missingResponseId
          ? "missing-response-id"
          : expectedStatus ? null : "unexpected-status",
      errorMessage: captureError,
      mode: spec.mode,
    };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    const timedOut = controller.signal.aborted;
    return {
      sequence,
      scenario: scenario.name,
      correlationId,
      attempted: true,
      httpResponse: false,
      status: null,
      durationMs,
      ok: false,
      responseId: null,
      expectsUniqueResponseId: Boolean(spec.expectsUniqueResponseId),
      errorType: timedOut ? "timeout" : "network-error",
      errorMessage: error instanceof Error ? error.message : String(error),
      mode: spec.mode,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function skippedResult(scenario, sequence, runId, reason) {
  return {
    sequence,
    scenario: scenario.name,
    correlationId: `launch-cert-${runId}-${String(sequence).padStart(6, "0")}`,
    attempted: false,
    httpResponse: false,
    status: null,
    durationMs: 0,
    ok: false,
    responseId: null,
    expectsUniqueResponseId: false,
    errorType: reason,
    errorMessage: "Request was not launched; pacing guard prevented backlog catch-up.",
    mode: "not launched",
  };
}

export async function runHarness(config, options = {}) {
  const safeTarget = options.safeTarget ?? validateConfig(config);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("This harness requires Node.js with built-in fetch support");

  const weightedPlan = buildWeightedScenarioPlan(config);
  const runId = options.runId ?? randomUUID().slice(0, 8);
  const intervalMs = 1_000 / config.ratePerSecond;
  const startedAt = performance.now();
  const deadline = startedAt + config.durationSeconds * 1_000;
  const results = new Array(safeTarget.plannedRequests);
  const occurrenceByScenario = new Map();
  const scheduledPlan = Array.from({ length: safeTarget.plannedRequests }, (_, sequence) => {
    const scenario = weightedPlan[sequence % weightedPlan.length];
    const occurrence = occurrenceByScenario.get(scenario.name) ?? 0;
    occurrenceByScenario.set(scenario.name, occurrence + 1);
    return { scenario, occurrence };
  });
  let nextSequence = 0;

  async function worker() {
    while (true) {
      const sequence = nextSequence;
      nextSequence += 1;
      if (sequence >= safeTarget.plannedRequests) return;

      const { scenario, occurrence } = scheduledPlan[sequence];
      const scheduledAt = startedAt + sequence * intervalMs;
      await delay(scheduledAt - performance.now());
      const now = performance.now();
      const tooLateToLaunch = now >= deadline || now - scheduledAt > Math.max(500, intervalMs * 2);
      if (tooLateToLaunch) {
        results[sequence] = skippedResult(scenario, sequence, runId, "scheduler-overrun");
        continue;
      }

      results[sequence] = await executeRequest({
        config,
        safeTarget,
        scenario,
        sequence,
        occurrence,
        runId,
        fetchImpl,
      });
    }
  }

  const workerCount = Math.min(config.concurrency, safeTarget.plannedRequests);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const endedAt = performance.now();
  return buildReport({
    config,
    safeTarget,
    results,
    runId,
    elapsedMs: endedAt - startedAt,
  });
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function summarizeResults(results) {
  const latencies = results.filter((result) => result.attempted).map((result) => result.durationMs);
  const statuses = {};
  const errors = {};
  for (const result of results) {
    if (result.status !== null) increment(statuses, String(result.status));
    if (result.errorType) increment(errors, result.errorType);
  }
  return {
    planned: results.length,
    launched: results.filter((result) => result.attempted).length,
    responses: results.filter((result) => result.httpResponse).length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    statuses,
    errors,
    latencyMs: {
      min: latencies.length ? rounded(Math.min(...latencies)) : null,
      p50: rounded(percentile(latencies, 0.50)),
      p95: rounded(percentile(latencies, 0.95)),
      p99: rounded(percentile(latencies, 0.99)),
      max: latencies.length ? rounded(Math.max(...latencies)) : null,
    },
  };
}

function duplicateCount(values) {
  const seen = new Set();
  let duplicates = 0;
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) duplicates += 1;
    else seen.add(value);
  }
  return duplicates;
}

export function buildReport({ config, safeTarget, results, runId, elapsedMs }) {
  const overall = summarizeResults(results);
  const scenarios = {};
  for (const name of config.scenarios) {
    scenarios[name] = summarizeResults(results.filter((result) => result.scenario === name));
  }

  const responseIds = results.map((result) => result.responseId);
  const correlations = results.map((result) => result.correlationId);
  const duplicateResponseIds = duplicateCount(responseIds);
  const duplicateCorrelations = duplicateCount(correlations);
  const missingResponseIds = results.filter(
    (result) => result.expectsUniqueResponseId && result.httpResponse && !result.responseId,
  ).length;
  const lost = overall.planned - overall.responses;
  const duplicates = duplicateResponseIds + duplicateCorrelations;
  const errorRate = overall.planned ? overall.failed / overall.planned : 1;
  const violations = [];

  if (errorRate > config.sloMaxErrorRate) {
    violations.push(`error rate ${(errorRate * 100).toFixed(2)}% exceeds ${(config.sloMaxErrorRate * 100).toFixed(2)}%`);
  }
  if (overall.latencyMs.p95 === null || overall.latencyMs.p95 > config.sloP95Ms) {
    violations.push(`overall p95 ${overall.latencyMs.p95 ?? "unavailable"}ms exceeds ${config.sloP95Ms}ms`);
  }
  for (const [name, summary] of Object.entries(scenarios)) {
    if (summary.planned && (summary.latencyMs.p95 === null || summary.latencyMs.p95 > config.sloP95Ms)) {
      violations.push(`${name} p95 ${summary.latencyMs.p95 ?? "unavailable"}ms exceeds ${config.sloP95Ms}ms`);
    }
  }
  if (lost > config.sloMaxLost) violations.push(`${lost} lost responses exceeds ${config.sloMaxLost}`);
  if (duplicates > config.sloMaxDuplicate) violations.push(`${duplicates} duplicate indicators exceeds ${config.sloMaxDuplicate}`);
  if (missingResponseIds) violations.push(`${missingResponseIds} successful-write responses lacked a case id`);

  return {
    certification: violations.length ? "FAIL" : "PASS",
    runId,
    target: safeTarget.origin,
    targetKind: safeTarget.targetKind,
    mode: config.writeTextIntake ? "synthetic writes enabled" : "non-persistent validation",
    limits: {
      concurrency: config.concurrency,
      ratePerSecond: config.ratePerSecond,
      durationSeconds: config.durationSeconds,
      requestTimeoutMs: config.requestTimeoutMs,
      maxRequests: config.maxRequests,
    },
    elapsedMs: rounded(elapsedMs),
    overall: { ...overall, errorRate: Math.round(errorRate * 10_000) / 10_000 },
    indicators: {
      lost,
      duplicateResponseIds,
      duplicateCorrelations,
      missingResponseIds,
    },
    scenarios,
    slo: {
      p95Ms: config.sloP95Ms,
      maxErrorRate: config.sloMaxErrorRate,
      maxLost: config.sloMaxLost,
      maxDuplicate: config.sloMaxDuplicate,
    },
    violations,
  };
}

function dryRunReport(config, safeTarget) {
  const catalog = buildScenarioCatalog(config);
  return {
    validation: "PASS — no network requests sent",
    target: safeTarget.origin,
    targetKind: safeTarget.targetKind,
    plannedRequests: safeTarget.plannedRequests,
    limits: {
      concurrency: config.concurrency,
      ratePerSecond: config.ratePerSecond,
      durationSeconds: config.durationSeconds,
      requestTimeoutMs: config.requestTimeoutMs,
      hardCaps: HARD_CAPS,
    },
    mode: config.writeTextIntake ? "synthetic writes enabled" : "non-persistent validation",
    scenarios: config.scenarios.map((name) => ({ name, description: catalog.get(name).description })),
  };
}

export function helpText() {
  return `MechanicEye staging-only launch certification harness

Usage:
  node tests/load/load-cert.mjs --target http://localhost:5000 [options]
  node tests/load/load-cert.mjs --target https://stage.example.test \\
    --allow-staging-host stage.example.test [options]

Safety:
  Remote targets require an exact --allow-staging-host and HTTPS. Recognizable
  production hostnames are always refused. Redirects are never followed. The
  hard caps are concurrency=${HARD_CAPS.concurrency}, rate=${HARD_CAPS.ratePerSecond}/s,
  duration=${HARD_CAPS.durationSeconds}s, and requests=${HARD_CAPS.maxRequests}.
  This is a bounded launch check, never a DoS or stress-to-failure tool.

Core options (defaults shown):
  --concurrency ${DEFAULTS.concurrency}
  --rate ${DEFAULTS.ratePerSecond}
  --duration ${DEFAULTS.durationSeconds}
  --timeout-ms ${DEFAULTS.requestTimeoutMs}
  --max-requests ${DEFAULTS.maxRequests}
  --scenarios health,browse,text-intake,auth-abuse,upload-boundary
  --slo-p95-ms ${DEFAULTS.sloP95Ms}
  --slo-max-error-rate ${DEFAULTS.sloMaxErrorRate}
  --slo-max-lost ${DEFAULTS.sloMaxLost}
  --slo-max-duplicate ${DEFAULTS.sloMaxDuplicate}
  --dry-run

Writes:
  Text intake is non-persistent by default. --write-text-intake enables fully
  synthetic case creation. Remote staging also requires
  --confirm-staging-writes. No real PII or user media is generated or accepted.

Path overrides:
  --health-path PATH  --browse-path PATH  --text-path PATH
  --auth-path PATH    --upload-path PATH
`;
}

export async function main(args = process.argv.slice(2)) {
  try {
    const config = parseArgs(args);
    if (config.help) {
      console.log(helpText());
      return 0;
    }
    const safeTarget = validateConfig(config);
    if (config.dryRun) {
      console.log(JSON.stringify(dryRunReport(config, safeTarget), null, 2));
      return 0;
    }

    console.log(
      `Starting bounded certification against ${safeTarget.targetKind} ${safeTarget.origin}; `
      + `${safeTarget.plannedRequests} paced requests, never stress-to-failure.`,
    );
    const report = await runHarness(config, { safeTarget });
    console.log(JSON.stringify(report, null, 2));
    return report.certification === "PASS" ? 0 : 1;
  } catch (error) {
    console.error(`LOAD CERTIFICATION REFUSED: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) process.exitCode = await main();
