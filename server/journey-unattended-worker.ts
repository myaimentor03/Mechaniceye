import { listAllJourneyCases, setJourneyCase } from "./journey-store";
import {
  advanceJourney,
  shouldAutoEvaluate,
  type JourneyCase,
} from "./journey-state-machine";
import { logStateTransition } from "./journey-case-events";
import { logEvent, logEventError } from "./observability/safe-log";
import { notifyStateTransition } from "./journey-notifications";
import { db } from "./db";
import { drivableSeedEvidenceItems } from "../shared/schema";

// ── Unattended case evaluator ─────────────────────────────────────────────
// Background worker that periodically checks for cases stuck in states
// where the customer may have left (evidence_received with sufficient
// confidence) and automatically advances them. This ensures the customer
// sees results when they return without manual intervention.
//
// Design constraints:
// - Only evaluates cases with sufficient confidence (moderate/high)
// - Never evaluates safety-triggered cases automatically
// - Only processes cases with at least one evidence item
// - Logs all actions for audit trail
// - Creates customer notifications for state transitions
// - Graceful error handling: individual case failures don't stop the loop

const DEFAULT_POLL_INTERVAL_MS = 30_000; // 30 seconds
const BATCH_SIZE = 10; // max cases per poll cycle

function getPollIntervalMs(): number {
  const raw = process.env.JOURNEY_UNATTENDED_POLL_MS?.trim();
  if (!raw) return DEFAULT_POLL_INTERVAL_MS;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 5000) return DEFAULT_POLL_INTERVAL_MS;
  return parsed;
}

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let lastPollAt: string | null = null;
let totalProcessed = 0;
let totalErrors = 0;

/**
 * Run one poll cycle: find stuck cases and auto-evaluate them.
 * Returns the number of cases processed.
 */
export async function pollAndEvaluate(): Promise<number> {
  if (running) return 0; // prevent overlap
  running = true;
  lastPollAt = new Date().toISOString();
  let processed = 0;

  try {
    const allCases = listAllJourneyCases();

    // Find cases eligible for auto-evaluation:
    // - In evidence_received state
    // - Not safety-triggered
    // - Have at least one evidence item
    // - Confidence is moderate or high
    const eligible = allCases.filter((c) => shouldAutoEvaluate(c)).slice(0, BATCH_SIZE);

    if (eligible.length === 0) {
      running = false;
      return 0;
    }

    let evidenceItems: any[] = [];
    try {
      evidenceItems = await db.select().from(drivableSeedEvidenceItems);
    } catch {
      // Seed tables may not exist; evaluation still works without them
    }

    for (const caseData of eligible) {
      try {
        const previousState = caseData.state;

        // Auto-evaluate: advance through evaluate -> evaluating -> ready_diagnosis
        const evaluated = advanceJourney(caseData, "evaluate", { evidenceItems });
        setJourneyCase(evaluated);
        await logStateTransition(evaluated, previousState, "evaluate");

        logEvent("journey.unattended_auto_evaluate", {
          caseId: evaluated.id,
          customerId: evaluated.customerId,
          confidenceScore: evaluated.confidenceScore,
          confidenceLevel: evaluated.confidenceLevel,
          evidenceCount: evaluated.evidence.length,
        });

        // Notify the customer that results are ready
        if (evaluated.customerId) {
          await notifyStateTransition({
            caseId: evaluated.id,
            customerId: evaluated.customerId,
            fromState: previousState,
            toState: evaluated.state,
            transition: "evaluate",
            safetyTriggered: evaluated.safetyTriggered,
            outcome: evaluated.outcome,
          });
        }

        processed++;
      } catch (err) {
        totalErrors++;
        logEventError("journey.unattended_eval_failed", err, {
          caseId: caseData.id,
        });
      }
    }
  } catch (err) {
    totalErrors++;
    logEventError("journey.unattended_poll_failed", err, {});
  } finally {
    running = false;
    totalProcessed += processed;
  }

  return processed;
}

/**
 * Start the background poller loop.
 * Safe to call multiple times — only one loop runs.
 */
export function startUnattendedWorker(): void {
  if (timer) return;

  const intervalMs = getPollIntervalMs();
  logEvent("journey.unattended_worker_started", { intervalMs });

  // Run first cycle after a short delay to let the server finish starting
  setTimeout(() => {
    pollAndEvaluate().catch((err) => {
      logEventError("journey.unattended_initial_poll_failed", err, {});
    });
  }, 5_000);

  timer = setInterval(() => {
    pollAndEvaluate().catch((err) => {
      logEventError("journey.unattended_poll_failed", err, {});
    });
  }, intervalMs);
}

/**
 * Stop the background poller loop.
 */
export function stopUnattendedWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logEvent("journey.unattended_worker_stopped", {});
  }
}

/**
 * Get worker status for health checks and diagnostics.
 */
export function getUnattendedWorkerStatus(): {
  running: boolean;
  lastPollAt: string | null;
  totalProcessed: number;
  totalErrors: number;
  pollIntervalMs: number;
} {
  return {
    running,
    lastPollAt,
    totalProcessed,
    totalErrors,
    pollIntervalMs: getPollIntervalMs(),
  };
}
