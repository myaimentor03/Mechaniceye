import type { Express, NextFunction, Request, Response } from "express";
import { logEventError } from "./observability/safe-log";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #9 reliability /
 * mobile recovery, P0 #5 customer identity).
 *
 * Production boot (server/index.ts) registers these outer fallbacks AFTER
 * registerRoutes(app). The inner transport envelope in routes.ts answers
 * first for known traffic, but any request that falls through to this outer
 * layer (errors thrown in later middleware, future routes mounted after
 * registerRoutes, static-asset fallthrough) must still answer the same
 * fail-closed contract: parseable `{ ok: false, code }` JSON with
 * `Cache-Control: no-store`, never Express's default HTML and never a
 * stack trace. Before this lock the outer layer answered
 * `{ message: "Not found" }` / `{ message: "Internal Server Error" }` with
 * no Cache-Control, so a cacheable, envelope-breaking response could reach
 * mobile clients that call response.json() and intermediaries that must
 * never store API responses.
 */
export function registerProductionFallbacks(app: Express): void {
  // Unknown / invalid API routes must answer JSON 404, never Express's
  // default HTML, never the SPA shell, and never a stack trace. This also
  // covers unsupported HTTP methods on otherwise-valid routes.
  app.use("/api", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(404).json({ ok: false, error: "API route not found.", code: "API_NOT_FOUND" });
  });

  // Error handler with secret redaction. Status codes are unchanged from the
  // previous outer behavior (safe 4xx-5xx pass through, anything else is a
  // 500); only the envelope becomes the parseable fail-closed shape with
  // no-store and zero error-object echo.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logEventError("http.request.error", err, { path: _req.path, method: _req.method });
    const status = err.status || err.statusCode || 500;
    const hasSafeStatus = typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599;
    res.setHeader("Cache-Control", "no-store");
    if (!hasSafeStatus) {
      res.status(500).json({ ok: false, error: "Request could not be completed.", code: "REQUEST_FAILED" });
      return;
    }
    res.status(status).json({ ok: false, error: "Request could not be completed.", code: "REQUEST_FAILED" });
  });
}
