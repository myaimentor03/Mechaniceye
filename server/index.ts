import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { DRIVABLE_ALLOWED_ORIGINS, enforceOriginForStateChanging } from "./origin-guard";
import { logEventError } from "./observability/safe-log";
import path from "path";
import fs from "fs";

const app = express();
app.set("trust proxy", 1);

app.use(enforceOriginForStateChanging);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && DRIVABLE_ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
  const server = await registerRoutes(app);

  // Error handler
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

  // 🔥 SERVE FRONTEND FROM DIST (PRODUCTION)
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

