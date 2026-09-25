import express from "express";
import { registerRoutes } from "./routes";
import { registerProductionFallbacks } from "./production-fallbacks";
import { DRIVABLE_ALLOWED_ORIGINS, enforceOriginForStateChanging } from "./origin-guard";
import { logEventError } from "./observability/safe-log";
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
  let server;
  try {
    server = await registerRoutes(app);
  } catch (err) {
    logEventError("server.startup.failed", err as Error);
    process.exit(1);
  }

  // Outer belt-and-braces fallbacks (fail-closed { ok:false, code } JSON with
  // Cache-Control: no-store -- see server/production-fallbacks.ts). The inner
  // transport envelope in registerRoutes answers first; this outer layer only
  // covers fallthrough to later middleware (static assets, future routes).
  registerProductionFallbacks(app);

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
  });
})();

