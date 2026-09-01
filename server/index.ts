import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import path from "path";
import fs from "fs";

const app = express();

const defaultAllowedOrigins = [
  "https://mechaniceye.onrender.com",
  "https://getdrivable.com",
  "https://drivable.onrender.com",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5000",
  "http://localhost:5000"
];

const envAllowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowedCorsOrigins = new Set([...defaultAllowedOrigins, ...envAllowedOrigins]);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (allowedCorsOrigins.has(origin)) return true;
  if (process.env.NODE_ENV !== "production") return true;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith(".onrender.com") || url.hostname.endsWith(".getdrivable.com")) {
      return true;
    }
  } catch {
    // Malformed origin URL
  }
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

(async () => {
  const server = await registerRoutes(app);

  // Error handler with secret redaction
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    if (process.env.DATABASE_URL) {
      message = message.replaceAll(process.env.DATABASE_URL, "[redacted]");
    }
    message = message.replace(
      /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@[^\s)'"<>]+/gi,
      "postgresql://[redacted]"
    );

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

