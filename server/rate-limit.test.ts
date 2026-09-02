import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimit, FixedWindowRateLimiter } from "./rate-limit.js";

test("fixed-window limiter blocks excess requests and resets", () => {
  const limiter = new FixedWindowRateLimiter(1_000, 2);
  assert.equal(limiter.consume("client", 100).allowed, true);
  assert.equal(limiter.consume("client", 200).allowed, true);
  assert.equal(limiter.consume("client", 300).allowed, false);
  assert.equal(limiter.consume("client", 1_101).allowed, true);
});

test("bounded limiter fails closed for new keys when capacity is exhausted", () => {
  const limiter = new FixedWindowRateLimiter(10_000, 5, 1);
  assert.equal(limiter.consume("first", 100).allowed, true);
  assert.equal(limiter.consume("second", 200).allowed, false);
  limiter.prune(20_000);
  assert.equal(limiter.consume("second", 20_001).allowed, true);
});

test("HTTP middleware returns a retryable 429 without echoing the client key", () => {
  const middleware = createRateLimit({ scope: "login", windowMs: 60_000, max: 1, key: () => "person@example.com" });
  const headers = new Map<string, string>();
  let status = 200;
  let body: any;
  const req = { ip: "127.0.0.1", socket: {} } as any;
  const res = {
    setHeader(name: string, value: string) { headers.set(name, value); },
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
  } as any;
  let nextCount = 0;
  middleware(req, res, () => { nextCount += 1; });
  middleware(req, res, () => { nextCount += 1; });
  assert.equal(nextCount, 1);
  assert.equal(status, 429);
  assert.equal(headers.has("Retry-After"), true);
  assert.equal(JSON.stringify(body).includes("person@example.com"), false);
});
