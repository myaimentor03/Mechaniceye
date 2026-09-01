import fs from "fs";
import path from "path";

export type IncomingDiagnosisCase = {
  description: string;
  vehicleInfo: string;
  timing?: string;
  unsupportedVehicle?: boolean;
  manualVehicleEntryUsed?: boolean;
  rawVehicleSelection?: unknown;
  vibrationData?: unknown;
};

export type StoredDiagnosisCase = IncomingDiagnosisCase & {
  id: string;
  status: "received";
  createdAt: string;
  caseFolder: string;
  files: {
    photos: string[];
    audio: string[];
    video: string[];
    vibration: string[];
  };
};

const operationsRoot = "C:\\MechanicsEye_Operations";
const casesRoot = path.join(operationsRoot, "Cases", "Open");
const trackerCsvPath = path.join(
  operationsRoot,
  "Command_Center",
  "ME_Case_Tracker.csv"
);
const trackerHeaders = [
  "AssignedReviewer",
  "CaseFolderPath",
  "CaseID",
  "CaseStatus",
  "ConfidenceBand",
  "ConfidenceReason",
  "ConfidenceScore",
  "CustomerComplaint",
  "CustomerEmail",
  "CustomerName",
  "DateReceived",
  "DiagnosisSentDate",
  "Engine",
  "FollowUpNeeded",
  "FollowUpStatus",
  "LastActionDate",
  "LastCustomerReplyDate",
  "MediaPresent",
  "MediaTypes",
  "Mileage",
  "Notes",
  "PaymentStatus",
  "PaymentTier",
  "Phone",
  "PrimarySuspectedCause",
  "PriorityLevel",
  "SymptomSummary",
  "TopFix1",
  "TopFix2",
  "TopFix3",
  "VehicleMake",
  "VehicleModel",
  "VehicleYear",
  "VIN",
  "WhatWouldIncreaseConfidence"
] as const;

type TrackerRow = Record<string, string>;

type ParsedCaseMetadata = {
  customerEmail: string;
  engine: string;
  mileage: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vin: string;
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function safeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
}

function csvEscape(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function extractLineValue(description: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = description.match(new RegExp(`^${escapedLabel}:\\s*(.*)$`, "mi"));
  return match?.[1]?.trim() || "";
}

function parseVehicleSelection(rawVehicleSelection: unknown) {
  if (!rawVehicleSelection || typeof rawVehicleSelection !== "object") {
    return {};
  }

  const selection = rawVehicleSelection as Record<string, unknown>;
  const pick = (key: string) => {
    const value = selection[key];
    return typeof value === "string" ? value.trim() : "";
  };

  const make = pick("make") === "Other Make" ? pick("manualMake") : pick("make");
  const model = pick("model") === "Other Model" ? pick("manualModel") : pick("model");
  const rawEngine = pick("engine");
  const engine =
    rawEngine === "Other Engine" || rawEngine === "Unknown Engine"
      ? pick("manualEngine")
      : rawEngine;

  return {
    vehicleYear: pick("year"),
    vehicleMake: make,
    vehicleModel: model,
    engine,
  };
}

function parseCaseMetadata(input: IncomingDiagnosisCase): ParsedCaseMetadata {
  const fromSelection = parseVehicleSelection(input.rawVehicleSelection);
  const customerEmail = extractLineValue(input.description, "Customer Email");
  const mileageFromDescription = extractLineValue(input.description, "Mileage");
  const vin = extractLineValue(input.description, "VIN");

  return {
    customerEmail: customerEmail === "Not provided" ? "" : customerEmail,
    engine: fromSelection.engine || "",
    mileage: mileageFromDescription === "Not provided" ? "" : mileageFromDescription,
    vehicleMake: fromSelection.vehicleMake || "",
    vehicleModel: fromSelection.vehicleModel || "",
    vehicleYear: fromSelection.vehicleYear || "",
    vin: vin === "Not provided" ? "" : vin,
  };
}

function ensureTrackerCsvExists() {
  ensureDir(path.dirname(trackerCsvPath));

  if (!fs.existsSync(trackerCsvPath)) {
    fs.writeFileSync(trackerCsvPath, `${trackerHeaders.join(",")}\n`, "utf8");
  }
}

function appendTrackerRow(row: TrackerRow) {
  ensureTrackerCsvExists();
  const csv = fs.readFileSync(trackerCsvPath, "utf8");
  const headerLine = csv.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, "");
  const headers = parseCsvLine(headerLine).map((header) => header.trim()).filter(Boolean);

  if (headers.length === 0) {
    throw new Error(`Tracker CSV has no header row: ${trackerCsvPath}`);
  }

  const csvLine = headers.map((header) => csvEscape(row[header] || "")).join(",");
  fs.appendFileSync(trackerCsvPath, `${csvLine}\n`, "utf8");
}

function buildTrackerRow(
  stored: StoredDiagnosisCase,
  metadata: ParsedCaseMetadata
): TrackerRow {
  const timestamp = stored.createdAt;
  const hasKnownMedia = Boolean(stored.vibrationData);
  const mediaTypes = stored.vibrationData ? "vibration" : "";

  return {
    AssignedReviewer: "",
    CaseFolderPath: stored.caseFolder,
    CaseID: stored.id,
    CaseStatus: "NEW",
    ConfidenceBand: "",
    ConfidenceReason: "",
    ConfidenceScore: "",
    CustomerComplaint: stored.description,
    CustomerEmail: metadata.customerEmail,
    CustomerName: "",
    DateReceived: timestamp,
    DiagnosisSentDate: "",
    Engine: metadata.engine,
    FollowUpNeeded: "No",
    FollowUpStatus: "New intake received",
    LastActionDate: timestamp,
    LastCustomerReplyDate: "",
    MediaPresent: hasKnownMedia ? "Yes" : "No",
    MediaTypes: mediaTypes,
    Mileage: metadata.mileage,
    Notes: "App intake created case automatically",
    PaymentStatus: "Unverified",
    PaymentTier: "Unknown",
    Phone: "",
    PrimarySuspectedCause: "",
    PriorityLevel: "Normal",
    SymptomSummary: stored.description,
    TopFix1: "",
    TopFix2: "",
    TopFix3: "",
    VehicleMake: metadata.vehicleMake,
    VehicleModel: metadata.vehicleModel,
    VehicleYear: metadata.vehicleYear,
    VIN: metadata.vin,
    WhatWouldIncreaseConfidence: ""
  };
}

export function generateCaseId(seed?: string) {
  if (seed && typeof seed === "string") {
    const normalized = seed.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);

    if (normalized.length >= 8) {
      return `CASE-${normalized}`;
    }
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 17);
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `CASE-${stamp}-${rand}`;
}

export function createStoredDiagnosisCase(input: IncomingDiagnosisCase, clientRequestId?: string): StoredDiagnosisCase {
  ensureDir(casesRoot);

  const id = generateCaseId(clientRequestId);
  const caseFolder = path.join(casesRoot, safeFileName(id));
  ensureDir(caseFolder);

  const stored: StoredDiagnosisCase = {
    ...input,
    id,
    status: "received",
    createdAt: new Date().toISOString(),
    caseFolder,
    files: {
      photos: [],
      audio: [],
      video: [],
      vibration: []
    }
  };
  const metadata = parseCaseMetadata(input);

  const summary = [
    `Case ID: ${stored.id}`,
    `Created At: ${stored.createdAt}`,
    `Status: ${stored.status}`,
    "",
    `Vehicle Info: ${stored.vehicleInfo || "N/A"}`,
    `Timing: ${stored.timing || "N/A"}`,
    `Unsupported Vehicle: ${stored.unsupportedVehicle ? "Yes" : "No"}`,
    `Manual Vehicle Entry Used: ${stored.manualVehicleEntryUsed ? "Yes" : "No"}`,
    "",
    "Description:",
    stored.description || "N/A",
    "",
    "Raw Vehicle Selection:",
    JSON.stringify(stored.rawVehicleSelection ?? {}, null, 2)
  ].join("\n");

  fs.writeFileSync(
    path.join(caseFolder, "case.json"),
    JSON.stringify(stored, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    path.join(caseFolder, "summary.txt"),
    summary,
    "utf8"
  );

  appendTrackerRow(buildTrackerRow(stored, metadata));

  return stored;
}
