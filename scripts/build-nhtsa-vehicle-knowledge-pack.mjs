import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

function arg(name, fallback = null) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const year = Number(arg("year"));
const make = arg("make");
const model = arg("model");
const apply = process.argv.includes("--apply");

if (!year || !make || !model) {
  throw new Error("Usage: npm run nhtsa:pack -- --year 2014 --make Ford --model Focus");
}

const root = process.cwd();
const outDir = path.join(root, "data", "nhtsa", "vehicle-knowledge-packs");
fs.mkdirSync(outDir, { recursive: true });

const vehicleKey = `${year}_${make}_${model}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const packId = `nhtsa_${vehicleKey}`;

function nhtsaUrl(endpoint, params) {
  const url = new URL(`https://api.nhtsa.gov/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(label, url, options = {}) {
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 1500;
  const optional = options.optional ?? false;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching ${label}, attempt ${attempt}/${retries}: ${url.toString()}`);

      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "Drivable-by-Mechanics-Eye/0.1"
        }
      });

      if (!response.ok) {
        throw new Error(`${label} request failed: ${response.status} ${response.statusText}`);
      }

      return {
        ok: true,
        label,
        data: await response.json(),
        error: null
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (attempt < retries) {
        console.warn(`${label} failed: ${message}. Retrying...`);
        await sleep(retryDelayMs * attempt);
        continue;
      }

      if (optional) {
        console.warn(`${label} unavailable after ${retries} attempts. Continuing without it.`);
        return {
          ok: false,
          label,
          data: { results: [] },
          error: message
        };
      }

      throw error;
    }
  }

  return {
    ok: false,
    label,
    data: { results: [] },
    error: "Unknown fetch failure"
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function safeLower(value) {
  return String(value ?? "").toLowerCase();
}

function inferRiskTags({ recalls, complaints }) {
  const text = [
    ...recalls.map((item) => `${item.Component ?? ""} ${item.Summary ?? ""} ${item.Consequence ?? ""}`),
    ...complaints.map((item) => `${item.components ?? item.Component ?? ""} ${item.summary ?? item.Summary ?? ""}`)
  ].join(" ").toLowerCase();

  const tags = [];

  if (text.match(/brake|abs|hydraulic/)) tags.push("brake_or_abs_risk");
  if (text.match(/air bag|airbag|srs/)) tags.push("airbag_or_srs_risk");
  if (text.match(/steer|steering/)) tags.push("steering_risk");
  if (text.match(/engine|stall|stalled|stalls|fire|smoke/)) tags.push("engine_or_fire_risk");
  if (text.match(/transmission|power train|powertrain|shift|clutch/)) tags.push("powertrain_risk");
  if (text.match(/electrical|battery|wiring|alternator|starter/)) tags.push("electrical_risk");
  if (text.match(/fuel|gasoline|diesel|leak/)) tags.push("fuel_or_leak_risk");
  if (text.match(/suspension|control arm|ball joint|wheel/)) tags.push("suspension_or_wheel_risk");
  if (recalls.length > 0) tags.push("recall_history_present");
  if (complaints.length >= 25) tags.push("high_complaint_volume");
  if (complaints.length >= 100) tags.push("very_high_complaint_volume");

  return unique(tags);
}

function componentSummary(recalls, complaints) {
  const recallComponents = recalls.map((item) => item.Component);
  const complaintComponents = complaints.map((item) => item.components ?? item.Component);
  return unique([...recallComponents, ...complaintComponents]).slice(0, 20);
}

function buildBuyerQuestions(riskTags, components) {
  const questions = [
    "Can the seller provide the VIN so recalls can be checked at VIN level?",
    "Can the seller provide repair records for known issues, warning lights, or prior safety repairs?",
    "Can the seller provide a cold-start video and dashboard warning-light photo?",
    "Can the seller provide a short safe driving video showing idle, acceleration, braking, and shifting?"
  ];

  if (riskTags.includes("powertrain_risk")) {
    questions.push("Has the transmission, clutch, or powertrain ever been repaired, replaced, reprogrammed, or diagnosed?");
  }

  if (riskTags.includes("brake_or_abs_risk")) {
    questions.push("Are there any brake, ABS, traction-control, vibration, pulling, or soft-pedal symptoms?");
  }

  if (riskTags.includes("airbag_or_srs_risk")) {
    questions.push("Is the airbag/SRS light on, and has the vehicle ever had crash, flood, or seat-belt/airbag repairs?");
  }

  if (riskTags.includes("engine_or_fire_risk")) {
    questions.push("Are there any overheating, smoke, burning odor, stalling, misfire, oil-pressure, or coolant-loss symptoms?");
  }

  if (components.length) {
    questions.push(`Can the seller address these NHTSA component areas: ${components.slice(0, 6).join(", ")}?`);
  }

  return unique(questions);
}

function buildSellerEvidenceRequests(riskTags) {
  const requests = [
    "VIN for official recall lookup",
    "title status and seller identity confirmation",
    "dashboard photo with key on/engine running when safe",
    "recent scan report if warning lights are present",
    "repair invoices or inspection records related to disclosed issues"
  ];

  if (riskTags.includes("recall_history_present")) {
    requests.push("proof that any applicable recall repairs were completed by VIN");
  }

  if (riskTags.includes("powertrain_risk")) {
    requests.push("transmission or powertrain repair records and safe shifting video");
  }

  if (riskTags.includes("brake_or_abs_risk")) {
    requests.push("brake inspection records and safe brake-pedal/ABS disclosure");
  }

  return unique(requests);
}

function buildInspectionPrompts(riskTags) {
  const prompts = [
    "Treat NHTSA data as year/make/model context only until VIN-level confirmation is performed.",
    "Use independent inspection for safety, structural, title, emissions, and high-cost repair concerns.",
    "Do not rely on seller statements like 'easy fix' or 'just a sensor' without evidence."
  ];

  if (riskTags.includes("very_high_complaint_volume")) {
    prompts.push("Complaint volume is high enough to justify extra caution and more specific seller proof before visiting or paying.");
  }

  return unique(prompts);
}

const recallsUrl = nhtsaUrl("recalls/recallsByVehicle", {
  modelYear: year,
  make,
  model
});

const complaintsUrl = nhtsaUrl("complaints/complaintsByVehicle", {
  modelYear: year,
  make,
  model
});

const recallResult = await fetchJson("recalls", recallsUrl, {
  retries: 3,
  retryDelayMs: 1500,
  optional: true
});

const complaintResult = await fetchJson("complaints", complaintsUrl, {
  retries: 4,
  retryDelayMs: 2000,
  optional: true
});

const recallJson = recallResult.data;
const complaintJson = complaintResult.data;

const recalls = Array.isArray(recallJson.results) ? recallJson.results : [];
const complaints = Array.isArray(complaintJson.results) ? complaintJson.results : [];

const fetchErrors = [
  recallResult.error ? { source: "recalls", error: recallResult.error } : null,
  complaintResult.error ? { source: "complaints", error: complaintResult.error } : null
].filter(Boolean);

const components = componentSummary(recalls, complaints);
const riskTags = inferRiskTags({ recalls, complaints });
const buyerQuestions = buildBuyerQuestions(riskTags, components);
const sellerEvidenceRequests = buildSellerEvidenceRequests(riskTags);
const inspectionPrompts = buildInspectionPrompts(riskTags);

const summary = `${year} ${make} ${model}: NHTSA context found ${recalls.length} recall records and ${complaints.length} complaint records. This is year/make/model context only; VIN-level confirmation is required for recall applicability.`;

const pack = {
  packId,
  vehicleYear: year,
  vehicleMake: make,
  vehicleModel: model,
  source: "NHTSA",
  sourceType: "recalls_and_complaints",
  summary,
  riskTags,
  buyerQuestions,
  sellerEvidenceRequests,
  inspectionPrompts,
  confidence: recalls.length || complaints.length ? "medium" : "low",
  vinRequiredForApplicability: true,
  raw: {
    fetchedAt: new Date().toISOString(),
    sourceUrls: {
      recalls: recallsUrl.toString(),
      complaints: complaintsUrl.toString()
    },
    recallCount: recalls.length,
    complaintCount: complaints.length,
    fetchErrors,
    components,
    recalls,
    complaints
  }
};

const outFile = path.join(outDir, `${packId}.json`);
fs.writeFileSync(outFile, JSON.stringify(pack, null, 2) + "\n");

console.log("");
console.log(`NHTSA Drivable pack written: ${outFile}`);
console.log(summary);
console.log(`Risk tags: ${riskTags.join(", ") || "none"}`);
console.log(`Buyer questions: ${buyerQuestions.length}`);
console.log(`Seller evidence requests: ${sellerEvidenceRequests.length}`);

if (!apply) {
  console.log("");
  console.log("DRY RUN ONLY - not inserted into database.");
  console.log("Add --apply to insert/update drivable_vehicle_knowledge_packs.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Set it before using --apply.");
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

try {
  await client.query(
    `
    INSERT INTO drivable_vehicle_knowledge_packs (
      pack_id,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      source,
      source_type,
      summary,
      risk_tags,
      buyer_questions,
      seller_evidence_requests,
      inspection_prompts,
      confidence,
      vin_required_for_applicability,
      raw
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (pack_id) DO UPDATE SET
      vehicle_year = EXCLUDED.vehicle_year,
      vehicle_make = EXCLUDED.vehicle_make,
      vehicle_model = EXCLUDED.vehicle_model,
      source = EXCLUDED.source,
      source_type = EXCLUDED.source_type,
      summary = EXCLUDED.summary,
      risk_tags = EXCLUDED.risk_tags,
      buyer_questions = EXCLUDED.buyer_questions,
      seller_evidence_requests = EXCLUDED.seller_evidence_requests,
      inspection_prompts = EXCLUDED.inspection_prompts,
      confidence = EXCLUDED.confidence,
      vin_required_for_applicability = EXCLUDED.vin_required_for_applicability,
      raw = EXCLUDED.raw
    `,
    [
      pack.packId,
      pack.vehicleYear,
      pack.vehicleMake,
      pack.vehicleModel,
      pack.source,
      pack.sourceType,
      pack.summary,
      JSON.stringify(pack.riskTags),
      JSON.stringify(pack.buyerQuestions),
      JSON.stringify(pack.sellerEvidenceRequests),
      JSON.stringify(pack.inspectionPrompts),
      pack.confidence,
      pack.vinRequiredForApplicability,
      JSON.stringify(pack.raw)
    ]
  );

  console.log("");
  console.log("Inserted/updated NHTSA vehicle knowledge pack in database.");
} finally {
  await client.end();
}
