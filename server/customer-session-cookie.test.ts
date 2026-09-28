import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createSessionToken } from "./customer-auth.js";

process.env.DRIVABLE_SESSION_SECRET = "session-cookie-test-secret-with-more-than-32-characters";

const MALFORMED_COOKIES = [
  "drivable_session=%zz",
  "drivable_session=%",
  "drivable_session=%E0%A4%A",
  "drivable_session=%GG%GG",
];

async function withServer(work: (origin: string) => Promise<void>) {
  const { registerRoutes } = await import("./routes.js");
  const app = express();
  app.use(express.json());
  app.use(((err: any, _req: any, res: any, _next: any) => {
    const status = err?.status || err?.statusCode || 500;
    const safe = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    res.status(safe).json({ message: "Request could not be completed." });
  }) as any);
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("a malformed session cookie is treated as no session, never a server error", async () => {
  await withServer(async (origin) => {
    for (const cookie of MALFORMED_COOKIES) {
      const response = await fetch(`${origin}/api/auth/me`, {
        headers: { cookie, "content-type": "application/json" },
      });
      assert.equal(response.status, 200, `${cookie} produced ${response.status}`);
      const body = await response.json();
      assert.deepEqual(body, { ok: true, user: null });
    }
  });
});

test("a malformed session cookie fails the customer gate closed with 401", async () => {
  await withServer(async (origin) => {
    for (const cookie of MALFORMED_COOKIES) {
      for (const path of ["/api/consent/revoke", "/api/diagnoses"]) {
        const response = await fetch(`${origin}${path}`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ caseId: "CASE-1" }),
        });
        assert.equal(response.status, 401, `${cookie} on ${path} produced ${response.status}`);
        const body = await response.json();
        assert.equal(body.code, "CUSTOMER_AUTH_REQUIRED");
      }
    }
  });
});

test("a malformed session cookie cannot reach a rate limiter or the route body", async () => {
  await withServer(async (origin) => {
    // 401 before the limiter means repeated malformed cookies stay cheap and
    // never consume an authenticated customer's intake budget.
    for (let i = 0; i < 30; i += 1) {
      const response = await fetch(`${origin}/api/consent/revoke`, {
        method: "POST",
        headers: { cookie: "drivable_session=%zz", "content-type": "application/json" },
        body: JSON.stringify({ caseId: "CASE-1" }),
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("x-ratelimit-remaining"), null);
    }
  });
});

test("an authenticated customer cannot flood the consent revocation ledger", async () => {
  await withServer(async (origin) => {
    const token = createSessionToken({ id: "user-1", email: "person@example.com" });
    const cookie = `drivable_session=${encodeURIComponent(token)}`;

    let limited = false;
    for (let i = 0; i < 65; i += 1) {
      const response = await fetch(`${origin}/api/consent/revoke`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ caseId: "CASE-1" }),
      });
      if (response.status === 429) {
        limited = true;
        const body = await response.json();
        assert.equal(body.code, "RATE_LIMITED");
        break;
      }
    }
    assert.equal(limited, true, "consent revocation was never rate limited");
  });
});
