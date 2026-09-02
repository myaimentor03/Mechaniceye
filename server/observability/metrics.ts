import { buildObservabilityEvent, type StructuredObservabilityEvent } from "./events.js";
import { isLaunchMetricName, OBSERVABILITY_EVENT_NAMES, type LaunchMetricName } from "./names.js";
import type { ObservabilityRequestContext } from "./request-context.js";

export type LaunchMetricKind = "counter" | "gauge" | "histogram";

const LAUNCH_METRIC_KINDS: ReadonlySet<string> = new Set(["counter", "gauge", "histogram"]);

export interface RecordLaunchMetricInput {
  name: LaunchMetricName;
  kind: LaunchMetricKind;
  value: number;
  context?: ObservabilityRequestContext;
  tags?: unknown;
  timestamp?: Date;
}

export function recordLaunchMetric(input: RecordLaunchMetricInput): StructuredObservabilityEvent {
  if (!isLaunchMetricName(input.name)) {
    throw new TypeError("Unknown launch metric name");
  }
  if (!LAUNCH_METRIC_KINDS.has(input.kind)) {
    throw new TypeError("Unknown launch metric kind");
  }
  if (!Number.isFinite(input.value)) {
    throw new TypeError("Launch metric value must be finite");
  }

  return buildObservabilityEvent({
    event: OBSERVABILITY_EVENT_NAMES.METRIC_RECORDED,
    context: input.context,
    timestamp: input.timestamp,
    attributes: {
      metric: input.name,
      kind: input.kind,
      value: input.value,
      tags: input.tags ?? {},
    },
  });
}
