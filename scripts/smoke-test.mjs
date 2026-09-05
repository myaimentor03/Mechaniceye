import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const serverEntry = path.join(repoRoot, "dist", "server", "index.js");
const port = 5099;
const baseUrl = `http://127.0.0.1:${port}`;

function startServer() {
  const child = spawn("node", [serverEntry], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logs = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => { logs.stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs.stderr += chunk.toString(); });

  return { child, logs };
}

async function waitForServer(timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (error) {
    return { ok: false, status: 0, bodyText: `FETCH_ERROR: ${error.message}` };
  }
  const bodyText = await res.text();
  return { ok: res.ok, status: res.status, bodyText, headers: res.headers };
}

function summarize(name, result, expectedStatus) {
  const passed = result.status === expectedStatus;
  console.log(`${passed ? "PASS" : "FAIL"} ${name} (status=${result.status}, expected=${expectedStatus})`);
  if (!passed) {
    console.log(result.bodyText.slice(0, 500));
  }
  return passed;
}

const results = [];
const { child, logs } = startServer();

try {
  const up = await waitForServer();
  if (!up) {
    console.log("FAIL server did not become healthy in time");
    console.log("STDOUT:", logs.stdout.slice(0, 500));
    console.log("STDERR:", logs.stderr.slice(0, 500));
    process.exitCode = 1;
  } else {
    console.log("PASS server started and /api/health responded");

    const dbHealth = await request(`${baseUrl}/api/health/db`);
    results.push(summarize("/api/health/db returns 503 gracefully without DATABASE_URL", dbHealth, 503));

    const diagnosis = await request(`${baseUrl}/api/diagnoses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problemCategory: "Noise / rattle / knock / squeal",
        description: "Vehicle: 2014 Ford Focus | Engine: N/A | Mileage: 90000 | Transmission: Manual | Drivetrain: FWD\nActivityIssue\nWarning lights\nCustomer symptom description:\nRattling at cold start, worse in the morning.",
        vehicleInfo: "2014 Ford Focus | Engine: N/A | Mileage: 90000 | Transmission: Manual | Drivetrain: FWD",
        clientRequestId: "smoke-test-0001",
        timing: "Cold Start"
      })
    });
    results.push(summarize("POST /api/diagnoses returns case receipt 200", diagnosis, 200));

    if (diagnosis.status === 200) {
      try {
        const parsed = JSON.parse(diagnosis.bodyText);
        console.log(`    case id=${parsed.id} status=${parsed.status}`);
      } catch {
        console.log("    WARN: response body was not JSON");
      }
    }

    const spa = await request(`${baseUrl}/buyer-check`);
    const spaPassed = spa.status === 200 && spa.headers.get("content-type")?.includes("text/html");
    console.log(`${spaPassed ? "PASS" : "FAIL"} SPA fallback serves index.html for deep link /buyer-check (status=${spa.status}, contentType=${spa.headers.get("content-type") || "n/a"})`);
    results.push(spaPassed);

    const traversal = await request(`${baseUrl}/api/files/..%2F..%2Fdist%2Fserver%2Findex.js`);
    const traversalPassed = traversal.status === 403 || traversal.status === 404;
    console.log(`${traversalPassed ? "PASS" : "FAIL"} /api/files blocks path traversal (status=${traversal.status})`);
    results.push(traversalPassed);

    const unknownRoute = await request(`${baseUrl}/api/does-not-exist`);
    console.log(`${unknownRoute.status === 404 ? "PASS" : "FAIL"} unknown API route returns 404 (status=${unknownRoute.status})`);
    results.push(unknownRoute.status === 404);

    const sellerIntake = await request(`${baseUrl}/api/marketplace/seller-intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerName: "Smoke Test",
        sellerEmail: "smoke@example.com",
        sellerPhone: "5551234567",
        city: "Bakersfield",
        state: "CA",
        zip: "93301",
        vehicleYear: "2014",
        make: "Ford",
        model: "Focus",
        mileage: "90000",
        askingPrice: "5000",
        titleStatus: "Clean title",
        runsAndDrives: "Runs and drives",
        knownIssues: "None disclosed",
        listingType: "as-is",
        acknowledgments: {
          ownerAuthorized: true,
          platformOnly: true,
          sellerResponsibilities: true,
          noGuarantee: true
        }
      })
    });
    if (sellerIntake.status === 200) {
      const parsed = JSON.parse(sellerIntake.bodyText);
      console.log(`    seller intake received=${parsed.received} webhookConfigured=${parsed.webhookConfigured}`);
    }
    results.push(summarize("POST /api/marketplace/seller-intake returns receipt 200", sellerIntake, 200));

    const concierge = await request(`${baseUrl}/api/support/concierge-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guideRequested: "yes",
        helpTopic: "Noise at start",
        customerName: "Smoke Test",
        customerEmail: "smoke@example.com",
        currentPage: "/start",
        urgency: "normal",
        preferredContactMethod: "email",
        message: "I need help routing my request.",
        wantsHumanReview: "yes",
        acknowledgments: { aiAssistedGuide: true, finalVerification: true }
      })
    });
    console.log(`INFO concierge-request status=${concierge.status}`);
    results.push(concierge.status === 200 || concierge.status === 400);
  }
} finally {
  child.kill("SIGKILL");
}

const failed = results.filter((value) => !value).length;
console.log(`SMOKE_RESULT: ${results.length - failed}/${results.length} checks passed`);

if (failed > 0) {
  process.exitCode = 1;
}