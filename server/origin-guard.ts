import type { RequestHandler } from "express";

export const DRIVABLE_ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "https://mechaniceye.onrender.com",
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);

export function originPermitted(
  origin: string | undefined,
  allowed: ReadonlySet<string> = DRIVABLE_ALLOWED_ORIGINS,
): boolean {
  return typeof origin === "string" && allowed.has(origin);
}

/**
 * Rejects state-changing requests that carry an Origin header which is not on the
 * allowlist. Requests without an Origin (curl, server-to-server traffic, native
 * clients) pass through so the beta API remains automation friendly.
 */
export const requireAllowedOrigin: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !originPermitted(origin)) {
    res.status(403).json({ ok: false, error: "Request origin is not allowed.", code: "ORIGIN_NOT_ALLOWED" });
    return;
  }
  next();
};

/**
 * Global variant: safe read-only methods (GET/HEAD/OPTIONS) pass through even
 * with a disallowed Origin, while browser-initiated state changes are rejected.
 * Mount before CORS headers are written so a rejected request never receives
 * an allow-listed Access-Control-Allow-Origin.
 */
export const enforceOriginForStateChanging: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !originPermitted(origin) && req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    res.status(403).json({ ok: false, error: "Request origin is not allowed.", code: "ORIGIN_NOT_ALLOWED" });
    return;
  }
  next();
};