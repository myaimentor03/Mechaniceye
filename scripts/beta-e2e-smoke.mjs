/**
 * Drivable launch E2E beta smoke for the OpenAI marathon QA assignment
 * (Worker 4: DRIVABLE END-TO-END / MOBILE / DEPLOYMENT QA ENGINEER).
 *
 * Modes:
 *  - auto (default): spawns a production-like server from dist/server/index.js
 *    plus an in-memory S3-compatible stub and a webhook stub, then runs the full
 *    fail-closed matrix with no real database, no live infra, and no customer data.
 *  - external: pass BASE_URL=... to run the read-only, validation, and static
 *    sweeps against an already-running deployment. Stub-backed checks print SKIP.
 *  - Database mode: set DATABASE_URL=... to unlock the opt-in happy-path checks
 *    (register/login, text-only intake 200, buyer-check fixture, review release).
 *
 * Safety: no real customer data, no secrets, no production writes, no live infra
 * changes, no NHTSA --apply. All data is synthetic QA sentinel values.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createS3Stub } from "./lib/s3-stub.mjs";
import { createWebhookStub } from "./lib/webhook-stub.mjs";
import { sessionCookieHeader } from "./lib/session-token.mjs";
import {
  REPO_ROOT,
  spawnDrivableServer,
  stopProcess,
  findFreePort,
  waitForHttp,
  waitForExit,
} from "./lib/spawn-server.mjs";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.BASE_URL?.trim() || "";
const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
const EXTERNAL = Boolean(BASE_URL);
const GLOBAL_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 40000);

const REFERER_LEGACY = "https://mechaniceye.onrender.com";
const SESSION_SECRET = process.env.DRIVABLE_SESSION_SECRET || "qa-marathon-session-secret-0902-abcdef-1234567890";
const REVIEWER_TOKEN = process.env.DRIVABLE_REVIEWER_TOKEN || "qa-marathon-reviewer-token-0902-abcdefghijklmnopqrstuvwxyz0123456789";
const BETA_INVITE = process.env.DRIVABLE_BETA_INVITE_CODE?.trim() || "QA-MARATHON-0902-INVITE";

const results = [];
let currentSection = "";
let failed = 0;
let passed = 0;
let skipped = 0;
let checked = 0;

function section(name) {
  currentSection = name;
  console.log(`\n=== ${name} ===`);
}

function check(name, fn, { skipReason } = {}) {
  checked += 1;
  if (skipReason) {
    skipped += 1;
    results.push({ section: currentSection, name, status: "skip", detail: skipReason });
    console.log(`  SKIP  ${name}  (${skipReason})`);
    return;
  }
  return Promise.resolve()
    .then(fn)
    .then((detail) => {
      passed += 1;
      results.push({ section: currentSection, name, status: "pass", detail });
      console.log(`  PASS  ${name}${detail ? `  [${detail}]` : ""}`);
    })
    .catch((error) => {
      failed += 1;
      results.push({ section: currentSection, name, status: "fail", detail: (error && error.message) || String(error) });
      console.log(`  FAIL  ${name}  ${(error && error.message) || String(error)}`);
    });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function jsonResponse(response) {
  return response.json().catch(() => ({}));
}

async function get(url, headers = {}) {
  const response = await fetch(url, {
    headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", ...headers },
    signal: AbortSignal.timeout(GLOBAL_TIMEOUT_MS),
  });
  return response;
}

async function postJson(url, body, headers = {}, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(GLOBAL_TIMEOUT_MS),
  });
  return response;
}

async function postMultipart(url, form, headers = {}, { signal } = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: form,
    signal: signal || AbortSignal.timeout(GLOBAL_TIMEOUT_MS),
  });
  return response;
}

function jpegBytes(text = "synthetic jpeg") {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const footer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xd9]);
  return Buffer.concat([header, Buffer.from(text.repeat(64)), footer]);
}

function pngBytes(text = "synthetic png") {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(text.repeat(64)),
  ]);
}

function exeBytes(text = "MZ synthetic executable") {
  return Buffer.from(text.repeat(64));
}

function intakeForm({ photos = [], vibrationData, clientRequestId } = {}) {
  const form = new FormData();
  const evidenceIntake = {
    mode: "diagnose",
    ...(clientRequestId ? { clientRequestId } : {}),
    vehicle: { year: "2012", make: "Ford", model: "F-150", mileage: 168400 },
    situation: {
      description: "Engine running rough at highway speed",
      symptoms: ["Engine running rough"],
      timing: "Highway Speed",
      urgency: "Safe to Drive",
      canDrive: "Safe to Drive",
      recentRepairs: "New spark plugs",
    },
    obd: { codes: ["P0302"], attachmentIds: [] },
    attachments: [],
  };
  form.append("evidenceIntake", JSON.stringify(evidenceIntake));
  form.append("consent", JSON.stringify({
    service_fulfillment: true,
    media_processing: true,
    human_review_sharing: false,
    optional_product_learning: false,
  }));
  if (clientRequestId) form.append("clientRequestId", clientRequestId);
  if (vibrationData) form.append("vibrationData", JSON.stringify(vibrationData));
  for (let index = 0; index < photos.length; index += 1) {
    const { bytes, type, name } = photos[index];
    form.append("photos", new Blob([bytes], { type }), name);
  }
  return form;
}

function marketplaceSellerBody() {
  return {
    submittedAt: new Date().toISOString(),
    sellerName: "PiiSellerNameAlpha123",
    sellerEmail: "seller-191919@example.test",
    sellerPhone: "555-019-1919",
    city: "Anytown",
    state: "CA",
    zip: "90210",
    vehicleYear: "2015",
    make: "Toyota",
    model: "Camry",
    trim: "LE",
    mileage: "142100",
    askingPrice: "7450",
    titleStatus: "clean",
    runsAndDrives: "Runs and drives",
    condition: "Good",
    exteriorColor: "Silver",
    transmission: "Automatic",
    fuelType: "Gasoline",
    hasKeys: true,
    lienStatus: "No lien",
    bestContactMethod: "Email",
    buyerTestDriveAllowed: true,
    buyerMechanicAllowed: true,
    sellerNotes: "Well maintained",
    acknowledgments: { ownerAuthorized: true, platformOnly: true, sellerResponsibilities: true, noGuarantee: true },
    knownIssues: "Minor cosmetic wear",
    recentRepairs: "New alternator",
    listingType: "basic",
  };
}

function marketplaceBuyerBody() {
  return {
    submittedAt: new Date().toISOString(),
    buyerName: "PiiBuyerNameEcho234",
    buyerEmail: "buyer-292929@example.test",
    buyerPhone: "555-019-2929",
    preferredContactMethod: "Email",
    listingUrl: "https://drivablestaging.example.test/listings/sample",
    listingTitle: "2015 Toyota Camry LE",
    message: "Is the truck still available?",
    timeline: "This weekend",
    acknowledgments: { platformOnly: true, buyerResponsibilities: true, noGuarantee: true },
  };
}

function followUpForm({ audio, video, vibration, additionalInfo = "still rough after repair" } = {}) {
  const form = new FormData();
  if (additionalInfo) form.append("additionalInfo", additionalInfo);
  if (vibration) form.append("vibrationData", JSON.stringify({ samples: [0.1, 0.2, 0.3] }));
  if (audio) form.append("audio", new Blob([audio], { type: "audio/mpeg" }), "note.mp3");
  if (video) form.append("video", new Blob([video], { type: "video/mp4" }), "clip.mp4");
  return form;
}

function uploadsDirFileCount() {
  const uploadsDir = path.join(REPO_ROOT, "uploads");
  if (!existsSync(uploadsDir)) return 0;
  let count = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else count += 1;
    }
  };
  walk(uploadsDir);
  return count;
}

async function assertUploadsCountStable(before, { retries = 40, delayMs = 50 } = {}) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (uploadsDirFileCount() === before) return;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  assert(uploadsDirFileCount() === before, `uploads dir leaked temp files (before=${before}, after=${uploadsDirFileCount()})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Drivable beta E2E smoke — mode=${EXTERNAL ? "external" : "auto"}${DATABASE_URL ? " +db" : ""}`);
  console.log(`Repository root: ${REPO_ROOT}`);

  let serverConfig = null;
  let s3stub = null;
  let webhook = null;
  let baseUrl = BASE_URL;
  const runners = [];

  if (!EXTERNAL) {
    const serverEntry = path.join(REPO_ROOT, "dist", "server", "index.js");
    if (!existsSync(serverEntry)) {
      throw new Error(`Server build missing: ${serverEntry}. Run "npm run build" first.`);
    }
    const distClient = path.join(REPO_ROOT, "dist", "client");
    if (!existsSync(path.join(distClient, "index.html"))) {
      throw new Error(`Client build missing: ${distClient}. Run "npm run build" first.`);
    }

    s3stub = createS3Stub();
    const s3Endpoint = await s3stub.start();
    webhook = createWebhookStub();
    const webhookUrl = await webhook.start();

    const common = {
      DRIVABLE_REVIEWER_TOKEN: REVIEWER_TOKEN,
      DRIVABLE_SESSION_SECRET: SESSION_SECRET,
      DRIVABLE_BETA_INVITE_CODE: BETA_INVITE,
      MASTER_INTAKE_WEBHOOK_URL: webhookUrl,
      DRIVABLE_EVIDENCE_S3_BUCKET: "qa-evidence",
      DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
      DRIVABLE_EVIDENCE_S3_ENDPOINT: s3Endpoint,
      DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "qa-access-key",
      DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "qa-secret-key",
      DRIVABLE_EVIDENCE_S3_FORCE_PATH_STYLE: "true",
      DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
      DRIVABLE_PUBLIC_ORIGIN: "https://getdrivable.com",
      NODE_ENV: "production",
      ...(DATABASE_URL ? { DATABASE_URL } : {}),
    };

    const mainPort = await findFreePort();
    const main = spawnDrivableServer({ port: mainPort, env: { ...common, DRIVABLE_LAUNCH_CONTROLS_ENABLED: "true" } });
    runners.push(main);
    baseUrl = `http://127.0.0.1:${mainPort}`;
    await waitForHttp(`${baseUrl}/api/health/live`);

    serverConfig = { s3stub, webhook, mainPort, s3Endpoint, webhookUrl };
  }

  const cookie = sessionCookieHeader({ id: "qa-customer-0001", email: "qa-customer@example.test", secret: SESSION_SECRET });
  const tamperedCookie = `${cookie.slice(0, -2)}XX`;
  const expiredCookie = sessionCookieHeader({ id: "qa-customer-0002", email: "qa-expired@example.test", secret: SESSION_SECRET, ttlSeconds: -1 });
  const bearer = `Bearer ${REVIEWER_TOKEN}`;

  async function intakeWithSession(cookieValue, form) {
    return postMultipart(`${baseUrl}/api/diagnoses`, form, { cookie: cookieValue });
  }

  // ------------------------------------------------------------------ LOCAL
  section("LOCAL E2E — deployment, routing, CORS, transport guards");

  await check("GET / serves the built SPA (index.html)", async () => {
    const response = await get(baseUrl + "/");
    const text = await response.text();
    assert(response.status === 200, `expected 200 got ${response.status}`);
    assert(/<div id="root"|<title>/i.test(text) || text.includes("index"), "index.html content missing");
    return "ok";
  });

  const SPA_DEEP_LINKS = ["/clearsale", "/buyer-check", "/mechanic-match", "/marketplace", "/start", "/help"];
  await check(`SPA deep links return index.html (${SPA_DEEP_LINKS.join(", ")})`, async () => {
    for (const route of SPA_DEEP_LINKS) {
      const response = await get(baseUrl + route);
      const text = await response.text();
      assert(response.status === 200, `${route} expected 200 got ${response.status}`);
      assert(text.includes("<div id=\"root\""), `${route} did not return SPA shell`);
    }
    return "ok";
  });

  await check("client-rendered route without extension falls back to SPA", async () => {
    const response = await get(baseUrl + "/marketplace/listing/sample");
    const text = await response.text();
    assert(response.status === 200, `expected 200 got ${response.status}`);
    assert(text.includes("<!doctype html>") || text.includes("<html"), "expected HTML fallback");
    return "ok";
  });

  await check("GET /api (unknown API path) returns 404 JSON", async () => {
    const response = await get(baseUrl + "/api");
    assert(response.status === 404, `expected 404 got ${response.status}`);
    return "ok";
  });

  await check("GET /api/health (bare) returns 200 aggregate with no-store", async () => {
    const response = await get(baseUrl + "/api/health");
    const body = await jsonResponse(response);
    assert(response.status === 200, `expected 200 got ${response.status}`);
    assert(body.ok === true && body.live === true, "expected ok:true live:true");
    assert(response.headers.get("cache-control")?.includes("no-store"), "missing no-store");
    return "ok";
  });

  await check("GET /api/health/live returns 200 ok:true with no-store", async () => {
    const response = await get(baseUrl + "/api/health/live");
    const body = await jsonResponse(response);
    assert(response.status === 200, `expected 200 got ${response.status}`);
    assert(body.ok === true, "expected ok:true");
    assert(response.headers.get("cache-control")?.includes("no-store"), "missing no-store");
    return "ok";
  });

  await check("GET /api/health/readiness without reviewer token -> 401", async () => {
    const response = await get(baseUrl + "/api/health/readiness");
    assert(response.status === 401, `expected 401 got ${response.status}`);
    return "ok";
  });

  await check("GET /api/health/readiness with token reports not-ready fail-closed when DB is absent", async () => {
    const response = await get(baseUrl + "/api/health/readiness", { authorization: bearer });
    const body = await jsonResponse(response);
    assert(response.status === 503, `expected 503 got ${response.status}`);
    if (body && "ready" in body) assert(body.ready === false, "readiness must report ready:false without DB");
    return "ready:false";
  });

  await check("GET /api/health/db with token -> 503 (no DATABASE_URL)", async () => {
    const response = await get(baseUrl + "/api/health/db", { authorization: bearer });
    const body = await jsonResponse(response);
    assert(response.status === 503, `expected 503 got ${response.status}`);
    assert(body.ok === false, "expected ok:false");
    return "ok";
  });

  await check("GET /api/capabilities advertises photoUpload only when configured + no-store", async () => {
    const response = await get(baseUrl + "/api/capabilities");
    const body = await jsonResponse(response);
    assert(response.status === 200, `expected 200 got ${response.status}`);
    assert(response.headers.get("cache-control")?.includes("no-store"), "missing no-store");
    assert(typeof body.photoUpload === "boolean", "photoUpload must be a boolean");
    assert(body.audioUpload === false && body.videoUpload === false, "audio/video must not be advertised");
    assert(body.vibrationSensorCapture === false, "vibration must not be advertised");
    return `photoUpload=${body.photoUpload}`;
  });

  // Static asset loads
  await check("bundled JS asset from index.html is served", async () => {
    const html = await (await get(baseUrl + "/")).text();
    const match = html.match(/src="([^"]+\.js)"/);
    assert(match, "no JS asset referenced in index.html");
    const response = await get(baseUrl + match[1]);
    assert(response.status === 200, `asset expected 200 got ${response.status}`);
    assert(response.headers.get("content-type")?.includes("javascript"), "expected JS content-type");
    return match[1];
  });

  await check("CORS: allowed origin echoes Access-Control-Allow-Origin", async () => {
    const response = await get(baseUrl + "/api/health/live", { origin: REFERER_LEGACY });
    assert(response.headers.get("access-control-allow-origin") === REFERER_LEGACY, "ACAO must echo allowed origin");
    return "ok";
  });

  await check("CORS: DRIVABLE_PUBLIC_ORIGIN origin is allowed", async () => {
    const response = await get(baseUrl + "/api/health/live", { origin: "https://getdrivable.com" });
    assert(response.headers.get("access-control-allow-origin") === "https://getdrivable.com", "ACAO must echo configured public origin");
    return "ok";
  });

  await check("CORS: disallowed origin gets no ACAO header", async () => {
    const response = await get(baseUrl + "/api/health/live", { origin: "https://evil.example.test" });
    assert(!response.headers.get("access-control-allow-origin"), "disallowed origin must not be echoed");
    return "ok";
  });

  await check("CORS: preflight OPTIONS returns 204 with headers for allowed origin", async () => {
    const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, {}, { origin: REFERER_LEGACY, "access-control-request-method": "POST" }, "OPTIONS");
    assert(response.status === 204, `expected 204 got ${response.status}`);
    assert(response.headers.get("access-control-allow-origin") === REFERER_LEGACY, "preflight ACAO missing");
    assert(response.headers.get("vary")?.toLowerCase().includes("origin"), "preflight must set Vary: Origin");
    return "ok";
  });

  await check("CORS: preflight OPTIONS from a disallowed origin is 204 but never echoes ACAO", async () => {
    const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, {}, { origin: "https://evil.example.test", "access-control-request-method": "POST" }, "OPTIONS");
    assert(response.status === 204, `expected 204 got ${response.status}`);
    assert(!response.headers.get("access-control-allow-origin"), "disallowed preflight must not echo ACAO");
    assert(response.headers.get("vary")?.toLowerCase().includes("origin"), "preflight from any origin must set Vary: Origin");
    return "ok";
  });

  await check("CORS: Origin: null (sandboxed iframe / file protocol) is never echoed", async () => {
    const response = await get(baseUrl + "/api/health/live", { origin: "null" });
    assert(!response.headers.get("access-control-allow-origin"), "Origin:null must never be echoed");
    return "ok";
  });

  await check("CORS: denied origin response still sets Vary: Origin so no shared cache serves one origin's CORS state", async () => {
    const response = await get(baseUrl + "/api/health/live", { origin: "https://evil.example.test" });
    assert(!response.headers.get("access-control-allow-origin"), "denied origin must not get ACAO");
    assert(response.headers.get("vary")?.toLowerCase().includes("origin"), "denied origin must still set Vary: Origin");
    return "ok";
  });

  await check("GET /api/assets content-type guard (unknown API route) 404", async () => {
    const response = await get(baseUrl + "/api/does-not-exist");
    assert(response.status === 404, `expected 404 got ${response.status}`);
    return "ok";
  });

  await check("unsupported HTTP method on a live route returns 404 JSON", async () => {
    const response = await postJson(`${baseUrl}/api/health/live`, {}, {}, "PUT");
    assert(response.status === 404, `expected 404 got ${response.status}`);
    return "ok";
  });

  await check("POST malformed JSON -> 400", async () => {
    const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, "{not-json", {}, "POST");
    assert(response.status === 400, `expected 400 got ${response.status}`);
    return "ok";
  });

  await check("POST body over 100kb (express default) -> 413", async () => {
    const huge = { filler: "x".repeat(150 * 1024) };
    const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, huge);
    assert(response.status === 413, `expected 413 got ${response.status}`);
    await response.text();
    return "ok";
  });

  await check("error responses do not leak stack traces", async () => {
    const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, "{not-json");
    const text = await response.text();
    assert(!/^\s*at\s/i.test(text.split("\n")[0] || ""), "response leaked stack frame");
    assert(!text.includes("node:internal"), "response leaked internal path");
    assert(!text.includes("routes.ts"), "response leaked source path");
    return "ok";
  });

  await check("no PII in server stdout while serving pages", async () => {
    const output = EXTERNAL ? "" : runners[0].combinedOutput;
    if (!EXTERNAL) {
      assert(!output.includes("PiiSellerNameAlpha123"), "seller name leaked to stdout");
      assert(!output.includes("PiiBuyerNameEcho234"), "buyer name leaked to stdout");
    }
    return "ok";
  });

  await check("wrong reviewer token on a reviewer route -> 401", async () => {
    const response = await get(baseUrl + "/api/health/readiness", { authorization: "Bearer not-the-configured-token" });
    assert(response.status === 401, `expected 401 got ${response.status}`);
    return "ok";
  });

  await check("GET /api/subscription/tiers is a public catalog with no per-user entitlement flags", async () => {
    const response = await get(baseUrl + "/api/subscription/tiers");
    const body = await jsonResponse(response);
    assert(response.status === 200, `expected 200 got ${response.status}`);
    assert(body && Object.keys(body).length > 0, "expected tier catalog");
    for (const tier of Object.values(body || {})) {
      const record = tier || {};
      assert(!("entitlement" in record) && !("paid" in record) && !("granted" in record), "public catalog must not expose entitlement flags");
    }
    return "ok";
  });

  await check("payment/order/entitlement mutation paths do not exist -> 404 (no client spoofing surface)", async () => {
    for (const spoofer of ["/api/orders", "/api/checkout/session", "/api/orders/pay", "/api/account/entitlements", "/api/payments/confirm", "/api/account/upgrade"]) {
      const response = await get(baseUrl + spoofer);
      assert(response.status === 404, `${spoofer} expected 404 got ${response.status}`);
      await response.text();
    }
    return "ok";
  });

  await check("unauthenticated /api/auth/me reports no account and never a paid flag", async () => {
    const response = await get(baseUrl + "/api/auth/me");
    const body = await jsonResponse(response);
    assert(response.status === 200 || response.status === 401, `unexpected status ${response.status}`);
    assert(!("entitlement" in (body || {})) && !(body && body.user && "tier" in body.user), "anonymous /me must not expose paid state");
    return `status ${response.status}`;
  });

  if (EXTERNAL) {
    await check("live-db dependent checks (auto mode only)", async () => {
      throw new Error("no-op");
    }, { skipReason: "auto mode required" });

    await check("S3-stub dependent checks (auto mode only)", async () => {
      throw new Error("no-op");
    }, { skipReason: "auto mode required" });
  }

  // ---------------------------------------------------------- DRIVABLE INTAKE
  section("DRIVABLE INTAKE — fail-closed session, consent, media boundary, rollback");

  await check("POST /api/diagnoses without session -> 401 CUSTOMER_AUTH_REQUIRED", async () => {
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, intakeForm());
    const body = await jsonResponse(response);
    assert(response.status === 401, `expected 401 got ${response.status}`);
    assert(body.code === "CUSTOMER_AUTH_REQUIRED", `expected CUSTOMER_AUTH_REQUIRED got ${body.code}`);
    return "ok";
  });

  await check("POST /api/diagnoses with tampered cookie -> 401", async () => {
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, intakeForm(), { cookie: tamperedCookie });
    assert(response.status === 401, `expected 401 got ${response.status}`);
    return "ok";
  });

  await check("POST /api/diagnoses with expired session -> 401", async () => {
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, intakeForm(), { cookie: expiredCookie });
    assert(response.status === 401, `expected 401 got ${response.status}`);
    return "ok";
  });

  await check("text-only intake with valid session fails CLOSED (503 persisted:false) when DB is absent", async () => {
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, intakeForm(), { cookie });
    const body = await jsonResponse(response);
    assert(response.status === 503, `expected 503 got ${response.status}`);
    assert(body.persisted === false, "must report persisted:false");
    assert(body.code === "CONSENT_CONTROLS_UNAVAILABLE", `unexpected code ${body.code}`);
    return "ok";
  });

  await check("empty evidenceIntake object (schema defaults applied) still fails CLOSED, never a fabricated 200", async () => {
    const form = intakeForm();
    form.set("evidenceIntake", "{}");
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, form, { cookie });
    const body = await jsonResponse(response);
    assert(response.status === 503, `expected 503 got ${response.status}`);
    assert(body.persisted === false, "must report persisted:false");
    assert(body.code === "CONSENT_CONTROLS_UNAVAILABLE", `unexpected code ${body.code}`);
    return "ok";
  });

  await check("missing consent field with launch controls + no DB -> 503 persisted:false (fail-closed, same gate)", async () => {
    const form = intakeForm();
    form.delete("consent");
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, form, { cookie });
    const body = await jsonResponse(response);
    assert(response.status === 503, `expected 503 got ${response.status}`);
    assert(body.persisted === false, "must report persisted:false");
    return "ok";
  });

  await check("intake with photos and DB absent never reaches media upload (fail-closed before persistence)", async () => {
    const before = serverConfig ? serverConfig.s3stub.getPutCount() : 0;
    const response = await postMultipart(
      `${baseUrl}/api/diagnoses`,
      intakeForm({ photos: [{ bytes: jpegBytes(), type: "image/jpeg", name: "a.jpg" }, { bytes: jpegBytes("two"), type: "image/jpeg", name: "b.jpg" }] }),
      { cookie }
    );
    const body = await jsonResponse(response);
    assert(response.status === 503, `expected 503 got ${response.status}`);
    assert(body.persisted === false, "must report persisted:false");
    if (serverConfig) {
      const after = serverConfig.s3stub.getPutCount();
      assert(after === before, `no S3 PUTs expected before consent gate, saw ${after - before}`);
    }
    return "ok";
  });

  await check("evidenceIntake that is not valid JSON -> 400", async () => {
    const form = intakeForm();
    form.set("evidenceIntake", "not-json{");
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, form, { cookie });
    assert(response.status === 400, `expected 400 got ${response.status}`);
    return "ok";
  });

  await check("invalid VIN in evidenceIntake -> 400 (schema regex gate)", async () => {
    const form = intakeForm();
    const intake = JSON.parse(form.get("evidenceIntake"));
    intake.vehicle.vin = "NOT-A-REAL-VIN";
    form.set("evidenceIntake", JSON.stringify(intake));
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, form, { cookie });
    assert(response.status === 400, `expected 400 got ${response.status}`);
    return "ok";
  });

  await check("non-numeric mileage in evidenceIntake -> 400", async () => {
    const form = intakeForm();
    const intake = JSON.parse(form.get("evidenceIntake"));
    intake.vehicle.mileage = "one-hundred-thousand";
    form.set("evidenceIntake", JSON.stringify(intake));
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, form, { cookie });
    assert(response.status === 400, `expected 400 got ${response.status}`);
    return "ok";
  });

  await check("unknown evidence mode -> 400 (enum gate)", async () => {
    const form = intakeForm();
    const intake = JSON.parse(form.get("evidenceIntake"));
    intake.mode = "diagnoseAndDrive";
    form.set("evidenceIntake", JSON.stringify(intake));
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, form, { cookie });
    assert(response.status === 400, `expected 400 got ${response.status}`);
    return "ok";
  });

  await check("unadvertised audio/video/vibration parts on intake are rejected and never persisted", async () => {
    const before = serverConfig ? serverConfig.s3stub.getPutCount() : 0;
    const form = intakeForm();
    form.append("audio", new Blob([Buffer.from("audio bytes")], { type: "audio/mpeg" }), "note.mp3");
    form.append("video", new Blob([Buffer.from("video bytes")], { type: "video/mp4" }), "clip.mp4");
    form.append("vibrationData", JSON.stringify({ samples: [0.1] }));
    const response = await postMultipart(`${baseUrl}/api/diagnoses`, form, { cookie });
    const body = await jsonResponse(response);
    assert(response.status === 415, `expected 415 got ${response.status}`);
    assert(body.persisted === false, "must report persisted:false");
    if (serverConfig) {
      const after = serverConfig.s3stub.getPutCount();
      assert(after === before, `audio/video/vibration must never reach object storage, saw ${after - before} PUTs`);
    }
    return "ok";
  });

  await check("interrupted-like client abort leaves no persisted evidence and a healthy server", async () => {
    const beforePut = serverConfig ? serverConfig.s3stub.getPutCount() : 0;
    const form = intakeForm({ photos: [{ bytes: Buffer.alloc(4 * 1024 * 1024, 1), type: "image/jpeg", name: "big.jpg" }] });
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 40);
    try {
      await postMultipart(`${baseUrl}/api/diagnoses`, form, { cookie }, { signal: controller.signal });
    } catch {
      // Abort mid-upload is the point of the check.
    } finally {
      clearTimeout(abortTimer);
    }
    const health = await get(baseUrl + "/api/health/live");
    assert(health.status === 200, `server must stay healthy after an interrupted request, got ${health.status}`);
    if (serverConfig) {
      const objects = serverConfig.s3stub.objectKeys().filter((key) => key.startsWith("evidence/"));
      assert(objects.length === 0, `interrupted request left objects: ${objects.join(",")}`);
    }
    return `PUTs ${serverConfig ? serverConfig.s3stub.getPutCount() - beforePut : "n/a"}`;
  });

  if (EXTERNAL || !serverConfig) {
    section("AUTH / REVIEW — reviewer gates and launch-control fail-closed");
    await check("photo-boundary checks are stub-backed (auto mode)", async () => {
      throw new Error("no-op");
    }, { skipReason: "requires local stubs" });
  } else {
    // ---------------------------------------------------------- PHOTO STUBS
    section("R2/S3 MOCKS — private object storage boundary (legacy-local server)");

    const legacyPort = await findFreePort();
    const legacy = spawnDrivableServer({
      port: legacyPort,
      env: {
        DRIVABLE_REVIEWER_TOKEN: REVIEWER_TOKEN,
        DRIVABLE_SESSION_SECRET: SESSION_SECRET,
        DRIVABLE_BETA_INVITE_CODE: BETA_INVITE,
        MASTER_INTAKE_WEBHOOK_URL: serverConfig.webhookUrl,
        DRIVABLE_EVIDENCE_S3_BUCKET: "qa-evidence",
        DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
        DRIVABLE_EVIDENCE_S3_ENDPOINT: serverConfig.s3Endpoint,
        DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "qa-access-key",
        DRIVABLE_EVIDENCE_S3_SECRET_ACCESS_KEY: "qa-secret-key",
        DRIVABLE_EVIDENCE_S3_FORCE_PATH_STYLE: "true",
        DRIVABLE_PHOTO_UPLOAD_ENABLED: "true",
        NODE_ENV: "production",
        ...(DATABASE_URL ? { DATABASE_URL } : {}),
      },
    });
    runners.push(legacy);
    const legacyUrl = `http://127.0.0.1:${legacyPort}`;
    await waitForHttp(`${legacyUrl}/api/health/live`);
    const s3 = serverConfig.s3stub;

    await check("valid photos persist to S3 stub, then DB fail triggers full case cleanup (503 persisted:false)", async () => {
      const response = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ photos: [
        { bytes: jpegBytes("photo-one"), type: "image/jpeg", name: "front.jpg" },
        { bytes: jpegBytes("photo-two"), type: "image/jpeg", name: "rear.jpg" },
      ] }), { cookie: sessionCookieHeader({ id: "qa-photo-1", email: "qa-photo1@example.test", secret: SESSION_SECRET }) });
      const body = await jsonResponse(response);
      assert(response.status === 503, `expected 503 got ${response.status}`);
      assert(body.persisted === false, "must report persisted:false");
      assert(body.caseId, "expected caseId reference");
      const putKeys = s3.ops.filter((op) => op.op === "put" && op.status === 200).map((op) => op.key);
      const casePrefix = `evidence/${body.caseId}/`;
      const ownPuts = putKeys.filter((key) => key.startsWith(casePrefix));
      assert(ownPuts.length >= 2, `expected at least two photo objects, saw ${ownPuts.length}`);
      const remaining = s3.objectKeys().filter((key) => key.startsWith(casePrefix.replace(/\/$/, "")));
      assert(remaining.length === 0, `leftover objects after rollback: ${remaining.join(",")}`);
      assert(s3.ops.some((op) => op.op === "delete" && op.status === 204), "expected delete cleanup ops");
      return `case ${body.caseId.slice(0, 8)}`;
    });

    await check("evidence object keys never embed original filenames or path traversal segments", async () => {
      const ops = serverConfig.s3stub.ops.filter((op) => op.op === "put" && op.status === 200);
      assert(ops.length > 0, "expected at least one successful object write to inspect");
      const keyShape = /^evidence\/[A-Za-z0-9._-]+\/[a-f0-9-]{36}\.(jpg|png|webp|heic)$|^evidence\/[A-Za-z0-9._-]+\/attachments\.json$/;
      for (const op of ops) {
        assert(!op.key.includes(".."), `key ${op.key} contains traversal`);
        assert(!/front\.jpg|rear\.jpg|photo-one|photo-two/.test(op.key), `key ${op.key} embeds original filename`);
        assert(keyShape.test(op.key), `key ${op.key} not case-scoped`);
        assert(op.key.startsWith("evidence/"), `key ${op.key} outside evidence namespace`);
      }
      return "keys case-scoped";
    });

    await check("stored objects carry retention, case, and evidence-status metadata (no public URL)", async () => {
      const putOps = s3.ops.filter((op) => op.op === "put" && op.status === 200);
      assert(putOps.length > 0, "expected at least one successful object write to inspect");
      const photos = putOps.filter((op) => op.key.endsWith(".jpg"));
      assert(photos.length >= 2, `expected at least two photo objects with metadata, saw ${photos.length}`);
      for (const record of photos) {
        const metadata = record.metadata || {};
        assert(metadata["retention-days"] === "30", `missing retention-days on ${record.key}`);
        assert(/^\d{4}-\d{2}-\d{2}T/.test(metadata["delete-after"] || ""), `missing ISO delete-after on ${record.key}`);
        assert(metadata["evidence-status"] === "uploaded_not_analyzed", `missing evidence-status on ${record.key}`);
        assert(metadata["case-id"], `missing case-id on ${record.key}`);
        assert(!metadata["public-url"] && !metadata["acl"], `no public ACL/URL metadata on ${record.key}`);
      }
      return `${photos.length} photo objects tagged`;
    });

    await check("protected evidence retrieval denies unauthenticated access -> 401", async () => {
      const response = await get(`${legacyUrl}/api/internal/evidence/some-case-0001/some-attachment-id`);
      assert(response.status === 401, `expected 401 got ${response.status}`);
      return "ok";
    });

    await check("protected evidence retrieval of a missing object is 404, never a fabricated stream", async () => {
      const response = await get(`${legacyUrl}/api/internal/evidence/qa-missing-case/qa-missing-attachment`, { authorization: bearer });
      const contentType = response.headers.get("content-type") || "";
      assert(response.status === 404, `expected 404 got ${response.status}`);
      assert(!contentType.includes("image/"), "must not stream fabricated media");
      return "ok";
    });

    await check("server stdout never exposes storage endpoints, signed URLs, or credentials", async () => {
      const output = runners[0].combinedOutput + runners[1].combinedOutput;
      for (const needle of ["X-Amz-Credential", ".r2.cloudflarestorage.com", "qa-secret-key", "SIGV4", "AWSAccessKeyId"]) {
        assert(!output.includes(needle), `server output exposed ${needle}`);
      }
      return "stdout clean";
    });

    await check("too many photos (9) -> 413 LIMIT_FILE_COUNT", async () => {
      const photos = Array.from({ length: 9 }, (_, index) => ({ bytes: jpegBytes(String(index)), type: "image/jpeg", name: `p${index}.jpg` }));
      const response = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ photos }), { cookie });
      const body = await jsonResponse(response);
      assert(response.status === 413, `expected 413 got ${response.status}`);
      assert(body.persisted === false, "must report persisted:false");
      return "ok";
    });

    await check("oversized single photo (>12MB) -> 413 LIMIT_FILE_SIZE", async () => {
      const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(13 * 1024 * 1024, 7)]);
      const response = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ photos: [{ bytes: big, type: "image/jpeg", name: "big.jpg" }] }), { cookie });
      const body = await jsonResponse(response);
      assert(response.status === 413, `expected 413 got ${response.status}`);
      assert(body.persisted === false, "must report persisted:false");
      return "ok";
    });

    await check("non-photo mime part (video/mp4) -> 415", async () => {
      const response = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ photos: [{ bytes: Buffer.from("video"), type: "video/mp4", name: "clip.mp4" }] }), { cookie });
      assert(response.status === 415, `expected 415 got ${response.status}`);
      return "ok";
    });

    await check("PNG bytes labeled image/jpeg -> 507 (MIME mismatch), no objects written", async () => {
      const before = s3.getPutCount();
      const response = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ photos: [{ bytes: pngBytes(), type: "image/jpeg", name: "sneaky.png" }] }), { cookie });
      const body = await jsonResponse(response);
      assert(response.status === 507, `expected 507 got ${response.status}`);
      assert(body.persisted === false, "must report persisted:false");
      assert(s3.getPutCount() === before, "no objects may be written on mismatch");
      return "ok";
    });

    await check("executable bytes labeled image/jpeg -> 507 (content sniff), no objects written", async () => {
      const before = s3.getPutCount();
      const response = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ photos: [{ bytes: exeBytes(), type: "image/jpeg", name: "evil.exe.jpg" }] }), { cookie });
      assert(response.status === 507, `expected 507 got ${response.status}`);
      assert(s3.getPutCount() === before, "no objects may be written for non-image bytes");
      return "ok";
    });

    await check("S3 unavailable (storage outage) -> 507 persisted:false, no leftovers", async () => {
      s3.failAllPuts(true);
      try {
        const response = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ photos: [
          { bytes: jpegBytes("one"), type: "image/jpeg", name: "a.jpg" },
          { bytes: jpegBytes("two"), type: "image/jpeg", name: "b.jpg" },
        ] }), { cookie: sessionCookieHeader({ id: "qa-outage", email: "qa-outage@example.test", secret: SESSION_SECRET }) });
        const body = await jsonResponse(response);
        assert(response.status === 507, `expected 507 got ${response.status}`);
        assert(body.persisted === false, "must report persisted:false");
        assert(s3.objectKeys().length === 0, "storage outage must not leave objects");
      } finally {
        s3.failAllPuts(false);
      }
      return "ok";
    });

    await check("partial mid-upload S3 failure rolls back the already-written photo", async () => {
      const before = s3.getPutCount();
      s3.failPutIndex(before + 2);
      try {
        const response = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ photos: [
          { bytes: jpegBytes("one"), type: "image/jpeg", name: "a.jpg" },
          { bytes: jpegBytes("two"), type: "image/jpeg", name: "b.jpg" },
        ] }), { cookie: sessionCookieHeader({ id: "qa-partial", email: "qa-partial@example.test", secret: SESSION_SECRET }) });
        const body = await jsonResponse(response);
        assert(response.status === 507, `expected 507 got ${response.status}`);
        assert(body.persisted === false, "must report persisted:false");
        assert(s3.objectKeys().length === 0, "partial failure must roll back written keys");
        assert(s3.ops.filter((op) => op.op === "delete").length >= 1, "expected at least one rollback delete");
      } finally {
        s3.failPutIndex(null);
      }
      return "ok";
    });

    if (DATABASE_URL) {
      await check("(db mode) text-only intake persists -> 200", async () => {
        const response = await postMultipart(legacyUrl + "/api/diagnoses", intakeForm(), { cookie });
        const body = await jsonResponse(response);
        assert(response.status === 200, `expected 200 got ${response.status}`);
        assert(body.caseId, "expected caseId in response");
        return "ok";
      });

      await check("(db mode) master intake webhook outage is best-effort: case persists 200 with truthful webhookForwarded:false", async () => {
        webhook.setFailAlways(true);
        try {
          const response = await postMultipart(legacyUrl + "/api/diagnoses", intakeForm(), {
            cookie: sessionCookieHeader({ id: "qa-webhook-outage", email: "qa-webhook-outage@example.test", secret: SESSION_SECRET }),
          });
          const body = await jsonResponse(response);
          assert(response.status === 200, `expected 200 got ${response.status}`);
          assert(body.webhookForwarded === false, "must truthfully report webhookForwarded:false");
          assert(body.webhookConfigured === true, "must truthfully report webhookConfigured:true");
          assert(body.caseId, "case must still persist when the intake webhook is down");
        } finally {
          webhook.setFailAlways(false);
        }
        return "ok";
      });
    }

    await check("sequential identical text-only intakes stay independent (no shared-case reuse)", async () => {
      const first = await jsonResponse(await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm(), { cookie }));
      const second = await jsonResponse(await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm(), { cookie }));
      assert(first.statusCode || first.caseId || first.persisted === false, "first intake response shape unexpected");
      assert(second.statusCode || second.caseId || second.persisted === false, "second intake response shape unexpected");
      assert(first.persisted === false && second.persisted === false, "expected fail-closed persisted:false in both");
      if (first.caseId && second.caseId) {
        assert(first.caseId !== second.caseId, "duplicate identical submissions must not reuse one case id");
      }
      return first.caseId === second.caseId ? "identical" : "distinct cases";
    });

    await check("duplicate clientRequestId is never idempotently collapsed or replayed at intake", async () => {
      const marker = `qa-dup-marker-${Date.now().toString(36)}`;
      const firstResponse = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ clientRequestId: marker }), { cookie });
      const first = await jsonResponse(firstResponse);
      const secondResponse = await postMultipart(`${legacyUrl}/api/diagnoses`, intakeForm({ clientRequestId: marker }), { cookie });
      const second = await jsonResponse(secondResponse);
      assert(firstResponse.status === 503 && secondResponse.status === 503, `both must fail closed; got ${firstResponse.status}/${secondResponse.status}`);
      assert(first.persisted === false && second.persisted === false, "no persisted success may be replayed from a client marker");
      assert(first.caseId && second.caseId, "expected case ids on fail-closed responses");
      assert(first.caseId !== second.caseId, "a duplicate client marker must not be replayed as the first case id");
      return `distinct ${first.caseId.slice(0, 8)} !== ${second.caseId.slice(0, 8)}`;
    });

    await check("follow-up with media on a missing case -> 404 and no temp file leak", async () => {
      const before = uploadsDirFileCount();
      const response = await postMultipart(`${legacyUrl}/api/diagnoses/qa-missing-case/follow-up`, followUpForm({ video: Buffer.from("video bytes"), audio: Buffer.from("audio bytes") }), { authorization: bearer });
      assert(response.status === 404, `expected 404 got ${response.status}`);
      await response.text();
      await assertUploadsCountStable(before);
      return "clean";
    });

    await check("follow-up with vibration + media -> 422 and temp files are cleaned", async () => {
      const before = uploadsDirFileCount();
      const response = await postMultipart(`${legacyUrl}/api/diagnoses/qa-missing-case/follow-up`, followUpForm({ video: Buffer.from("video bytes"), vibration: true }), { authorization: bearer });
      const body = await jsonResponse(response);
      assert(response.status === 422, `expected 422 got ${response.status}`);
      assert(body.code === "VIBRATION_CAPTURE_UNAVAILABLE", `unexpected code ${body.code}`);
      await assertUploadsCountStable(before);
      return "clean";
    });

    const halfCredentialPort = await findFreePort();
    const halfCredential = spawnDrivableServer({
      port: halfCredentialPort,
      env: {
        DRIVABLE_REVIEWER_TOKEN: REVIEWER_TOKEN,
        DRIVABLE_SESSION_SECRET: SESSION_SECRET,
        DRIVABLE_BETA_INVITE_CODE: BETA_INVITE,
        NODE_ENV: "production",
        DRIVABLE_EVIDENCE_S3_BUCKET: "qa-evidence",
        DRIVABLE_EVIDENCE_S3_REGION: "us-east-1",
        DRIVABLE_EVIDENCE_S3_ACCESS_KEY_ID: "only-half",
      },
    });
    runners.push(halfCredential);

    await check("half-configured S3 credentials fail server boot honestly (non-zero exit)", async () => {
      const exit = await waitForExit(halfCredential);
      assert(exit && exit.code !== 0, `expected non-zero exit but got ${JSON.stringify(exit)}`);
      assert(halfCredential.stderr.includes("Both S3 evidence credentials must be configured together"), "startup error must be honest about the credential mismatch");
      return `exit ${exit.code}`;
    });
  }

  // -------------------------------------------------------------- BUYER CHECK
  section("BUYER CHECK — free preview boundary (no DB in this harness)");

  await check("missing year/make/model -> 400 with required list", async () => {
    const response = await get(`${baseUrl}/api/buyer-risk/vehicle-knowledge?year=2015`);
    const body = await jsonResponse(response);
    assert(response.status === 400, `expected 400 got ${response.status}`);
    assert(Array.isArray(body.required), "expected required fields list");
    assert(body.found === false, "must report found:false");
    return "ok";
  });

  await check("non-integer year -> 400", async () => {
    const response = await get(`${baseUrl}/api/buyer-risk/vehicle-knowledge?year=abc&make=Toyota&model=Camry`);
    assert(response.status === 400, `expected 400 got ${response.status}`);
    return "ok";
  });

  await check("DB absent -> truthful 503, never a fake result", async () => {
    const response = await get(`${baseUrl}/api/buyer-risk/vehicle-knowledge?year=2015&make=Toyota&model=Camry`);
    const body = await jsonResponse(response);
    assert(response.status === 503, `expected 503 got ${response.status}`);
    assert(body.found === false, "must not fabricate a pack");
    return "ok";
  });

  if (DATABASE_URL) {
    await check("(db mode) buyer-check unknown vehicle with no stored pack -> 200 found:false with fallbackPrompts, never fabricated", async () => {
      const response = await get(`${baseUrl}/api/buyer-risk/vehicle-knowledge?year=1919&make=QAUnknown&model=NoSuchModel`);
      const body = await jsonResponse(response);
      assert(response.status === 200, `expected 200 got ${response.status}`);
      assert(body.found === false, "must report found:false");
      assert(Array.isArray(body.fallbackPrompts) && body.fallbackPrompts.length > 0, "expected hop-check fallback prompts");
      assert(body.vinRequiredForApplicability === true, "missing pack must still require VIN-level confirmation");
      return "ok";
    });
    await check("(db mode) buyer-check known pack fixture -> found:true", async () => {
      const response = await get(`${baseUrl}/api/buyer-risk/vehicle-knowledge?year=2015&make=Toyota&model=Camry`);
      assert(response.status === 200, `expected 200 got ${response.status}`);
      return "ok";
    }, { skipReason: "no seeded fixture guaranteed on this DB; documented as opt-in" });
  }

  // ------------------------------------------------------------------ AUTH
  section("AUTH / REVIEW — reviewer auth, launch controls, legacy review, follow-up");

  await check("register rejects short password (400, pre-DB)", async () => {
    const response = await postJson(`${baseUrl}/api/auth/register`, {
      email: "qa-register@example.test",
      password: "short",
      inviteCode: BETA_INVITE,
    });
    assert(response.status === 400, `expected 400 got ${response.status}`);
    return "ok";
  });

  await check("register rejects invalid invite code (403, pre-DB)", async () => {
    const response = await postJson(`${baseUrl}/api/auth/register`, {
      email: "qa-register@example.test",
      password: "strong-password-1234",
      inviteCode: "not-a-real-invite",
    });
    assert(response.status === 403, `expected 403 got ${response.status}`);
    return "ok";
  });

  await check("register with valid invite but no DB -> 503 fail-closed", async () => {
    const response = await postJson(`${baseUrl}/api/auth/register`, {
      email: "qa-register@example.test",
      password: "strong-password-1234",
      inviteCode: BETA_INVITE,
    });
    assert(response.status === 503, `expected 503 got ${response.status}`);
    return "ok";
  });

  await check("login with structurally invalid credentials -> 401 (no account probing)", async () => {
    const response = await postJson(`${baseUrl}/api/auth/login`, {
      email: "not-an-email",
      password: "wrong-password-1234",
    });
    assert(response.status === 401, `expected 401 got ${response.status}`);
    return "ok";
  });

  await check("login with valid format but no DB -> 503 (fail-closed, generic)", async () => {
    const response = await postJson(`${baseUrl}/api/auth/login`, {
      email: "nobody@example.test",
      password: "wrong-password-1234",
    });
    const body = await jsonResponse(response);
    assert(response.status === 503, `expected 503 got ${response.status}`);
    assert(body.ok === false, "expected ok:false");
    return "ok";
  });

  await check("/api/internal/review/drafts without token -> 401", async () => {
    const response = await postJson(`${baseUrl}/api/internal/review/drafts`, {});
    assert(response.status === 401, `expected 401 got ${response.status}`);
    return "ok";
  });

  await check("/api/internal/review/drafts with token but no DB -> 503 launch controls unavailable", async () => {
    const response = await postJson(`${baseUrl}/api/internal/review/drafts`, {}, { authorization: bearer });
    assert(response.status === 503, `expected 503 got ${response.status}`);
    return "ok";
  });

  await check("/api/internal/review/:case/:ver/release-decision with token but no DB -> 503", async () => {
    const response = await postJson(`${baseUrl}/api/internal/review/case-1/ver-1/release-decision`, {
      policyVersion: "v1",
      modelVersion: "v1",
      evidenceVersion: "v1",
      recipient: { algorithm: "sha256", digest: "a".repeat(64), bindingVersion: "v1" },
    }, { authorization: bearer });
    assert(response.status === 503, `expected 503 got ${response.status}`);
    return "ok";
  });

  await check("review mutation routes (approve/reject/supersede) lock down: 401 without, 503 fail-closed with token", async () => {
    for (const path of [
      "/api/internal/review/case-1/ver-1/approve",
      "/api/internal/review/case-1/ver-1/reject",
      "/api/internal/review/case-1/ver-1/supersede",
    ]) {
      const unauthenticated = await postJson(`${baseUrl}${path}`, {});
      assert(unauthenticated.status === 401, `${path} without token expected 401 got ${unauthenticated.status}`);
      const withToken = await postJson(`${baseUrl}${path}`, { reasonCode: "unsafe_content", highRiskAcknowledged: true }, { authorization: bearer });
      assert(withToken.status === 503, `${path} with token + no DB expected 503 got ${withToken.status}`);
    }
    return "ok";
  });

  await check("/api/internal-review (webhook) without token -> 401", async () => {
    const response = await postJson(`${baseUrl}/api/internal-review`, {});
    assert(response.status === 401, `expected 401 got ${response.status}`);
    return "ok";
  });

  await check("/api/internal-review invalid input with token -> 400", async () => {
    const response = await postJson(`${baseUrl}/api/internal-review`, { description: "missing fields matter" }, { authorization: bearer });
    assert(response.status === 400, `expected 400 got ${response.status}`);
    return "ok";
  });

  if (!(EXTERNAL || !webhook)) {
    await check("/api/internal-review valid input with token forwards to webhook (200)", async () => {
      const response = await postJson(`${baseUrl}/api/internal-review`, {
        caseId: "CASE-20260905-qa-e2e",
        customerName: "QA Harness Owner",
        customerEmail: "qa-customer@example.test",
        vehicleYear: "2012",
        make: "Ford",
        model: "F-150",
        symptomsSummary: "Engine running rough at highway speed",
        responseType: "interim_guidance",
        confidenceScore: "84",
        confidenceBand: "high",
        messageBody: "Replacement spark plugs are likely. Synthetic QA data only.",
        followUpNeeded: "no",
        adminNotes: "Generated by the beta E2E smoke harness.",
      }, { authorization: bearer });
      assert(response.status === 200, `expected 200 got ${response.status}`);
      const captured = webhook.received.filter((entry) => entry.body && entry.body.intakeType === "internal-diagnosis-response");
      assert(captured.length >= 1, "expected internal-review packet forwarded");
      assert(captured.some((entry) => entry.body.caseId === "CASE-20260905-qa-e2e"), "packet must carry the caseId");
      return "ok";
    });
  } else {
    await check("/api/internal-review forwarded packet inspection", async () => {
      throw new Error("no-op");
    }, { skipReason: "webhook stub not present in this mode" });
  }

  await check("/api/diagnoses/recent without token -> 401", async () => {
    const response = await get(`${baseUrl}/api/diagnoses/recent`);
    assert(response.status === 401, `expected 401 got ${response.status}`);
    return "ok";
  });

  await check("/api/diagnoses/recent with token returns reviewer-gated in-memory list", async () => {
    const response = await get(`${baseUrl}/api/diagnoses/recent`, { authorization: bearer });
    const body = await jsonResponse(response);
    assert(response.status === 200, `expected 200 got ${response.status}`);
    assert(Array.isArray(body), "expected an array");
    return "ok";
  });

  await check("follow-up with vibrationData -> 422 VIBRATION_CAPTURE_UNAVAILABLE before any DB lookup", async () => {
    const form = new FormData();
    form.append("vibrationData", JSON.stringify({ samples: [0.1, 0.2] }));
    form.append("additionalInfo", "still rough after repair");
    const response = await postMultipart(`${baseUrl}/api/diagnoses/some-case/follow-up`, form, { authorization: bearer });
    const body = await jsonResponse(response);
    assert(response.status === 422, `expected 422 got ${response.status}`);
    assert(body.code === "VIBRATION_CAPTURE_UNAVAILABLE", `unexpected code ${body.code}`);
    return "ok";
  });

  await check("path traversal on /api/files is rejected (404/403, not 200)", async () => {
    const traversal = encodeURIComponent("..%2F..%2Fpackage.json");
    const response = await get(`${baseUrl}/api/files/${traversal}`, { authorization: bearer });
    assert(response.status === 404 || response.status === 403, `expected 404/403 got ${response.status} (leak!)`);
    await response.text();
    return "status " + response.status;
  });

  await check("plain missing file on /api/files -> 404", async () => {
    const response = await get(`${baseUrl}/api/files/definitely-not-here.jpg`, { authorization: bearer });
    assert(response.status === 404, `expected 404 got ${response.status}`);
    return "ok";
  });

  // short-token server: fail-closed "not configured" state
  if (!EXTERNAL) {
    await check("configured-but-weak reviewer token -> 503 REVIEWER_ACCESS_NOT_CONFIGURED everywhere", async () => {
      const weakPort = await findFreePort();
      const weak = spawnDrivableServer({
        port: weakPort,
        env: {
          DRIVABLE_REVIEWER_TOKEN: "weak-token",
          DRIVABLE_SESSION_SECRET: SESSION_SECRET,
          DRIVABLE_BETA_INVITE_CODE: BETA_INVITE,
          DRIVABLE_LAUNCH_CONTROLS_ENABLED: "true",
          NODE_ENV: "production",
        },
      });
      runners.push(weak);
      const weakUrl = `http://127.0.0.1:${weakPort}`;
      await waitForHttp(`${weakUrl}/api/health/live`);
      const response = await get(`${weakUrl}/api/health/readiness`, { authorization: "Bearer weak-token" });
      const body = await jsonResponse(response);
      assert(response.status === 503, `expected 503 got ${response.status}`);
      assert(body.code === "REVIEWER_ACCESS_NOT_CONFIGURED", `expected REVIEWER_ACCESS_NOT_CONFIGURED got ${body.code}`);
      return "ok";
    });
  }

  // ------------------------------------------------------- MARKETPLACE / CSA
  section("CLEARSALE / MARKETPLACE — webhook-forwarded happy paths, rate limiting, log hygiene");

  if (!webhook) {
    await check("marketplace webhook flows (auto mode)", async () => {
      throw new Error("no-op");
    }, { skipReason: "webhook stub required" });
  } else {
    await check("seller intake happy path forwards complete payload (200)", async () => {
      const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, marketplaceSellerBody());
      const body = await jsonResponse(response);
      assert(response.status === 200, `expected 200 got ${response.status}`);
      assert(body.ok === true && body.received === true, "expected ok:true received:true");
      const captured = webhook.received.filter((entry) => entry.body && (entry.body.intakeType === "marketplace-seller" || entry.body.intakeType === "marketplace-seller-intake"));
      const packet = captured.find((entry) => entry.body.sellerName === "PiiSellerNameAlpha123");
      assert(packet, "seller packet must reach the webhook");
      assert(packet.body.sellerName === "PiiSellerNameAlpha123", "packet must carry the seller identity (to webhook, not logs)");
      assert(packet.body.acknowledgments?.ownerAuthorized === true, "acknowledgment missing");
      return "ok";
    });

    await check("buyer interest happy path forwards payload (200)", async () => {
      const response = await postJson(`${baseUrl}/api/marketplace/buyer-interest`, marketplaceBuyerBody());
      const body = await jsonResponse(response);
      assert(response.status === 200, `expected 200 got ${response.status}`);
      const captured = webhook.received.filter((entry) => entry.body && (entry.body.intakeType === "marketplace-buyer" || entry.body.intakeType === "marketplace-buyer-interest"));
      const packet = captured.find((entry) => entry.body.buyerName === "PiiBuyerNameEcho234");
      assert(packet, "buyer packet must reach the webhook");
      assert(packet.body.buyerName === "PiiBuyerNameEcho234", "packet must carry buyer identity");
      return "ok";
    });

    await check("seller intake missing required fields -> 400", async () => {
      const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, { sellerName: "x" });
      assert(response.status === 400, `expected 400 got ${response.status}`);
      return "ok";
    });

    await check("origin enforcement: disallowed Origin on a public POST gets no ACAO header (browser blocks)", async () => {
      const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, marketplaceSellerBody(), { origin: "https://evil.example.test" });
      assert(!response.headers.get("access-control-allow-origin"), "disallowed origin must not be echoed");
      assert(response.headers.get("vary")?.toLowerCase().includes("origin"), "expected Vary: Origin");
      assert(response.status === 200, `request itself may complete server-side; got ${response.status}`);
      return "ok";
    });

    await check("webhook outage -> 502 (master intake awaited, truthful failure)", async () => {
      webhook.setFailAlways(true);
      try {
        const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, marketplaceSellerBody());
        const body = await jsonResponse(response);
        assert(response.status === 502, `expected 502 got ${response.status}`);
        assert(body.ok === false, "expected ok:false on webhook failure");
      } finally {
        webhook.setFailAlways(false);
      }
      return "ok";
    });

    await check("receipt semantics: non-POST methods on marketplace POST-only routes -> 404 (no silent acceptance)", async () => {
    const target = `${baseUrl}/api/marketplace/seller-intake`;
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const response = await fetch(target, { method, signal: AbortSignal.timeout(GLOBAL_TIMEOUT_MS) });
      assert(response.status === 404, `${method} expected 404 got ${response.status}`);
      await response.text();
    }
    return "ok";
  });

    await check("marketplace public-form rate limit trips at 15/10min and returns RATE_LIMITED", async () => {
      let limited = false;
      for (let index = 0; index < 17; index += 1) {
        const response = await postJson(`${baseUrl}/api/marketplace/seller-intake`, marketplaceSellerBody());
        if (response.status === 429) {
          limited = true;
          const body = await jsonResponse(response);
          assert(body.code === "RATE_LIMITED", `unexpected code ${body.code}`);
          assert(response.headers.get("retry-after"), "expected Retry-After header");
          break;
        }
        await response.text();
      }
      assert(limited, "rate limiter never returned 429 in 17 attempts");
      return "429 reached";
    });

    await check("no PII in server stdout during marketplace flows", async () => {
      const output = runners[0].combinedOutput;
      for (const needle of [
        "PiiSellerNameAlpha123",
        "seller-191919@example.test",
        "555-019-1919",
        "PiiBuyerNameEcho234",
        "buyer-292929@example.test",
        "555-019-2929",
        "Anytown",
      ]) {
        assert(!output.includes(needle), `stdout contains PII: ${needle}`);
      }
      return "stdout clean";
    });
  }

  // ------------------------------------------------------------- STATIC SWEEP
  section("REPO HYGIENE — hardcoded URLs, old domains, unwired mock endpoints");

  await check("client source has no onrender.com or old lifeos.living URLs", async () => {
    const clientSrc = path.join(REPO_ROOT, "client", "src");
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
          const content = readFileSync(full, "utf8");
          if (/onrender\.com|lifeos\.living/i.test(content)) offenders.push(full);
        }
      }
    };
    walk(clientSrc);
    assert(offenders.length === 0, `hardcoded production URLs remain: ${offenders.join(", ")}`);
    return "clean";
  });

  await check("server source keeps only allowlisted production URL references", async () => {
    const lib = path.join(REPO_ROOT, "server");
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.ts$/.test(entry.name)) {
          const content = readFileSync(full, "utf8");
          const matches = content.match(/https?:\/\/[^"\s)]+/g) || [];
          for (const url of matches) {
            if (/onrender\.com|lifeos\.living|localhost:/i.test(url) && !content.includes(`"${url}"`) && !content.includes(`'${url}'`)) {
              offenders.push(`${full} -> ${url}`);
            }
          }
        }
      }
    };
    walk(lib);
    // Allowlist: dev vite proxy host + the single legacy CORS origin constant.
    const allowedValues = ["http://localhost:5000", "https://mechaniceye.onrender.com"];
    const real = offenders.filter((entry) => !allowedValues.some((value) => entry.includes(value)));
    assert(real.length === 0, `unexpected URL references: ${real.join(", ")}`);
    return "clean";
  });

  await check("client copy no longer promises audio/video/vibration capture inputs that the photo-first intake rejects", async () => {
    const testBackend = path.join(REPO_ROOT, "client", "src", "TestBackend.tsx");
    const content = readFileSync(testBackend, "utf8");
    const forbidden = [
      "Capture symptoms, timing, sounds, photos, video, and more",
      "Photos, audio, video, and vibration inputs",
      "Sound, video, or photos if safe to collect",
      "photos, video, sound, vibration/motion context, and a clear symptom description",
      "Photos, sounds, videos, and vibration clues all help",
    ];
    const hits = forbidden.filter((phrase) => content.includes(phrase));
    assert(hits.length === 0, `customer-facing copy still claims unsupported media capture: ${hits.join(" | ")}`);
    return "photo-first copy consistent";
  });

  await check("buyer-interest form ships no pipelined sample/default listing title", async () => {
    const marketplace = path.join(REPO_ROOT, "client", "src", "marketplace", "Marketplace.tsx");
    const content = readFileSync(marketplace, "utf8");
    assert(!content.includes('defaultValue="2012 Ford F-150 XLT"'), "sample listing title baked into the required buyer-interest field");
    return "clean";
  });

  // ------------------------------------------------------------------ REPORT
  console.log("");
  console.log("=".repeat(72));
  console.log("BETA E2E SMOKE SUMMARY");
  console.log("=".repeat(72));
  for (const result of results) {
    console.log(`  [${result.status.toUpperCase().padEnd(4)}] ${result.section} :: ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
  }
  console.log("-".repeat(72));
  console.log(`checks: ${checked}  passed: ${passed}  failed: ${failed}  skipped: ${skipped}`);

  for (const runner of runners) {
    await stopProcess(runner);
  }
  if (s3stub) await s3stub.close().catch(() => undefined);
  if (webhook) await webhook.close().catch(() => undefined);

  if (failed > 0) {
    console.log("\nRESULT: FAIL");
    process.exitCode = 1;
  } else {
    console.log("\nRESULT: PASS");
  }
}

main().catch((error) => {
  console.error("\nBETA E2E SMOKE ERROR:", error);
  process.exitCode = 1;
});