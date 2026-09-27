import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { DRIVABLE_ALLOWED_ORIGINS, enforceOriginForStateChanging } from "./origin-guard";
import { logEvent, logEventError } from "./observability/safe-log";
import { startUnattendedWorker } from "./journey-unattended-worker";
import { journeyStoreReady } from "./journey-store";
import path from "path";
import fs from "fs";

const app = express();
app.set("trust proxy", 1);

const allowedCorsOrigins = new Set([
  ...DRIVABLE_ALLOWED_ORIGINS,
  ...(process.env.DRIVABLE_PUBLIC_ORIGIN?.trim()
    ? [process.env.DRIVABLE_PUBLIC_ORIGIN.trim().replace(/\/+$/, "")]
    : []),
]);

app.use(enforceOriginForStateChanging);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Response content varies by Origin (both allowed and denied), so intermediates
  // must never serve one origin's CORS state to another.
  if (origin) {
    res.setHeader("Vary", "Origin");
  }

  if (origin && allowedCorsOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

(async () => {
  // Journey cases are durable-first. In production an unhydratable case store
  // must stop the boot rather than let the process serve 200s for cases a
  // redeploy would discard. Outside production this is a warning only.
  try {
    const journey = await journeyStoreReady();
    logEvent("server.journey_store_ready", { durable: journey.durable });
  } catch (error) {
    logEventError("server.journey_store_not_durable", error, {});
    console.error("Refusing to start: journey case storage is not durably available.");
    process.exit(1);
    return;
  }

  const server = await registerRoutes(app);

  // Error handler with secret redaction
  // Unknown or invalid API routes must answer JSON 404, never Express's
  // default HTML, never the SPA shell, and never a stack trace. This also
  // covers unsupported HTTP methods on otherwise-valid routes.
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  // Error handler with secret redaction
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logEventError("http.request.error", err, { path: _req.path, method: _req.method });
    const status = err.status || err.statusCode || 500;
    const hasSafeStatus = typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599;
    if (!hasSafeStatus) {
      res.status(500).json({ message: "Internal Server Error" });
      return;
    }
    res.status(status).json({ message: "Request could not be completed." });
  });

  // Serve the frontend from dist (production)
  const distPath = path.join(process.cwd(), "dist/client");

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));

    app.use((req, res, next) => {
      const acceptsHtml = req.accepts("html");
      const isFrontendNavigation =
        (req.method === "GET" || req.method === "HEAD") &&
        acceptsHtml &&
        !req.path.startsWith("/api") &&
        !path.extname(req.path);

      if (!isFrontendNavigation) {
        next();
        return;
      }

      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = parseInt(process.env.PORT || "5000", 10);

  server.listen(port, () => {
    console.log(`Server running on port ${port}`);

    // Start unattended case evaluator — auto-evaluates cases stuck in
    // evidence_received when the customer doesn't return (P0 #6).
    try {
      startUnattendedWorker();
    } catch (err) {
      logEventError("journey.unattended_worker_startup_failed", err, {});
    }
  });
})();

