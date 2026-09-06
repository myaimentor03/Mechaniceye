/**
 * Bounded outbound webhook delivery. Every webhook POST must complete within a
 * hard timeout so a stalled or misconfigured endpoint can never hold a request
 * or socket open indefinitely. Combines any caller-provided signal with the
 * timeout signal.
 */
export function fetchWebhookWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 5000,
): Promise<Response> {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (init.signal) signals.push(init.signal);
  return fetch(url, { ...init, signal: AbortSignal.any(signals) });
}