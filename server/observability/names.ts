export const OBSERVABILITY_EVENT_NAMES = {
  APP_STARTED: "launch.app.started",
  APP_READY: "launch.app.ready",
  HTTP_REQUEST_COMPLETED: "launch.http.request.completed",
  HTTP_REQUEST_REJECTED: "launch.http.request.rejected",
  ANALYSIS_STARTED: "launch.analysis.started",
  ANALYSIS_COMPLETED: "launch.analysis.completed",
  ANALYSIS_FAILED: "launch.analysis.failed",
  REPORT_CREATED: "launch.report.created",
  CAPACITY_REJECTED: "launch.capacity.rejected",
  UPLOAD_COMPLETED: "launch.upload.completed",
  UPLOAD_REJECTED: "launch.upload.rejected",
  DATABASE_DEPENDENCY_FAILED: "launch.database.dependency_failed",
  QUEUE_JOB_FAILED: "launch.queue.job_failed",
  WEBHOOK_DELIVERY_FAILED: "launch.webhook.delivery_failed",
  REVIEW_BACKLOG_LIMIT_REACHED: "launch.review.backlog_limit_reached",
  AUTH_ABUSE_REJECTED: "launch.auth.abuse_rejected",
  PAYMENT_FAILED: "launch.payment.failed",
  PRIVACY_REQUEST_RECEIVED: "launch.privacy.request_received",
  SECURITY_EVENT_RECORDED: "launch.security.event_recorded",
  METRIC_RECORDED: "launch.metric.recorded",
} as const;

export type ObservabilityEventName =
  (typeof OBSERVABILITY_EVENT_NAMES)[keyof typeof OBSERVABILITY_EVENT_NAMES];

const EVENT_NAME_SET: ReadonlySet<string> = new Set(Object.values(OBSERVABILITY_EVENT_NAMES));

export function isObservabilityEventName(value: unknown): value is ObservabilityEventName {
  return typeof value === "string" && EVENT_NAME_SET.has(value);
}

export const LAUNCH_METRIC_NAMES = {
  HTTP_REQUESTS_TOTAL: "launch_http_requests_total",
  HTTP_ERRORS_TOTAL: "launch_http_errors_total",
  HTTP_REQUEST_DURATION_MS: "launch_http_request_duration_ms",
  ACTIVE_REQUESTS: "launch_active_requests",
  ANALYSES_STARTED_TOTAL: "launch_analyses_started_total",
  ANALYSES_COMPLETED_TOTAL: "launch_analyses_completed_total",
  ANALYSES_FAILED_TOTAL: "launch_analyses_failed_total",
  ANALYSIS_DURATION_MS: "launch_analysis_duration_ms",
  REPORTS_CREATED_TOTAL: "launch_reports_created_total",
  CAPACITY_REJECTIONS_TOTAL: "launch_capacity_rejections_total",
  UPLOADS_TOTAL: "launch_uploads_total",
  UPLOAD_FAILURES_TOTAL: "launch_upload_failures_total",
  UPLOAD_BYTES_TOTAL: "launch_upload_bytes_total",
  DATABASE_POOL_ACTIVE: "launch_database_pool_active",
  DATABASE_POOL_WAITING: "launch_database_pool_waiting",
  QUEUE_DEPTH: "launch_queue_depth",
  QUEUE_OLDEST_AGE_MS: "launch_queue_oldest_age_ms",
  WEBHOOK_FAILURES_TOTAL: "launch_webhook_failures_total",
  WEBHOOK_RETRIES_TOTAL: "launch_webhook_retries_total",
  REVIEW_BACKLOG_DEPTH: "launch_review_backlog_depth",
  REVIEW_OLDEST_AGE_MS: "launch_review_oldest_age_ms",
  AUTH_REJECTIONS_TOTAL: "launch_auth_rejections_total",
  AUTH_RATE_LIMITS_TOTAL: "launch_auth_rate_limits_total",
  PAYMENT_FAILURES_TOTAL: "launch_payment_failures_total",
  PRIVACY_EVENTS_TOTAL: "launch_privacy_events_total",
  SECURITY_EVENTS_TOTAL: "launch_security_events_total",
} as const;

export type LaunchMetricName =
  (typeof LAUNCH_METRIC_NAMES)[keyof typeof LAUNCH_METRIC_NAMES];

const METRIC_NAME_SET: ReadonlySet<string> = new Set(Object.values(LAUNCH_METRIC_NAMES));

export function isLaunchMetricName(value: unknown): value is LaunchMetricName {
  return typeof value === "string" && METRIC_NAME_SET.has(value);
}
