import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";

type RateLimitOptions = {
  scope: string;
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
  maxEntries?: number;
};

type Counter = { count: number; resetAt: number };

export class FixedWindowRateLimiter {
  private counters = new Map<string, Counter>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly maxEntries = 20_000,
  ) {
    if (windowMs <= 0 || max <= 0 || maxEntries <= 0) throw new Error("Invalid rate-limit configuration");
  }

  consume(key: string, now = Date.now()) {
    if (this.counters.size >= this.maxEntries) this.prune(now);
    if (this.counters.size >= this.maxEntries && !this.counters.has(key)) {
      return { allowed: false, remaining: 0, resetAt: now + this.windowMs };
    }
    const current = this.counters.get(key);
    const counter = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + this.windowMs }
      : current;
    counter.count += 1;
    this.counters.set(key, counter);
    return {
      allowed: counter.count <= this.max,
      remaining: Math.max(0, this.max - counter.count),
      resetAt: counter.resetAt,
    };
  }

  prune(now = Date.now()) {
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
    }
  }
}

function opaque(value: string) {
  return createHash("sha256").update(value).digest("base64url").slice(0, 24);
}

export function requestIp(req: Request) {
  return String(req.ip || req.socket.remoteAddress || "unknown");
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  const limiter = new FixedWindowRateLimiter(options.windowMs, options.max, options.maxEntries);
  return (req, res, next) => {
    const rawKey = options.key?.(req) || requestIp(req);
    const result = limiter.consume(`${options.scope}:${opaque(rawKey)}`);
    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
      res.status(429).json({ ok: false, error: "Too many requests. Please wait and try again.", code: "RATE_LIMITED" });
      return;
    }
    next();
  };
}
