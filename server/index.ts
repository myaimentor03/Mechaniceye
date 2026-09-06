import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import path from "path";
import fs from "fs";

const app = express();
app.set("trust proxy", 1);

const allowedCorsOrigins = new Set([
  "https://mechaniceye.onrender.com",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  ...(process.env.DRIVABLE_PUBLIC_ORIGIN?.trim()
    ? [process.env.DRIVABLE_PUBLIC_ORIGIN.trim().replace(/\/+$/, "")]
    : []),
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Response content varies by Origin (both allowed and denied), so intermediates
  // must never serve one origin's CORS state to another.
  if (origin) {
    res.setHeader("Vary", "Origin");
  }

  if (origin && allowedCorsOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
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
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
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

