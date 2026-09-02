#!/usr/bin/env node

/**
 * Production Smoke Test — Drivable Beta
 *
 * NON-DESTRUCTIVE by default.  Only GET requests are executed unless
 * TEST_WRITE=true is explicitly set in the environment.
 *
 * Usage:
 *   BASE_URL=https://getdrivable.com node scripts/production-smoke.mjs
 *   BASE_URL=http://localhost:5000 node scripts/production-smoke.mjs   # local
 *
 * Environment variables:
 *   BASE_URL                  Target origin (default http://localhost:5000)
 *   DRIVABLE_REVIEWER_TOKEN   Bearer token for auth-gated health endpoints
 *   TEST_WRITE                Set to "true" to enable POST / intake tests
 *   TIMEOUT_MS                Per-request timeout in ms (default 10000)
 */

const BASE = (process.env.BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const REVIEWER_TOKEN = process.env.DRIVABLE_REVIEWER_TOKEN || "";
const TEST_WRITE = process.env.TEST_WRITE === "true";
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || "10000", 10);

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

// ─── helpers ────────────────────────────────────────────────────────

function label(name) {
  return `  ${passed + failed + skipped + 1}. ${name}`;
}

function ok(name, detail) {
  passed++;
  const line = label(name) + " ✓";
  console.log(detail ? `${line}  (${detail})` : line);
  results.push({ name, pass: true, detail });
}

function fail(name, detail) {
  failed++;
  const line = label(name) + " ✗ FAIL";
  console.error(detail ? `${line}  (${detail})` : line);
  results.push({ name, pass: false, detail });
}

function skipCheck(name, reason) {
  skipped++;
  const line = label(name) + " ⊘ SKIP";
  console.log(`${line}  (${reason})`);
  results.push({ name, pass: null, detail: reason });
}

async function fetchSafe(path, opts = {}) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function jsonHeaders() {
  return { "Accept": "application/json" };
}

function authHeaders() {
  return REVIEWER_TOKEN
    ? { "Authorization": `Bearer ${REVIEWER_TOKEN}`, ...jsonHeaders() }
    : jsonHeaders();
}

// ─── checks ─────────────────────────────────────────────────────────

async function checkHomepageReturnsHtml() {
  try {
    const res = await fetchSafe("/");
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.includes("text/html")) {
      ok("Homepage returns HTML", `${res.status} ${ct}`);
    } else {
      fail("Homepage returns HTML", `${res.status} content-type=${ct}`);
    }
  } catch (e) {
    fail("Homepage returns HTML", e.message);
  }
}

async function checkSpaNavigationFallback() {
  const spaRoutes = ["/start", "/help", "/buyer-check"];
  for (const route of spaRoutes) {
    try {
      const res = await fetchSafe(route, {
        headers: { "Accept": "text/html" },
      });
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("text/html")) {
        ok(`SPA fallback ${route}`, `${res.status} text/html`);
      } else {
        fail(`SPA fallback ${route}`, `${res.status} content-type=${ct}`);
      }
    } catch (e) {
      fail(`SPA fallback ${route}`, e.message);
    }
  }
}

async function checkHealthLive() {
  try {
    const res = await fetchSafe("/api/health/live");
    const body = await res.json();
    if (res.ok && body.ok === true) {
      ok("/api/health/live", `ok=${body.ok}`);
    } else {
      fail("/api/health/live", `status=${res.status} body=${JSON.stringify(body)}`);
    }
  } catch (e) {
    fail("/api/health/live", e.message);
  }
}

async function checkHealthReadiness() {
  if (!REVIEWER_TOKEN) {
    skipCheck("/api/health/readiness", "DRIVABLE_REVIEWER_TOKEN not set");
    return;
  }
  try {
    const res = await fetchSafe("/api/health/readiness", {
      headers: authHeaders(),
    });
    const body = await res.json();
    const status = res.status;
    if (status === 200 || status === 503) {
      ok(`/api/health/readiness`, `status=${status} ready=${body.ready ?? "unknown"}`);
    } else {
      fail(`/api/health/readiness`, `status=${status}`);
    }
  } catch (e) {
    fail("/api/health/readiness", e.message);
  }
}

async function checkHealthDb() {
  if (!REVIEWER_TOKEN) {
    skipCheck("/api/health/db", "DRIVABLE_REVIEWER_TOKEN not set");
    return;
  }
  try {
    const res = await fetchSafe("/api/health/db", {
      headers: authHeaders(),
    });
    const body = await res.json();
    const status = res.status;
    if (status === 200 || status === 503) {
      ok(`/api/health/db`, `status=${status} ok=${body.ok ?? "unknown"}`);
    } else {
      fail(`/api/health/db`, `status=${status}`);
    }
  } catch (e) {
    fail("/api/health/db", e.message);
  }
}

async function checkCapabilities() {
  try {
    const res = await fetchSafe("/api/capabilities");
    const body = await res.json();
    if (res.ok && typeof body.photoUpload === "boolean") {
      ok("/api/capabilities", `photoUpload=${body.photoUpload}`);
    } else {
      fail("/api/capabilities", `status=${res.status} body=${JSON.stringify(body)}`);
    }
  } catch (e) {
    fail("/api/capabilities", e.message);
  }
}

async function checkUnknownApiRoute() {
  try {
    const res = await fetchSafe("/api/this-route-does-not-exist-xyz");
    const status = res.status;
    if (status === 404) {
      ok("Unknown API route returns 404", `status=${status}`);
    } else if (status >= 400) {
      ok("Unknown API route returns error", `status=${status}`);
    } else {
      fail("Unknown API route returns error", `unexpected status=${status}`);
    }
  } catch (e) {
    fail("Unknown API route", e.message);
  }
}

async function checkCorsHeaders() {
  try {
    const res = await fetchSafe("/api/health/live", {
      headers: { "Origin": "https://evil.example.com" },
    });
    const acao = res.headers.get("access-control-allow-origin");
    if (!acao || acao === "") {
      ok("CORS: unknown origin rejected", "no ACAO header");
    } else {
      fail("CORS: unknown origin rejected", `ACAO=${acao}`);
    }
  } catch (e) {
    fail("CORS check", e.message);
  }
}

async function checkCorsAllowedOrigin() {
  try {
    const res = await fetchSafe("/api/health/live", {
      headers: { "Origin": "http://127.0.0.1:5173" },
    });
    const acao = res.headers.get("access-control-allow-origin");
    if (acao === "http://127.0.0.1:5173") {
      ok("CORS: allowed origin reflected", `ACAO=${acao}`);
    } else {
      fail("CORS: allowed origin reflected", `ACAO=${acao ?? "missing"}`);
    }
  } catch (e) {
    fail("CORS allowed-origin check", e.message);
  }
}

async function checkSecurityHeaders() {
  try {
    const res = await fetchSafe("/");
    const xfo = res.headers.get("x-frame-options");
    const hsts = res.headers.get("strict-transport-security");
    // We don't hard-fail here — security headers may be added at reverse-proxy level (Render)
    if (xfo || hsts) {
      ok("Security headers present", [
        xfo && `X-Frame-Options=${xfo}`,
        hsts && `HSTS`,
      ].filter(Boolean).join(", "));
    } else {
      // advisory — note but don't fail
      skipCheck("Security headers", "None found at app level (may be set by Render/nginx)");
    }
  } catch (e) {
    fail("Security headers check", e.message);
  }
}

async function checkSubscriptionTiers() {
  try {
    const res = await fetchSafe("/api/subscription/tiers");
    const body = await res.json();
    if (res.ok && Array.isArray(body) && body.length > 0) {
      ok("/api/subscription/tiers", `${body.length} tier(s)`);
    } else if (res.ok && body && typeof body === "object") {
      ok("/api/subscription/tiers", "responded");
    } else {
      fail("/api/subscription/tiers", `status=${res.status}`);
    }
  } catch (e) {
    fail("/api/subscription/tiers", e.message);
  }
}

async function checkMechanicsEndpoint() {
  try {
    const res = await fetchSafe("/api/mechanics");
    const status = res.status;
    if (status === 200 || status === 401 || status === 403) {
      ok("/api/mechanics", `status=${status}`);
    } else {
      fail("/api/mechanics", `status=${status}`);
    }
  } catch (e) {
    fail("/api/mechanics", e.message);
  }
}

// ─── write tests (opt-in) ──────────────────────────────────────────

async function testMarketplaceSellerIntake() {
  try {
    const res = await fetchSafe("/api/marketplace/seller-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const status = res.status;
    // Should 400 with empty body — validates fields
    if (status === 400 || status === 429) {
      ok("POST /api/marketplace/seller-intake validation", `status=${status} (rejected empty)`);
    } else {
      fail("POST /api/marketplace/seller-intake validation", `status=${status}`);
    }
  } catch (e) {
    fail("POST /api/marketplace/seller-intake", e.message);
  }
}

async function testBuyerInterestIntake() {
  try {
    const res = await fetchSafe("/api/marketplace/buyer-interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const status = res.status;
    if (status === 400 || status === 429) {
      ok("POST /api/marketplace/buyer-interest validation", `status=${status} (rejected empty)`);
    } else {
      fail("POST /api/marketplace/buyer-interest validation", `status=${status}`);
    }
  } catch (e) {
    fail("POST /api/marketplace/buyer-interest", e.message);
  }
}

async function testMechanicMatchIntake() {
  try {
    const res = await fetchSafe("/api/mechanic-match/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const status = res.status;
    if (status === 400 || status === 429) {
      ok("POST /api/mechanic-match/request validation", `status=${status} (rejected empty)`);
    } else {
      fail("POST /api/mechanic-match/request validation", `status=${status}`);
    }
  } catch (e) {
    fail("POST /api/mechanic-match/request", e.message);
  }
}

async function testConciergeIntake() {
  try {
    const res = await fetchSafe("/api/support/concierge-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const status = res.status;
    if (status === 400 || status === 429) {
      ok("POST /api/support/concierge-request validation", `status=${status} (rejected empty)`);
    } else {
      fail("POST /api/support/concierge-request validation", `status=${status}`);
    }
  } catch (e) {
    fail("POST /api/support/concierge-request", e.message);
  }
}

// ─── runner ─────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Drivable — Production Smoke Test");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Target:  ${BASE}`);
  console.log(`  Writes:  ${TEST_WRITE ? "ENABLED" : "disabled"}`);
  console.log(`  Auth:    ${REVIEWER_TOKEN ? "token set" : "no token (auth-gated endpoints will skip)"}`);
  console.log("───────────────────────────────────────────────────────\n");

  // ── read-only checks (always run) ──
  await checkHomepageReturnsHtml();
  await checkSpaNavigationFallback();
  await checkHealthLive();
  await checkHealthReadiness();
  await checkHealthDb();
  await checkCapabilities();
  await checkUnknownApiRoute();
  await checkCorsHeaders();
  await checkCorsAllowedOrigin();
  await checkSecurityHeaders();
  await checkSubscriptionTiers();
  await checkMechanicsEndpoint();

  // ── write / intake tests (opt-in only) ──
  if (TEST_WRITE) {
    console.log("\n  ── Write / intake tests (TEST_WRITE=true) ──\n");
    await testMarketplaceSellerIntake();
    await testBuyerInterestIntake();
    await testMechanicMatchIntake();
    await testConciergeIntake();
  } else {
    skipCheck("POST intake tests", "TEST_WRITE not set — skipping to avoid production pollution");
  }

  // ── summary ──
  console.log("\n───────────────────────────────────────────────────────");
  console.log(`  Results:  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log("═══════════════════════════════════════════════════════");

  if (failed > 0) {
    console.error("\n  FAILED checks:");
    for (const r of results.filter(r => !r.pass)) {
      console.error(`    ✗ ${r.name}  ${r.detail ? `(${r.detail})` : ""}`);
    }
  }

  process.exitCode = failed > 0 ? 1 : 0;
}

main();
