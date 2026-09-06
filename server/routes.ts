 import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
// local fallback validation while DB/schema layer is disabled
const consultationFeedbackSchema = {
  parse(input: any) {
    return {
      politenessRating: Number(input.politenessRating || 0),
      effectivenessRating: Number(input.effectivenessRating || 0),
      easeOfWorkRating: Number(input.easeOfWorkRating || 0),
      wasFixed: !!input.wasFixed,
      feedback: input.feedback || ""
    };
  }
};
import { performEnhancedAnalysis } from "./enhanced-analysis";
import multer from "multer";
import path from "path";
import fs from "fs";
import pg from "pg";
import { createStoredDiagnosisCase, generateCaseId, type IncomingDiagnosisCase, type StoredDiagnosisCase } from "./case-storage";
import { checkDatabaseConnection } from "./db";

const { Client } = pg;
import { insertPublicDiagnosisCaseToDb } from "./public-case-db";
import {
  buildDrivableAiPayloadFields,
  type MockAiPayloadFields
} from "./mock-drivable-report";
import { drivableEvidenceIntakeSchema, type EvidenceAttachment } from "../shared/drivableEvidence";
import {
  ALLOWED_PHOTO_MEDIA_TYPES,
  PHOTO_LIMITS,
  createEvidenceStoreFromEnvironment,
} from "./evidence-storage";
import { requireReviewer } from "./reviewer-auth";
import { registerCustomerAuthRoutes, requireCustomer } from "./customer-auth";
import { applyAuthenticatedCaseIdentity, authenticatedCaseOwnerId } from "./case-identity";
import { createRateLimit } from "./rate-limit";
import { evaluateLaunchReadiness } from "./launch-readiness";
import { buildFollowUpEvidenceBoundary } from "./follow-up-evidence-boundary";
import { registerDurableReviewRoutes } from "./review/review-routes";
import { requireVerifiedLaunchControlRuntime } from "./review/launch-control-runtime";
import { IntakeConsentError, recordConsentRevocation, persistAndAuthorizeIntakeConsent } from "./consent/intake-consent";
import { requireAllowedOrigin } from "./origin-guard";
import { logEvent, logEventError } from "./observability/safe-log";
import { sslConfigForDatabaseUrl } from "./database-ssl";
import { fetchWebhookWithTimeout } from "./webhook-fetch";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a',
      'video/mp4', 'video/quicktime', 'video/x-msvideo'
    ];
    cb(null, allowedMimes.includes(file.mimetype));
  }
});

const diagnosisPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_LIMITS.maxBytesEach, files: PHOTO_LIMITS.maxCount },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_PHOTO_MEDIA_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported photo type: ${file.mimetype || "unknown"}`));
    }
    cb(null, true);
  },
});
const diagnosisPhotoUploadMiddleware = (req: any, res: any, next: any) => {
  diagnosisPhotoUpload.array("photos", PHOTO_LIMITS.maxCount)(req, res, (error: unknown) => {
    if (!error) return next();
    const isLimitError = error instanceof multer.MulterError;
    return res.status(isLimitError ? 413 : 415).json({
      message: isLimitError
        ? `Photo upload exceeds the limit of ${PHOTO_LIMITS.maxCount} files and 12 MB per file.`
        : "Photo upload was rejected because the file type is not supported.",
      persisted: false,
    });
  });
};
const evidenceStore = createEvidenceStoreFromEnvironment();

// Subscription tier features
const SUBSCRIPTION_FEATURES = {
  basic: {
    maxAnalyses: 5,
    features: ['description', 'photos', 'audio'],
    price: 14.99
  },
  premium: {
    maxAnalyses: 20,
    features: ['description', 'photos', 'audio', 'vibration'],
    price: 19.99
  },
  expert: {
    maxAnalyses: -1, // unlimited
    features: ['description', 'photos', 'audio', 'vibration', 'mechanic_consultation'],
    price: 24.99
  }
};

function checkSubscriptionAccess(userTier: string, feature: string): boolean {
  const tierFeatures = SUBSCRIPTION_FEATURES[userTier as keyof typeof SUBSCRIPTION_FEATURES];
  return tierFeatures ? tierFeatures.features.includes(feature) : false;
}

type DiagnosisCaseResponse = {
  id: string;
  status: "received";
  createdAt: string;
  vehicleInfo: string;
  description: string;
  timing: string;
  message: string;
  attachments?: EvidenceAttachment[];
  evidencePersistence?: {
    durability: "runtime_local" | "private_object_storage";
    durableStorageConfigured: boolean;
    analysisStatus: "uploaded_not_analyzed";
  };
  casePersistence?: {
    primary: "database" | "local_case_store";
    databaseMirror: "persisted" | "unavailable" | "not_attempted";
  };
};

type DiagnosisWebhookDebug = {
  webhookConfigured: boolean;
  webhookForwarded: boolean;
};

type DiagnosisApiResponse = DiagnosisCaseResponse & DiagnosisWebhookDebug;

type PublicCasePacket = {
  id: string;
  status: "received";
  createdAt: string;
  vehicleInfo: string;
  description: string;
  timing: string;
  customerEmail?: string;
  rawVehicleSelection?: unknown;
  photoEvidenceStatus?: string;
  audioEvidenceStatus?: string;
  videoEvidenceStatus?: string;
  vibrationEvidenceStatus?: string;
  photoFileNames?: string[];
  audioFileNames?: string[];
  videoFileNames?: string[];
  vibrationFileNames?: string[];
  attachments?: EvidenceAttachment[];
  photoAnalysisStatus?: "uploaded_not_analyzed";
  source: "public-render";
} & Partial<MockAiPayloadFields>;

type DiagnosisInput = IncomingDiagnosisCase & {
  source?: string;
  submittedAt?: string;
  submissionStatus?: string;
  reviewStatus?: string;
  name?: string;
  customerName?: string;
  email?: string;
  customerEmail?: string;
  phone?: string;
  customerPhone?: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  engine?: string;
  mileage?: string;
  symptomSummary?: string;
  whenItHappens?: string;
  canDrive?: string;
  urgency?: string;
  vibrationNotes?: string;
  soundNotes?: string;
  obdCodes?: string;
  repairHistory?: string;
  photoEvidenceStatus?: string;
  audioEvidenceStatus?: string;
  videoEvidenceStatus?: string;
  vibrationEvidenceStatus?: string;
  photoFileNames?: string[];
  audioFileNames?: string[];
  videoFileNames?: string[];
  vibrationFileNames?: string[];
  attachments?: EvidenceAttachment[];
};

const localOperationsRoot = "C:\\MechanicsEye_Operations";

function canUseLocalCaseStorage() {
  return process.platform === "win32" && fs.existsSync(localOperationsRoot);
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (Array.isArray(value)) {
      const joined = value
        .map((item) => (typeof item === "string" || typeof item === "number" ? String(item).trim() : ""))
        .filter(Boolean)
        .join(", ");

      if (joined) {
        return joined;
      }
    }
  }

  return "";
}

function parseJsonField(value: unknown, fieldName: string) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${fieldName} must contain valid JSON`);
  }
}

function normalizeDiagnosisBody(body: any) {
  if (!body || typeof body !== "object") return {};
  return {
    ...body,
    rawVehicleSelection: parseJsonField(body.rawVehicleSelection, "rawVehicleSelection"),
    unsupportedVehicle: body.unsupportedVehicle === true || body.unsupportedVehicle === "true",
    manualVehicleEntryUsed: body.manualVehicleEntryUsed === true || body.manualVehicleEntryUsed === "true",
  };
}

function pickVehicleSelectionString(rawVehicleSelection: unknown, key: string) {
  if (!rawVehicleSelection || typeof rawVehicleSelection !== "object") {
    return "";
  }

  const selection = rawVehicleSelection as Record<string, unknown>;
  return pickString(selection[key]);
}

function normalizeVehiclePart(value: string) {
  return /^(Other|Unknown)\s/i.test(value) ? "" : value;
}

function buildVehicleInfoFromParts(input: {
  rawVehicleSelection?: unknown;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  engine?: string;
}) {
  const vehicleYear = pickString(input.vehicleYear, pickVehicleSelectionString(input.rawVehicleSelection, "year"));
  const vehicleMake = pickString(
    input.vehicleMake,
    normalizeVehiclePart(pickVehicleSelectionString(input.rawVehicleSelection, "make")),
    pickVehicleSelectionString(input.rawVehicleSelection, "manualMake")
  );
  const vehicleModel = pickString(
    input.vehicleModel,
    normalizeVehiclePart(pickVehicleSelectionString(input.rawVehicleSelection, "model")),
    pickVehicleSelectionString(input.rawVehicleSelection, "manualModel")
  );
  const engine = pickString(
    input.engine,
    normalizeVehiclePart(pickVehicleSelectionString(input.rawVehicleSelection, "engine")),
    pickVehicleSelectionString(input.rawVehicleSelection, "manualEngine")
  );

  return [vehicleYear, vehicleMake, vehicleModel, engine].filter(Boolean).join(" ");
}

function buildDiagnosisInput(body: any): DiagnosisInput {
  const diagnosisBody = body || {};
  const pickStringArray = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  const rawVehicleSelection = diagnosisBody.rawVehicleSelection || null;
  const symptomSummary = pickString(diagnosisBody.symptomSummary, diagnosisBody.symptoms);
  const description = pickString(diagnosisBody.description, symptomSummary);
  const whenItHappens = pickString(diagnosisBody.whenItHappens);
  const timing = pickString(diagnosisBody.timing, whenItHappens);
  const vehicleYear = pickString(diagnosisBody.vehicleYear, pickVehicleSelectionString(rawVehicleSelection, "year"));
  const vehicleMake = pickString(
    diagnosisBody.vehicleMake,
    normalizeVehiclePart(pickVehicleSelectionString(rawVehicleSelection, "make")),
    pickVehicleSelectionString(rawVehicleSelection, "manualMake")
  );
  const vehicleModel = pickString(
    diagnosisBody.vehicleModel,
    normalizeVehiclePart(pickVehicleSelectionString(rawVehicleSelection, "model")),
    pickVehicleSelectionString(rawVehicleSelection, "manualModel")
  );
  const engine = pickString(
    diagnosisBody.engine,
    normalizeVehiclePart(pickVehicleSelectionString(rawVehicleSelection, "engine")),
    pickVehicleSelectionString(rawVehicleSelection, "manualEngine")
  );

  return {
    source: pickString(diagnosisBody.source),
    submittedAt: pickString(diagnosisBody.submittedAt),
    submissionStatus: pickString(diagnosisBody.submissionStatus),
    reviewStatus: pickString(diagnosisBody.reviewStatus),
    name: pickString(diagnosisBody.name, diagnosisBody.customerName),
    customerName: pickString(diagnosisBody.customerName, diagnosisBody.name),
    email: pickString(diagnosisBody.email, diagnosisBody.customerEmail),
    customerEmail: pickString(diagnosisBody.customerEmail, diagnosisBody.email),
    phone: pickString(diagnosisBody.phone, diagnosisBody.customerPhone),
    customerPhone: pickString(diagnosisBody.customerPhone, diagnosisBody.phone),
    vehicleYear,
    vehicleMake,
    vehicleModel,
    engine,
    mileage: pickString(diagnosisBody.mileage),
    symptomSummary,
    description,
    whenItHappens,
    timing,
    canDrive: pickString(diagnosisBody.canDrive),
    urgency: pickString(diagnosisBody.urgency),
    vibrationNotes: pickString(diagnosisBody.vibrationNotes),
    soundNotes: pickString(diagnosisBody.soundNotes),
    obdCodes: pickString(diagnosisBody.obdCodes),
    repairHistory: pickString(diagnosisBody.repairHistory),
    vehicleInfo: pickString(
      diagnosisBody.vehicleInfo,
      buildVehicleInfoFromParts({ rawVehicleSelection, vehicleYear, vehicleMake, vehicleModel, engine })
    ),
    unsupportedVehicle: !!diagnosisBody.unsupportedVehicle,
    manualVehicleEntryUsed: !!diagnosisBody.manualVehicleEntryUsed,
    rawVehicleSelection,
    vibrationData: diagnosisBody.vibrationData || null,
    photoEvidenceStatus: diagnosisBody.photoEvidenceStatus || "",
    audioEvidenceStatus: diagnosisBody.audioEvidenceStatus || "",
    videoEvidenceStatus: diagnosisBody.videoEvidenceStatus || "",
    vibrationEvidenceStatus: diagnosisBody.vibrationEvidenceStatus || "",
    photoFileNames: pickStringArray(diagnosisBody.photoFileNames),
    audioFileNames: pickStringArray(diagnosisBody.audioFileNames),
    videoFileNames: pickStringArray(diagnosisBody.videoFileNames),
    vibrationFileNames: pickStringArray(diagnosisBody.vibrationFileNames)
  };
}

function extractCustomerEmail(description: string) {
  const match = description.match(/^Customer Email:\s*(.+)$/im);
  const email = match?.[1]?.trim();

  if (!email || email === "Not provided") {
    return "";
  }

  return email;
}

function buildDiagnosisResponse(
  diagnosisCase: Pick<StoredDiagnosisCase, "id" | "status" | "createdAt" | "vehicleInfo" | "description" | "timing">
): DiagnosisCaseResponse {
  return {
    id: diagnosisCase.id,
    status: "received",
    createdAt: diagnosisCase.createdAt,
    vehicleInfo: diagnosisCase.vehicleInfo,
    description: diagnosisCase.description,
    timing: diagnosisCase.timing || "",
    message: "Diagnosis case received successfully"
  };
}

function createPublicDiagnosisCase(input: IncomingDiagnosisCase): DiagnosisCaseResponse {
  const publicCase = {
    ...input,
    id: generateCaseId(),
    status: "received" as const,
    createdAt: new Date().toISOString()
  };

  return buildDiagnosisResponse(publicCase);
}

function buildPublicCasePacket(
  diagnosisCase: DiagnosisCaseResponse,
  input: DiagnosisInput
): PublicCasePacket {
  const customerEmail = input.customerEmail || extractCustomerEmail(input.description);
  const packet: PublicCasePacket = {
    id: diagnosisCase.id,
    status: diagnosisCase.status,
    createdAt: diagnosisCase.createdAt,
    vehicleInfo: diagnosisCase.vehicleInfo,
    description: diagnosisCase.description,
    timing: diagnosisCase.timing,
    source: "public-render",
    ...buildDrivableAiPayloadFields({
      reportType: "first_look_report",
      scenario: "current_problem",
      vehicleSummary: input.vehicleInfo,
      symptomSummary: [input.description, input.timing].filter(Boolean).join(" ")
    })
  };

  if (customerEmail) {
    packet.customerEmail = customerEmail;
  }

  if (input.rawVehicleSelection) {
    packet.rawVehicleSelection = input.rawVehicleSelection;
  }

  if (input.photoEvidenceStatus) {
    packet.photoEvidenceStatus = input.photoEvidenceStatus;
  }

  if (input.audioEvidenceStatus) {
    packet.audioEvidenceStatus = input.audioEvidenceStatus;
  }

  if (input.videoEvidenceStatus) {
    packet.videoEvidenceStatus = input.videoEvidenceStatus;
  }

  if (input.vibrationEvidenceStatus) {
    packet.vibrationEvidenceStatus = input.vibrationEvidenceStatus;
  }

  if (input.photoFileNames?.length) {
    packet.photoFileNames = input.photoFileNames;
  }

  if (input.attachments?.length) {
    packet.attachments = input.attachments;
    packet.photoAnalysisStatus = "uploaded_not_analyzed";
  }

  if (input.audioFileNames?.length) {
    packet.audioFileNames = input.audioFileNames;
  }

  if (input.videoFileNames?.length) {
    packet.videoFileNames = input.videoFileNames;
  }

  if (input.vibrationFileNames?.length) {
    packet.vibrationFileNames = input.vibrationFileNames;
  }

  return packet;
}

async function deliverPublicCaseNotification(
  diagnosisCase: DiagnosisCaseResponse,
  input: DiagnosisInput
) {
  const packet = buildPublicCasePacket(diagnosisCase, input);

  const webhookUrl = process.env.PUBLIC_CASE_WEBHOOK_URL;

  if (!webhookUrl) {
    return;
  }

  try {
    await fetchWebhookWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet)
    });
  } catch (webhookError) {
    logEventError("webhook.public_case_delivery_failed", webhookError);
  }
}

async function deliverDiagnosisWebhook(
  diagnosisCase: DiagnosisCaseResponse,
  input: IncomingDiagnosisCase,
  storedCase?: StoredDiagnosisCase
) {
  const webhookUrl = process.env.MECHANIC_EYE_INTAKE_WEBHOOK_URL;

  if (!webhookUrl) {
    return;
  }

  try {
    await fetchWebhookWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "mechanics_eye_new_case",
        caseId: diagnosisCase.id,
        createdAt: diagnosisCase.createdAt,
        status: diagnosisCase.status,
        vehicleInfo: diagnosisCase.vehicleInfo,
        description: diagnosisCase.description,
        timing: diagnosisCase.timing,
        unsupportedVehicle: input.unsupportedVehicle,
        manualVehicleEntryUsed: input.manualVehicleEntryUsed,
        caseFolder: storedCase?.caseFolder || null,
        caseJsonPath: storedCase ? path.join(storedCase.caseFolder, "case.json") : null,
        summaryPath: storedCase ? path.join(storedCase.caseFolder, "summary.txt") : null,
        rawVehicleSelection: input.rawVehicleSelection || null,
        ...buildDrivableAiPayloadFields({
          reportType: "first_look_report",
          scenario: "current_problem",
          vehicleSummary: diagnosisCase.vehicleInfo,
          symptomSummary: [
            diagnosisCase.description,
            diagnosisCase.timing
          ].filter(Boolean).join(" ")
        })
      })
    });
  } catch (webhookError) {
    logEventError("webhook.diagnosis_delivery_failed", webhookError);
  }
}

type MasterDiagnosisIntakePayload = {
  intakeType: "diagnosis";
  source: string;
  caseId: string;
  submissionStatus: string;
  reviewStatus: string;
  name: string;
  email: string;
  phone: string;
  vehicleInfo: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  engine: string;
  mileage: string;
  symptomSummary: string;
  description: string;
  timing: string;
  whenItHappens: string;
  canDrive: string;
  urgency: string;
  vibrationNotes: string;
  soundNotes: string;
  obdCodes: string;
  repairHistory: string;
  submittedAt: string;
};

function buildMasterDiagnosisIntakePayload(
  diagnosisCase: DiagnosisCaseResponse,
  input: DiagnosisInput
): MasterDiagnosisIntakePayload {
  const vehicleInfo = pickString(input.vehicleInfo, buildVehicleInfoFromParts(input));
  const description = pickString(input.description, input.symptomSummary);
  const timing = pickString(input.timing, input.whenItHappens);

  return {
    intakeType: "diagnosis",
    source: pickString(input.source, "getdrivable-public-diagnosis-intake"),
    caseId: pickString(diagnosisCase.id),
    submissionStatus: pickString(input.submissionStatus, "NEW_DIAGNOSIS_INTAKE"),
    reviewStatus: pickString(input.reviewStatus, "PENDING_REVIEW"),
    name: pickString(input.name, input.customerName),
    email: pickString(input.email, input.customerEmail, extractCustomerEmail(description)),
    phone: pickString(input.phone, input.customerPhone),
    vehicleInfo,
    vehicleYear: pickString(input.vehicleYear, pickVehicleSelectionString(input.rawVehicleSelection, "year")),
    vehicleMake: pickString(
      input.vehicleMake,
      normalizeVehiclePart(pickVehicleSelectionString(input.rawVehicleSelection, "make")),
      pickVehicleSelectionString(input.rawVehicleSelection, "manualMake")
    ),
    vehicleModel: pickString(
      input.vehicleModel,
      normalizeVehiclePart(pickVehicleSelectionString(input.rawVehicleSelection, "model")),
      pickVehicleSelectionString(input.rawVehicleSelection, "manualModel")
    ),
    engine: pickString(
      input.engine,
      normalizeVehiclePart(pickVehicleSelectionString(input.rawVehicleSelection, "engine")),
      pickVehicleSelectionString(input.rawVehicleSelection, "manualEngine")
    ),
    mileage: pickString(input.mileage),
    symptomSummary: pickString(input.symptomSummary, description),
    description,
    timing,
    whenItHappens: pickString(input.whenItHappens, timing),
    canDrive: pickString(input.canDrive),
    urgency: pickString(input.urgency),
    vibrationNotes: pickString(input.vibrationNotes),
    soundNotes: pickString(input.soundNotes),
    obdCodes: pickString(input.obdCodes),
    repairHistory: pickString(input.repairHistory),
    submittedAt: pickString(input.submittedAt, diagnosisCase.createdAt, new Date().toISOString())
  };
}

async function forwardMasterDiagnosisIntakeWebhook(
  diagnosisCase: DiagnosisCaseResponse,
  input: DiagnosisInput
): Promise<DiagnosisWebhookDebug> {
  const webhookUrl = process.env.MASTER_INTAKE_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return { webhookConfigured: false, webhookForwarded: false };
  }

  try {
    const response = await fetchWebhookWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildMasterDiagnosisIntakePayload(diagnosisCase, input)),
    });

    if (!response.ok) {
      logEventError("webhook.master_intake_forward_rejected", undefined, {
        diagnosisCaseId: diagnosisCase.id,
        status: response.status,
      });
      return { webhookConfigured: true, webhookForwarded: false };
    }

    logEvent("master_intake.forward_succeeded", { diagnosisCaseId: diagnosisCase.id });
    return { webhookConfigured: true, webhookForwarded: true };
  } catch (error) {
    logEventError("webhook.master_intake_forward_failed", error, { diagnosisCaseId: diagnosisCase.id });
    return { webhookConfigured: true, webhookForwarded: false };
  }
}

function buildDiagnosisApiResponse(
  diagnosisCase: DiagnosisCaseResponse,
  webhookDebug: DiagnosisWebhookDebug
): DiagnosisApiResponse {
  return {
    ...diagnosisCase,
    ...webhookDebug
  };
}

type MarketplaceAcknowledgments = {
  ownerAuthorized?: boolean;
  platformOnly?: boolean;
  sellerResponsibilities?: boolean;
  noGuarantee?: boolean;
};

type MarketplaceSellerIntake = {
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string;
  city: string;
  state: string;
  zip: string;
  vehicleYear: string;
  make: string;
  model: string;
  mileage: string;
  askingPrice: string;
  titleStatus: string;
  runsAndDrives: string;
  knownIssues: string;
  listingType: string;
  acknowledgments: MarketplaceAcknowledgments;
  trim?: string;
  recentRepairs?: string;
  vin?: string;
  exteriorColor?: string;
  transmission?: string;
  fuelType?: string;
  hasKeys?: string;
  lienStatus?: string;
  bestContactMethod?: string;
  buyerTestDriveAllowed?: string;
  buyerMechanicAllowed?: string;
  sellerNotes?: string;
};

type MarketplaceBuyerInterestAcknowledgments = {
  platformOnly?: boolean;
  buyerResponsibilities?: boolean;
  noGuarantee?: boolean;
};

type MarketplaceBuyerInterest = {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  preferredContactMethod: string;
  listingTitle: string;
  message: string;
  acknowledgments: MarketplaceBuyerInterestAcknowledgments;
  listingUrl?: string;
  buyerLocation?: string;
  timeline?: string;
};

type InternalReviewInput = {
  caseId: string;
  customerName: string;
  customerEmail: string;
  vehicleYear: string;
  make: string;
  model: string;
  symptomsSummary: string;
  responseType: string;
  confidenceScore: string;
  confidenceBand: string;
  messageBody: string;
  followUpNeeded: string;
  adminNotes: string;
};

type MechanicMatchAcknowledgments = {
  platformOnly?: boolean;
  noGuarantee?: boolean;
  customerResponsible?: boolean;
};

type MechanicMatchRequest = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  state: string;
  zip: string;
  vehicleYear: string;
  make: string;
  model: string;
  mileage: string;
  problemCategory: string;
  symptoms: string;
  canDrive: string;
  urgency: string;
  preferredHelpType: string;
  budgetRange: string;
  photosOrVideoAvailable: string;
  existingDiagnosisCaseId: string;
  drivableCheckUsed: string;
  permissionToShareCase: string;
  acknowledgments: MechanicMatchAcknowledgments;
};

type ConciergeAcknowledgments = {
  aiAssistedGuide?: boolean;
  finalVerification?: boolean;
};

type ConciergeSourceContext = {
  page: string;
  selectedScenario: string | null;
  selectedReportType: string | null;
  topic: string | null;
  queryParams: Record<string, string>;
};

type ConciergeRequest = {
  guideRequested: string;
  helpTopic: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  relatedCaseId: string;
  relatedListingId: string;
  currentPage: string;
  urgency: string;
  preferredContactMethod: string;
  message: string;
  stuckStep: string;
  wantsHumanReview: string;
  scenario: string;
  reportType: string;
  topic: string;
  sourceContext: ConciergeSourceContext;
  acknowledgments: ConciergeAcknowledgments;
};

const marketplaceRequiredFields: Array<keyof Omit<MarketplaceSellerIntake, "acknowledgments">> = [
  "sellerName",
  "sellerEmail",
  "sellerPhone",
  "city",
  "state",
  "zip",
  "vehicleYear",
  "make",
  "model",
  "mileage",
  "askingPrice",
  "titleStatus",
  "runsAndDrives",
  "knownIssues",
  "listingType"
];

const marketplaceRequiredAcknowledgments: Array<keyof MarketplaceAcknowledgments> = [
  "ownerAuthorized",
  "platformOnly",
  "sellerResponsibilities",
  "noGuarantee"
];

const marketplaceBuyerInterestRequiredFields: Array<keyof Omit<MarketplaceBuyerInterest, "acknowledgments">> = [
  "buyerName",
  "buyerEmail",
  "buyerPhone",
  "preferredContactMethod",
  "listingTitle",
  "message"
];

const marketplaceBuyerInterestRequiredAcknowledgments: Array<keyof MarketplaceBuyerInterestAcknowledgments> = [
  "platformOnly",
  "buyerResponsibilities",
  "noGuarantee"
];

function pickMarketplaceString(body: any, key: keyof MarketplaceSellerIntake) {
  const value = body?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function pickBuyerInterestString(body: any, key: keyof MarketplaceBuyerInterest) {
  const value = body?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function pickInternalReviewString(body: any, key: keyof InternalReviewInput) {
  const value = body?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function pickMechanicMatchString(body: any, key: keyof MechanicMatchRequest) {
  const value = body?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function pickConciergeString(body: any, key: keyof ConciergeRequest) {
  const value = body?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildMarketplaceSellerIntake(body: any): MarketplaceSellerIntake {
  return {
    sellerName: pickMarketplaceString(body, "sellerName"),
    sellerEmail: pickMarketplaceString(body, "sellerEmail"),
    sellerPhone: pickMarketplaceString(body, "sellerPhone"),
    city: pickMarketplaceString(body, "city"),
    state: pickMarketplaceString(body, "state"),
    zip: pickMarketplaceString(body, "zip"),
    vehicleYear: pickMarketplaceString(body, "vehicleYear"),
    make: pickMarketplaceString(body, "make"),
    model: pickMarketplaceString(body, "model"),
    mileage: pickMarketplaceString(body, "mileage"),
    askingPrice: pickMarketplaceString(body, "askingPrice"),
    titleStatus: pickMarketplaceString(body, "titleStatus"),
    runsAndDrives: pickMarketplaceString(body, "runsAndDrives"),
    knownIssues: pickMarketplaceString(body, "knownIssues"),
    listingType: pickMarketplaceString(body, "listingType"),
    trim: pickMarketplaceString(body, "trim"),
    recentRepairs: pickMarketplaceString(body, "recentRepairs"),
    vin: pickMarketplaceString(body, "vin"),
    exteriorColor: pickMarketplaceString(body, "exteriorColor"),
    transmission: pickMarketplaceString(body, "transmission"),
    fuelType: pickMarketplaceString(body, "fuelType"),
    hasKeys: pickMarketplaceString(body, "hasKeys"),
    lienStatus: pickMarketplaceString(body, "lienStatus"),
    bestContactMethod: pickMarketplaceString(body, "bestContactMethod"),
    buyerTestDriveAllowed: pickMarketplaceString(body, "buyerTestDriveAllowed"),
    buyerMechanicAllowed: pickMarketplaceString(body, "buyerMechanicAllowed"),
    sellerNotes: pickMarketplaceString(body, "sellerNotes"),
    acknowledgments: {
      ownerAuthorized: !!body?.acknowledgments?.ownerAuthorized,
      platformOnly: !!body?.acknowledgments?.platformOnly,
      sellerResponsibilities: !!body?.acknowledgments?.sellerResponsibilities,
      noGuarantee: !!body?.acknowledgments?.noGuarantee
    }
  };
}

function validateMarketplaceSellerIntake(intake: MarketplaceSellerIntake) {
  const missingFields = marketplaceRequiredFields.filter((field) => !intake[field]);
  const missingAcknowledgments = marketplaceRequiredAcknowledgments.filter((field) => !intake.acknowledgments[field]);

  return {
    ok: missingFields.length === 0 && missingAcknowledgments.length === 0,
    missingFields,
    missingAcknowledgments
  };
}

function buildMarketplaceBuyerInterest(body: any): MarketplaceBuyerInterest {
  return {
    buyerName: pickBuyerInterestString(body, "buyerName"),
    buyerEmail: pickBuyerInterestString(body, "buyerEmail"),
    buyerPhone: pickBuyerInterestString(body, "buyerPhone"),
    preferredContactMethod: pickBuyerInterestString(body, "preferredContactMethod"),
    listingTitle: pickBuyerInterestString(body, "listingTitle"),
    listingUrl: pickBuyerInterestString(body, "listingUrl"),
    buyerLocation: pickBuyerInterestString(body, "buyerLocation"),
    message: pickBuyerInterestString(body, "message"),
    timeline: pickBuyerInterestString(body, "timeline"),
    acknowledgments: {
      platformOnly: !!body?.acknowledgments?.platformOnly,
      buyerResponsibilities: !!body?.acknowledgments?.buyerResponsibilities,
      noGuarantee: !!body?.acknowledgments?.noGuarantee
    }
  };
}

function validateMarketplaceBuyerInterest(intake: MarketplaceBuyerInterest) {
  const missingFields = marketplaceBuyerInterestRequiredFields.filter((field) => !intake[field]);
  const missingAcknowledgments = marketplaceBuyerInterestRequiredAcknowledgments.filter((field) => !intake.acknowledgments[field]);

  return {
    ok: missingFields.length === 0 && missingAcknowledgments.length === 0,
    missingFields,
    missingAcknowledgments
  };
}

function buildInternalReviewInput(body: any): InternalReviewInput {
  return {
    caseId: pickInternalReviewString(body, "caseId"),
    customerName: pickInternalReviewString(body, "customerName"),
    customerEmail: pickInternalReviewString(body, "customerEmail"),
    vehicleYear: pickInternalReviewString(body, "vehicleYear"),
    make: pickInternalReviewString(body, "make"),
    model: pickInternalReviewString(body, "model"),
    symptomsSummary: pickInternalReviewString(body, "symptomsSummary"),
    responseType: pickInternalReviewString(body, "responseType"),
    confidenceScore: pickInternalReviewString(body, "confidenceScore"),
    confidenceBand: pickInternalReviewString(body, "confidenceBand"),
    messageBody: pickInternalReviewString(body, "messageBody"),
    followUpNeeded: pickInternalReviewString(body, "followUpNeeded"),
    adminNotes: pickInternalReviewString(body, "adminNotes")
  };
}

function validateInternalReviewInput(input: InternalReviewInput) {
  const requiredFields: Array<keyof InternalReviewInput> = [
    "caseId",
    "customerEmail",
    "responseType",
    "messageBody"
  ];
  const missingFields = requiredFields.filter((field) => !input[field]);

  return {
    ok: missingFields.length === 0,
    missingFields
  };
}

function buildMechanicMatchRequest(body: any): MechanicMatchRequest {
  return {
    customerName: pickMechanicMatchString(body, "customerName"),
    customerEmail: pickMechanicMatchString(body, "customerEmail"),
    customerPhone: pickMechanicMatchString(body, "customerPhone"),
    city: pickMechanicMatchString(body, "city"),
    state: pickMechanicMatchString(body, "state"),
    zip: pickMechanicMatchString(body, "zip"),
    vehicleYear: pickMechanicMatchString(body, "vehicleYear"),
    make: pickMechanicMatchString(body, "make"),
    model: pickMechanicMatchString(body, "model"),
    mileage: pickMechanicMatchString(body, "mileage"),
    problemCategory: pickMechanicMatchString(body, "problemCategory"),
    symptoms: pickMechanicMatchString(body, "symptoms"),
    canDrive: pickMechanicMatchString(body, "canDrive"),
    urgency: pickMechanicMatchString(body, "urgency"),
    preferredHelpType: pickMechanicMatchString(body, "preferredHelpType"),
    budgetRange: pickMechanicMatchString(body, "budgetRange"),
    photosOrVideoAvailable: pickMechanicMatchString(body, "photosOrVideoAvailable"),
    existingDiagnosisCaseId: pickMechanicMatchString(body, "existingDiagnosisCaseId"),
    drivableCheckUsed: pickMechanicMatchString(body, "drivableCheckUsed"),
    permissionToShareCase: pickMechanicMatchString(body, "permissionToShareCase"),
    acknowledgments: {
      platformOnly: !!body?.acknowledgments?.platformOnly,
      noGuarantee: !!body?.acknowledgments?.noGuarantee,
      customerResponsible: !!body?.acknowledgments?.customerResponsible
    }
  };
}

function validateMechanicMatchRequest(input: MechanicMatchRequest) {
  const requiredFields: Array<keyof Omit<MechanicMatchRequest, "acknowledgments">> = [
    "customerName",
    "customerEmail",
    "customerPhone",
    "city",
    "state",
    "zip",
    "vehicleYear",
    "make",
    "model",
    "problemCategory",
    "symptoms",
    "canDrive",
    "urgency",
    "preferredHelpType",
    "permissionToShareCase"
  ];
  const requiredAcknowledgments: Array<keyof MechanicMatchAcknowledgments> = [
    "platformOnly",
    "noGuarantee",
    "customerResponsible"
  ];
  const missingFields = requiredFields.filter((field) => !input[field]);
  const missingAcknowledgments = requiredAcknowledgments.filter((field) => !input.acknowledgments[field]);

  return {
    ok: missingFields.length === 0 && missingAcknowledgments.length === 0,
    missingFields,
    missingAcknowledgments
  };
}

function buildConciergeRequest(body: any): ConciergeRequest {
  const sourceContextBody = body?.sourceContext;
  const queryParamsBody = sourceContextBody?.queryParams;
  const queryParams: Record<string, string> = {};

  for (const key of ["scenario", "reportType", "report", "topic"]) {
    if (typeof queryParamsBody?.[key] === "string" && queryParamsBody[key].trim()) {
      queryParams[key] = queryParamsBody[key].trim();
    }
  }

  return {
    guideRequested: pickConciergeString(body, "guideRequested"),
    helpTopic: pickConciergeString(body, "helpTopic"),
    customerName: pickConciergeString(body, "customerName"),
    customerEmail: pickConciergeString(body, "customerEmail"),
    customerPhone: pickConciergeString(body, "customerPhone"),
    relatedCaseId: pickConciergeString(body, "relatedCaseId"),
    relatedListingId: pickConciergeString(body, "relatedListingId"),
    currentPage: pickConciergeString(body, "currentPage"),
    urgency: pickConciergeString(body, "urgency"),
    preferredContactMethod: pickConciergeString(body, "preferredContactMethod"),
    message: pickConciergeString(body, "message"),
    stuckStep: pickConciergeString(body, "stuckStep"),
    wantsHumanReview: pickConciergeString(body, "wantsHumanReview"),
    scenario: pickConciergeString(body, "scenario"),
    reportType: pickConciergeString(body, "reportType"),
    topic: pickConciergeString(body, "topic"),
    sourceContext: {
      page: typeof sourceContextBody?.page === "string" ? sourceContextBody.page.trim() : "",
      selectedScenario: typeof sourceContextBody?.selectedScenario === "string" && sourceContextBody.selectedScenario.trim()
        ? sourceContextBody.selectedScenario.trim()
        : null,
      selectedReportType: typeof sourceContextBody?.selectedReportType === "string" && sourceContextBody.selectedReportType.trim()
        ? sourceContextBody.selectedReportType.trim()
        : null,
      topic: typeof sourceContextBody?.topic === "string" && sourceContextBody.topic.trim()
        ? sourceContextBody.topic.trim()
        : null,
      queryParams
    },
    acknowledgments: {
      aiAssistedGuide: !!body?.acknowledgments?.aiAssistedGuide,
      finalVerification: !!body?.acknowledgments?.finalVerification
    }
  };
}

function validateConciergeRequest(input: ConciergeRequest) {
  const requiredFields: Array<keyof Omit<ConciergeRequest, "acknowledgments">> = [
    "guideRequested",
    "helpTopic",
    "customerName",
    "customerEmail",
    "currentPage",
    "urgency",
    "preferredContactMethod",
    "message",
    "wantsHumanReview"
  ];
  const requiredAcknowledgments: Array<keyof ConciergeAcknowledgments> = [
    "aiAssistedGuide",
    "finalVerification"
  ];
  const missingFields = requiredFields.filter((field) => !input[field]);
  const missingAcknowledgments = requiredAcknowledgments.filter((field) => !input.acknowledgments[field]);

  return {
    ok: missingFields.length === 0 && missingAcknowledgments.length === 0,
    missingFields,
    missingAcknowledgments
  };
}

async function deliverMarketplaceSellerIntake(intake: MarketplaceSellerIntake) {
  const submittedAt = new Date().toISOString();
  const packet = {
    intakeType: "marketplace-seller",
    source: "drivable-marketplace-seller-intake",
    submittedAt,
    appBrand: "Drivable by Mechanic's Eye",
    marketplaceBrand: "Drivable Marketplace",
    payloadVersion: "v1",
    sellerName: intake.sellerName,
    sellerEmail: intake.sellerEmail,
    sellerPhone: intake.sellerPhone,
    city: intake.city,
    state: intake.state,
    zip: intake.zip,
    vehicleYear: intake.vehicleYear,
    make: intake.make,
    model: intake.model,
    trim: intake.trim,
    mileage: intake.mileage,
    askingPrice: intake.askingPrice,
    titleStatus: intake.titleStatus,
    runsAndDrives: intake.runsAndDrives,
    knownIssues: intake.knownIssues,
    recentRepairs: intake.recentRepairs,
    listingType: intake.listingType,
    acknowledgments: intake.acknowledgments,
    optionalDetails: {
      vin: intake.vin,
      exteriorColor: intake.exteriorColor,
      transmission: intake.transmission,
      fuelType: intake.fuelType,
      hasKeys: intake.hasKeys,
      lienStatus: intake.lienStatus,
      bestContactMethod: intake.bestContactMethod,
      buyerTestDriveAllowed: intake.buyerTestDriveAllowed,
      buyerMechanicAllowed: intake.buyerMechanicAllowed,
      sellerNotes: intake.sellerNotes
    },
    type: "mechanics_eye_marketplace_seller_intake",
    ...buildDrivableAiPayloadFields({
      reportType: "seller_as_is_listing_pack",
      scenario: "selling_vehicle",
      vehicleSummary: [
        intake.vehicleYear,
        intake.make,
        intake.model,
        intake.trim,
        intake.mileage
      ].filter(Boolean).join(" "),
      symptomSummary: [
        intake.knownIssues,
        intake.recentRepairs,
        `Runs and drives: ${intake.runsAndDrives}`
      ].filter(Boolean).join(" ")
    })
  };

  logEvent("marketplace.seller_intake_received", {
    intakeType: packet.intakeType,
    source: packet.source,
    submittedAt,
    listingType: intake.listingType,
  });

  const webhookUrl = process.env.MASTER_INTAKE_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("MASTER_INTAKE_WEBHOOK_URL is not configured.");
  }

  try {
    const response = await fetchWebhookWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet)
    });

    if (!response.ok) {
      logEventError("webhook.marketplace_seller_rejected", undefined, { status: response.status });
      throw new Error(`Marketplace seller intake webhook returned ${response.status}`);
    }

    logEvent("webhook.marketplace_seller_sent", {
      intakeType: packet.intakeType,
      source: packet.source,
      submittedAt
    });
  } catch (error) {
    logEventError("webhook.marketplace_seller_delivery_failed", error);
    throw error;
  }
}

async function deliverMarketplaceBuyerInterest(intake: MarketplaceBuyerInterest) {
  const submittedAt = new Date().toISOString();
  const packet = {
    intakeType: "marketplace-buyer-interest",
    source: "drivable-marketplace-buyer-interest",
    submittedAt,
    appBrand: "Drivable by Mechanic's Eye",
    marketplaceBrand: "Drivable Marketplace",
    payloadVersion: "v1",
    buyerName: intake.buyerName,
    buyerEmail: intake.buyerEmail,
    buyerPhone: intake.buyerPhone,
    preferredContactMethod: intake.preferredContactMethod,
    listingTitle: intake.listingTitle,
    listingUrl: intake.listingUrl,
    buyerLocation: intake.buyerLocation,
    message: intake.message,
    timeline: intake.timeline,
    acknowledgments: intake.acknowledgments,
    type: "mechanics_eye_marketplace_buyer_interest",
    ...buildDrivableAiPayloadFields({
      reportType: "buyer_remote_risk_review",
      scenario: "buying_vehicle",
      vehicleSummary: intake.listingTitle,
      symptomSummary: [intake.message, intake.timeline].filter(Boolean).join(" ")
    })
  };

  logEvent("marketplace.buyer_interest_received", {
    intakeType: packet.intakeType,
    source: packet.source,
    submittedAt,
    listingTitle: intake.listingTitle,
  });

  const webhookUrl = process.env.MASTER_INTAKE_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("MASTER_INTAKE_WEBHOOK_URL is not configured.");
  }

  try {
    const response = await fetchWebhookWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet)
    });

    if (!response.ok) {
      logEventError("webhook.marketplace_buyer_rejected", undefined, { status: response.status });
      throw new Error(`Marketplace buyer interest webhook returned ${response.status}`);
    }

    logEvent("webhook.marketplace_buyer_sent", {
      intakeType: packet.intakeType,
      source: packet.source,
      submittedAt
    });
  } catch (error) {
    logEventError("webhook.marketplace_buyer_delivery_failed", error);
    throw error;
  }
}

async function deliverInternalReview(input: InternalReviewInput) {
  const submittedAt = new Date().toISOString();
  const packet = {
    intakeType: "internal-diagnosis-response",
    source: "drivable-internal-review",
    submittedAt,
    caseId: input.caseId,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    vehicleYear: input.vehicleYear,
    make: input.make,
    model: input.model,
    symptomsSummary: input.symptomsSummary,
    responseType: input.responseType,
    confidenceScore: input.confidenceScore,
    confidenceBand: input.confidenceBand,
    messageBody: input.messageBody,
    followUpNeeded: input.followUpNeeded,
    adminNotes: input.adminNotes,
    ...buildDrivableAiPayloadFields({
      reportType: input.responseType || "full_decision_report",
      scenario: "current_problem",
      vehicleSummary: [
        input.vehicleYear,
        input.make,
        input.model
      ].filter(Boolean).join(" "),
      symptomSummary: [
        input.symptomsSummary,
        input.messageBody,
        input.adminNotes
      ].filter(Boolean).join(" ")
    })
  };

  const webhookUrl = process.env.MASTER_INTAKE_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("MASTER_INTAKE_WEBHOOK_URL is not configured.");
  }

  try {
    const response = await fetchWebhookWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet)
    });

    if (!response.ok) {
      logEventError("webhook.internal_review_rejected", undefined, { status: response.status });
      throw new Error(`Internal review webhook returned ${response.status}`);
    }

    logEvent("webhook.internal_review_sent", {
      intakeType: packet.intakeType,
      source: packet.source,
      submittedAt,
      caseId: packet.caseId
    });
  } catch (error) {
    logEventError("webhook.internal_review_delivery_failed", error);
    throw error;
  }
}

async function deliverMechanicMatchRequest(input: MechanicMatchRequest) {
  const submittedAt = new Date().toISOString();
  const packet = {
    intakeType: "mechanic-match-request",
    source: "drivable-mechanic-match",
    submittedAt,
    appBrand: "Drivable by Mechanic's Eye",
    productBrand: "Mechanic Match",
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    city: input.city,
    state: input.state,
    zip: input.zip,
    vehicleYear: input.vehicleYear,
    make: input.make,
    model: input.model,
    mileage: input.mileage,
    problemCategory: input.problemCategory,
    symptoms: input.symptoms,
    canDrive: input.canDrive,
    urgency: input.urgency,
    preferredHelpType: input.preferredHelpType,
    budgetRange: input.budgetRange,
    photosOrVideoAvailable: input.photosOrVideoAvailable,
    existingDiagnosisCaseId: input.existingDiagnosisCaseId,
    drivableCheckUsed: input.drivableCheckUsed,
    permissionToShareCase: input.permissionToShareCase,
    acknowledgments: input.acknowledgments,
    ...buildDrivableAiPayloadFields({
      reportType: "human_review_add_on",
      scenario: "current_problem",
      vehicleSummary: [
        input.vehicleYear,
        input.make,
        input.model,
        input.mileage
      ].filter(Boolean).join(" "),
      symptomSummary: [
        input.problemCategory,
        input.symptoms,
        input.canDrive,
        input.urgency
      ].filter(Boolean).join(" ")
    })
  };

  const webhookUrl = process.env.MASTER_INTAKE_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("MASTER_INTAKE_WEBHOOK_URL is not configured.");
  }

  try {
    const response = await fetchWebhookWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet)
    });

    if (!response.ok) {
      logEventError("webhook.mechanic_match_rejected", undefined, { status: response.status });
      throw new Error(`Mechanic Match webhook returned ${response.status}`);
    }

    logEvent("webhook.mechanic_match_sent", {
      intakeType: packet.intakeType,
      source: packet.source,
      submittedAt
    });
  } catch (error) {
    logEventError("webhook.mechanic_match_delivery_failed", error);
    throw error;
  }
}

async function deliverConciergeRequest(input: ConciergeRequest) {
  const submittedAt = new Date().toISOString();
  const packet = {
    intakeType: "support-concierge-request",
    source: "drivable-concierge",
    submittedAt,
    guideRequested: input.guideRequested,
    helpTopic: input.helpTopic,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    relatedCaseId: input.relatedCaseId,
    relatedListingId: input.relatedListingId,
    currentPage: input.currentPage,
    urgency: input.urgency,
    preferredContactMethod: input.preferredContactMethod,
    message: input.message,
    stuckStep: input.stuckStep,
    wantsHumanReview: input.wantsHumanReview,
    scenario: input.scenario,
    reportType: input.reportType,
    topic: input.topic,
    sourceContext: input.sourceContext,
    acknowledgments: input.acknowledgments,
    ...buildDrivableAiPayloadFields({
      reportType: input.reportType || "first_look_report",
      scenario: input.scenario || "current_problem",
      vehicleSummary: input.relatedListingId
        ? `Related listing ${input.relatedListingId}`
        : "Vehicle details not provided",
      symptomSummary: [
        input.helpTopic,
        input.message,
        input.stuckStep,
        input.urgency
      ].filter(Boolean).join(" ")
    })
  };

  const webhookUrl = process.env.MASTER_INTAKE_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("MASTER_INTAKE_WEBHOOK_URL is not configured.");
  }

  try {
    const response = await fetchWebhookWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet)
    });

    if (!response.ok) {
      logEventError("webhook.concierge_rejected", undefined, { status: response.status });
      throw new Error(`Concierge request webhook returned ${response.status}`);
    }

    logEvent("webhook.concierge_sent", {
      intakeType: packet.intakeType,
      source: packet.source,
      submittedAt
    });
  } catch (error) {
    logEventError("webhook.concierge_delivery_failed", error);
    throw error;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerCustomerAuthRoutes(app);
  registerDurableReviewRoutes(app);
  const publicFormLimit = createRateLimit({ scope: "public-form", windowMs: 10 * 60_000, max: 15 });
  const vehicleKnowledgeLimit = createRateLimit({ scope: "buyer-vehicle-knowledge", windowMs: 5 * 60_000, max: 120 });
  const customerIntakeLimit = createRateLimit({
    scope: "customer-intake",
    windowMs: 60 * 60_000,
    max: 20,
    key: (req) => req.drivableCustomer?.id || req.ip || "unknown",
  });

  app.get("/api/health/live", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  });

  app.get("/api/health/readiness", requireReviewer, async (_req, res) => {
    let durableHumanReview = false;
    try {
      await requireVerifiedLaunchControlRuntime();
      durableHumanReview = true;
    } catch {
      // A missing flag, database, table, or trigger is a red readiness gate.
    }
    const report = evaluateLaunchReadiness(process.env, {
      durableEvidence: evidenceStore.durability === "private_object_storage",
      durableConsent: false,
      durableHumanReview,
      verifiedPaymentEntitlement: false,
      verifiedEmailDelivery: false,
    });
    res.status(report.ready ? 200 : 503).json(report);
  });

  app.get("/api/capabilities", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      photoUpload: process.env.DRIVABLE_PHOTO_UPLOAD_ENABLED === "true" && evidenceStore.durability === "private_object_storage",
      audioUpload: false,
      videoUpload: false,
      vibrationSensorCapture: false,
    });
  });

  app.get("/api/health/db", requireReviewer, async (req, res) => {
    const result = await checkDatabaseConnection();
    res.status(result.ok ? 200 : 503).json(result);
  });

  app.post("/api/marketplace/seller-intake", requireAllowedOrigin, publicFormLimit, async (req, res) => {
    try {
      const intake = buildMarketplaceSellerIntake(req.body || {});
      const validation = validateMarketplaceSellerIntake(intake);

      if (!validation.ok) {
        const missing = [
          ...validation.missingFields,
          ...validation.missingAcknowledgments.map((field) => `acknowledgments.${field}`)
        ];

        res.status(400).json({ ok: false, error: `Missing required fields: ${missing.join(", ")}` });
        return;
      }

      await deliverMarketplaceSellerIntake(intake);
      res.json({ ok: true, received: true });
    } catch (error) {
      logEventError("form.marketplace_seller_intake_failed", error);
      res.status(502).json({ ok: false, error: "Seller intake could not be forwarded. Please try again." });
    }
  });

  app.post("/api/marketplace/buyer-interest", requireAllowedOrigin, publicFormLimit, async (req, res) => {
    try {
      const intake = buildMarketplaceBuyerInterest(req.body || {});
      const validation = validateMarketplaceBuyerInterest(intake);

      if (!validation.ok) {
        const missing = [
          ...validation.missingFields,
          ...validation.missingAcknowledgments.map((field) => `acknowledgments.${field}`)
        ];

        res.status(400).json({ ok: false, error: `Missing required fields: ${missing.join(", ")}` });
        return;
      }

      await deliverMarketplaceBuyerInterest(intake);
      res.json({ ok: true, received: true });
    } catch (error) {
      logEventError("form.marketplace_buyer_interest_failed", error);
      res.status(502).json({ ok: false, error: "Buyer interest could not be forwarded. Please try again." });
    }
  });

  app.post("/api/internal-review", requireReviewer, async (req, res) => {
    try {
      const input = buildInternalReviewInput(req.body || {});
      const validation = validateInternalReviewInput(input);

      if (!validation.ok) {
        res.status(400).json({ ok: false, error: `Missing required fields: ${validation.missingFields.join(", ")}` });
        return;
      }

      await deliverInternalReview(input);
      res.json({ ok: true, received: true });
    } catch (error) {
      logEventError("form.internal_review_failed", error);
      res.status(502).json({ ok: false, error: "Internal review could not be forwarded. Please check Make/Gmail before retrying." });
    }
  });

  app.post("/api/mechanic-match/request", requireAllowedOrigin, publicFormLimit, async (req, res) => {
    try {
      const input = buildMechanicMatchRequest(req.body || {});
      const validation = validateMechanicMatchRequest(input);

      if (!validation.ok) {
        const missing = [
          ...validation.missingFields,
          ...validation.missingAcknowledgments.map((field) => `acknowledgments.${field}`)
        ];

        res.status(400).json({ ok: false, error: `Missing required fields: ${missing.join(", ")}` });
        return;
      }

      await deliverMechanicMatchRequest(input);
      res.json({ ok: true, received: true });
    } catch (error) {
      logEventError("form.mechanic_match_request_failed", error);
      res.status(502).json({ ok: false, error: "Mechanic Match request could not be forwarded. Please try again." });
    }
  });

  app.post("/api/support/concierge-request", requireAllowedOrigin, publicFormLimit, async (req, res) => {
    try {
      const input = buildConciergeRequest(req.body || {});
      const validation = validateConciergeRequest(input);

      if (!validation.ok) {
        const missing = [
          ...validation.missingFields,
          ...validation.missingAcknowledgments.map((field) => `acknowledgments.${field}`)
        ];

        res.status(400).json({ ok: false, error: `Missing required fields: ${missing.join(", ")}` });
        return;
      }

      await deliverConciergeRequest(input);
      res.json({ ok: true, received: true });
    } catch (error) {
      logEventError("form.concierge_request_failed", error);
      res.status(502).json({ ok: false, error: "Your help request could not be forwarded. Please try again." });
    }
  });

  
  // Get recent diagnoses
  app.get("/api/diagnoses/recent", requireReviewer, async (req, res) => {
    try {
      const requestedLimit = parseInt(req.query.limit as string, 10) || 10;
      const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 10, 1), 200);
      const diagnoses = await storage.getRecentDiagnoses(limit);
      res.json(diagnoses);
    } catch (error) {
      logEventError("api.diagnoses_recent_failed", error);
      res.status(500).json({ message: "Failed to fetch recent diagnoses" });
    }
  });

  // Fix History Log endpoints
  app.get("/api/fix-history/:diagnosisId", requireReviewer, async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const history = await storage.getFixHistory(diagnosisId);
      res.json(history);
    } catch (error) {
      logEventError("api.fix_history_failed", error, { diagnosisId: String(req.params?.diagnosisId ?? "") });
      res.status(500).json({ message: "Failed to fetch fix history" });
    }
  });

  // Update step completion
  app.post("/api/diagnoses/:diagnosisId/steps", requireReviewer, async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const { suggestionIndex, stepIndex, completed, timeSpent } = req.body;
      
      const result = await storage.updateStepCompletion(diagnosisId, {
        suggestionIndex,
        stepIndex,
        completed,
        timeSpent
      });
      
      res.json(result);
    } catch (error) {
      logEventError("api.step_completion_failed", error, { diagnosisId: String(req.params?.diagnosisId ?? "") });
      res.status(500).json({ message: "Failed to update step completion" });
    }
  });

  // Mark fix as complete
  app.post("/api/diagnoses/:diagnosisId/fix-complete", requireReviewer, async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const { suggestionIndex, wasSuccessful, feedback, timeSpent, stepsCompleted } = req.body;
      
      const result = await storage.markFixComplete(diagnosisId, {
        suggestionIndex,
        wasSuccessful,
        feedback,
        timeSpent,
        stepsCompleted
      });
      
      res.json(result);
    } catch (error) {
      logEventError("api.fix_complete_failed", error, { diagnosisId: String(req.params?.diagnosisId ?? "") });
      res.status(500).json({ message: "Failed to mark fix complete" });
    }
  });

  // Export chat for mechanic
  app.post("/api/diagnoses/:diagnosisId/export-chat", requireReviewer, async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const exportData = await storage.exportChatForMechanic(diagnosisId);
      res.json(exportData);
    } catch (error) {
      logEventError("api.export_chat_failed", error, { diagnosisId: String(req.params?.diagnosisId ?? "") });
      res.status(500).json({ message: "Failed to export chat" });
    }
  });

  // Send to mechanic
  app.post("/api/diagnoses/:diagnosisId/send-to-mechanic", requireReviewer, async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const result = await storage.sendToMechanic(diagnosisId);
      res.json(result);
    } catch (error) {
      logEventError("api.send_to_mechanic_failed", error, { diagnosisId: String(req.params?.diagnosisId ?? "") });
      res.status(500).json({ message: "Failed to send to mechanic" });
    }
  });

  // Get all diagnoses
  app.get("/api/diagnoses", requireReviewer, async (req, res) => {
    try {
      const diagnoses = await storage.getDiagnosesByUser();
      res.json(diagnoses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch diagnoses" });
    }
  });


  // Get NHTSA-backed vehicle knowledge for Buyer Risk / Buyer Check
  app.get("/api/buyer-risk/vehicle-knowledge", vehicleKnowledgeLimit, async (req, res) => {
    const vehicleYear = pickString(req.query.year, req.query.vehicleYear);
    const make = pickString(req.query.make, req.query.vehicleMake);
    const model = pickString(req.query.model, req.query.vehicleModel);

    if (!vehicleYear || !make || !model) {
      return res.status(400).json({
        found: false,
        message: "Missing required query fields: year, make, and model",
        required: ["year", "make", "model"]
      });
    }

    const yearNumber = Number.parseInt(vehicleYear, 10);

    if (!Number.isInteger(yearNumber)) {
      return res.status(400).json({
        found: false,
        message: "Vehicle year must be a valid number"
      });
    }

    const parseJsonArray = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string");
      }

      if (typeof value === "string" && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : [];
        } catch {
          return [];
        }
      }

      return [];
    };

    const parseRaw = (value: unknown): Record<string, unknown> => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }

      if (typeof value === "string" && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
        } catch {
          return {};
        }
      }

      return {};
    };

    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!databaseUrl) {
      return res.status(503).json({
        found: false,
        message: "DATABASE_URL is not configured for this server process"
      });
    }

    const client = new Client({
      connectionString: databaseUrl,
      ssl: sslConfigForDatabaseUrl(databaseUrl)
    });

    try {
      await client.connect();

      const result = await client.query(
        `
          SELECT
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
          FROM drivable_vehicle_knowledge_packs
          WHERE vehicle_year = $1
            AND lower(vehicle_make) = lower($2)
            AND lower(vehicle_model) = lower($3)
          LIMIT 1
        `,
        [yearNumber, make, model]
      );

      if (!result.rows.length) {
        return res.json({
          found: false,
          vehicle: {
            year: yearNumber,
            make,
            model
          },
          source: "NHTSA",
          vinRequiredForApplicability: true,
          message: "No Drivable vehicle knowledge pack found for this year/make/model yet.",
          fallbackPrompts: [
            "Ask seller for the VIN so recalls can be checked at VIN level.",
            "Ask seller for dashboard photos, scan results, and repair records.",
            "Use an independent inspection before buying."
          ]
        });
      }

      const row = result.rows[0];
      const raw = parseRaw(row.raw);

      return res.json({
        found: true,
        vehicle: {
          year: row.vehicle_year,
          make: row.vehicle_make,
          model: row.vehicle_model
        },
        packId: row.pack_id,
        source: row.source,
        sourceType: row.source_type,
        confidence: row.confidence,
        summary: row.summary,
        vinRequiredForApplicability: row.vin_required_for_applicability,
        recallCount: typeof raw.recallCount === "number" ? raw.recallCount : null,
        complaintCount: typeof raw.complaintCount === "number" ? raw.complaintCount : null,
        riskTags: parseJsonArray(row.risk_tags),
        buyerQuestions: parseJsonArray(row.buyer_questions),
        sellerEvidenceRequests: parseJsonArray(row.seller_evidence_requests),
        inspectionPrompts: parseJsonArray(row.inspection_prompts),
        disclaimer: "NHTSA year/make/model data is context only. VIN-level confirmation is required before claiming a recall applies to a specific vehicle."
      });
    } catch (error) {
      logEventError("api.buyer_vehicle_knowledge_failed", error);
      return res.status(500).json({
        found: false,
        message: "Failed to fetch vehicle knowledge pack"
      });
    } finally {
      await client.end().catch((endError) => {
        logEventError("api.buyer_vehicle_knowledge_db_close_failed", endError);
      });
    }
  });

  // Get specific diagnosis
  app.get("/api/diagnoses/:id", requireReviewer, async (req, res) => {
    try {
      const diagnosis = await storage.getDiagnosis(req.params.id);
      if (!diagnosis) {
        return res.status(404).json({ message: "Diagnosis not found" });
      }
      res.json(diagnosis);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch diagnosis" });
    }
  });

  app.get("/api/internal/evidence/:caseId/:attachmentId", requireReviewer, async (req, res) => {
    try {
      const result = await evidenceStore.getAttachment(req.params.caseId, req.params.attachmentId);
      if (!result) return res.status(404).json({ ok: false, error: "Evidence attachment not found." });
      res.setHeader("Content-Type", result.attachment.mimeType);
      res.setHeader("Content-Length", String(result.bytes.length));
      res.setHeader("Content-Disposition", `inline; filename="${result.attachment.id}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(result.bytes);
    } catch (error) {
      logEventError("api.reviewer_evidence_retrieval_failed", error);
      return res.status(502).json({ ok: false, error: "Evidence could not be retrieved." });
    }
  });

  // Create new diagnosis and save to local case storage
  app.post("/api/diagnoses", requireCustomer, customerIntakeLimit, diagnosisPhotoUploadMiddleware, async (req, res) => {
    let input: DiagnosisInput;
    let evidenceIntake;
    let consentChoices: unknown;
    try {
      const normalizedBody = normalizeDiagnosisBody(req.body);
      const authenticatedEmail = req.drivableCustomer!.email;
      normalizedBody.email = authenticatedEmail;
      normalizedBody.customerEmail = authenticatedEmail;
      input = applyAuthenticatedCaseIdentity(buildDiagnosisInput(normalizedBody), authenticatedEmail);
      evidenceIntake = drivableEvidenceIntakeSchema.parse(
        parseJsonField(normalizedBody.evidenceIntake || "{}", "evidenceIntake"),
      );
      consentChoices = parseJsonField(normalizedBody.consent || "{}", "consent");
      input.mileage = evidenceIntake.vehicle.mileage === undefined || evidenceIntake.vehicle.mileage === null
        ? input.mileage
        : String(evidenceIntake.vehicle.mileage);
      input.obdCodes = evidenceIntake.obd.codes.join(", ") || input.obdCodes;
    } catch (validationError) {
      // Never echo parser/Zod messages: they can embed submitted values, schema
      // internals, or the request body. The client performs its own validation.
      return res.status(400).json({
        message: "The diagnosis case details did not pass validation. Please review the entered information and try again.",
        code: "INVALID_DIAGNOSIS_INTAKE",
      });
    }

    const photoFiles = (req.files || []) as Express.Multer.File[];
    if (photoFiles.length && (process.env.DRIVABLE_PHOTO_UPLOAD_ENABLED !== "true" || evidenceStore.durability !== "private_object_storage")) {
      return res.status(409).json({
        message: "Photo upload is not available until private evidence storage passes launch verification. You can continue with written symptoms and OBD-II codes.",
        persisted: false,
      });
    }
    let responseBody: DiagnosisCaseResponse;
    let storedCase: StoredDiagnosisCase | undefined;
    let usedPublicFallback = false;

    try {
      const launchControlsEnabled = process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED === "true";
      if (launchControlsEnabled) {
        // Launch-controlled cases avoid runtime-local case files. Consent is
        // durably recorded before any private media is persisted.
        responseBody = createPublicDiagnosisCase(input);
        usedPublicFallback = true;
        try {
          const runtime = await requireVerifiedLaunchControlRuntime();
          await persistAndAuthorizeIntakeConsent(runtime.consent, {
            actorId: req.drivableCustomer!.id,
            accountId: req.drivableCustomer!.id,
            caseId: responseBody.id,
            choices: consentChoices,
            hasMedia: photoFiles.length > 0,
          });
        } catch (consentError) {
          const status = consentError instanceof IntakeConsentError && consentError.code === "CONSENT_REQUIRED" ? 400 : 503;
          return res.status(status).json({
            message: consentError instanceof IntakeConsentError ? consentError.message : "Consent controls are not ready.",
            code: consentError instanceof IntakeConsentError ? consentError.code : "CONSENT_CONTROLS_UNAVAILABLE",
            persisted: false,
          });
        }
      } else if (canUseLocalCaseStorage()) {
        try {
          storedCase = createStoredDiagnosisCase(input);
          responseBody = buildDiagnosisResponse(storedCase);
        } catch (storageError) {
          logEventError("api.local_case_storage_failed", storageError);
          responseBody = createPublicDiagnosisCase(input);
          usedPublicFallback = true;
        }
      } else {
        responseBody = createPublicDiagnosisCase(input);
        usedPublicFallback = true;
      }

      if (photoFiles.length) {
        try {
          const attachments = await evidenceStore.savePhotos(responseBody.id, photoFiles);
          responseBody.attachments = attachments;
          responseBody.evidencePersistence = {
            durability: evidenceStore.durability,
            durableStorageConfigured: evidenceStore.durability === "private_object_storage",
            analysisStatus: "uploaded_not_analyzed",
          };
          input.photoEvidenceStatus = "Persisted";
          input.photoFileNames = attachments.map((attachment) => attachment.originalName);
          input.attachments = attachments;
        } catch (storageError) {
          logEventError("api.photo_evidence_persistence_failed", storageError);
          return res.status(507).json({
            message: "The case could not be completed because its photo evidence was not persisted. Please try again.",
            caseId: responseBody.id,
            persisted: false,
          });
        }
      }

      if (usedPublicFallback) {
        const dbResult = await insertPublicDiagnosisCaseToDb(responseBody, input, storedCase, authenticatedCaseOwnerId(req.drivableCustomer?.id));
        if (!dbResult.ok) {
          if (photoFiles.length) await evidenceStore.deleteCase(responseBody.id);
          return res.status(503).json({ message: "The case was not saved to the case database. Please try again.", caseId: responseBody.id, persisted: false });
        }
        responseBody.casePersistence = { primary: "database", databaseMirror: "persisted" };
        const webhookDebug = await forwardMasterDiagnosisIntakeWebhook(responseBody, input);
        void deliverPublicCaseNotification(responseBody, input);
        void deliverDiagnosisWebhook(responseBody, input, storedCase);
        return res.json(buildDiagnosisApiResponse(responseBody, webhookDebug));
      }

      const dbResult = await insertPublicDiagnosisCaseToDb(responseBody, input, storedCase, authenticatedCaseOwnerId(req.drivableCustomer?.id));
      responseBody.casePersistence = {
        primary: "local_case_store",
        databaseMirror: dbResult.ok ? "persisted" : "unavailable",
      };
      const webhookDebug = await forwardMasterDiagnosisIntakeWebhook(responseBody, input);
      await deliverDiagnosisWebhook(responseBody, input, storedCase);
      return res.json(buildDiagnosisApiResponse(responseBody, webhookDebug));
    } catch (error) {
      logEventError("api.diagnosis_creation_failed", error);
      return res.status(500).json({
        message: "The diagnosis case was not confirmed as persisted. Please try again.",
        persisted: false,
      });
    }
  });

  // Create follow-up request when previous fixes didn't work
  app.post("/api/diagnoses/:id/follow-up", requireReviewer, upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const diagnosisId = req.params.id;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (req.body.vibrationData) {
        const uploadedPaths = Object.values(files || {}).flat().map((file) => file.path).filter(Boolean);
        await Promise.all(uploadedPaths.map((filePath) => fs.promises.unlink(filePath).catch(() => undefined)));
        return res.status(422).json({
          message: "Vibration capture is not available yet. No vibration readings were stored or analyzed.",
          code: "VIBRATION_CAPTURE_UNAVAILABLE",
        });
      }
      
      // Get original diagnosis
      const originalDiagnosis = await storage.getDiagnosis(diagnosisId);
      if (!originalDiagnosis) {
        return res.status(404).json({ message: "Original diagnosis not found" });
      }

      // Create follow-up request
      const followUpData = {
        originalDiagnosisId: diagnosisId,
        userId: originalDiagnosis.userId!,
        additionalInfo: req.body.additionalInfo,
        newAudioFile: files?.audio?.[0]?.filename || null,
        newVideoFile: files?.video?.[0]?.filename || null,
        newVibrationData: null,
      };

      const followUp = await storage.createFollowUp(followUpData);

      // Get previously attempted fixes
      const previousFollowUps = await storage.getFollowUpsByDiagnosis(diagnosisId);
      const previousAttempts = [
        originalDiagnosis.primaryDiagnosis?.title,
        ...originalDiagnosis.alternativeScenarios?.map(s => s.title) || [],
        ...previousFollowUps.map(fu => `Follow-up ${fu.id}`)
      ].filter(Boolean);

      // Perform enhanced analysis with iteration count
      const iterationCount = previousFollowUps.length + 2; // +1 for original, +1 for current
      const analysisResults = performEnhancedAnalysis(
        {
          description: `${originalDiagnosis.description}\n\nAdditional info: ${followUpData.additionalInfo}`,
          vehicleInfo: originalDiagnosis.vehicleInfo,
          timing: originalDiagnosis.timing
        },
        iterationCount,
        previousAttempts.filter((attempt): attempt is string => typeof attempt === "string" && attempt.length > 0)
      );

      // Create new diagnosis with follow-up results
      const evidenceBoundary = buildFollowUpEvidenceBoundary({
        audioStored: Boolean(followUpData.newAudioFile),
        videoStored: Boolean(followUpData.newVideoFile),
      });
      const newDiagnosis = await storage.createDiagnosis({
        userId: originalDiagnosis.userId,
        vehicleInfo: originalDiagnosis.vehicleInfo!,
        description: `Follow-up #${iterationCount - 1}: ${followUpData.additionalInfo}`,
        timing: originalDiagnosis.timing!,
        audioFile: followUpData.newAudioFile,
        videoFile: followUpData.newVideoFile,
        vibrationData: followUpData.newVibrationData,
        confidenceScore: analysisResults.primaryDiagnosis?.confidence || 0,
        confidenceLevel: analysisResults.primaryDiagnosis?.confidence >= 80 ? "high" : 
                       analysisResults.primaryDiagnosis?.confidence >= 60 ? "medium" : "low",
        // Only text reaches performEnhancedAnalysis. Media remains reviewer evidence
        // and must never be labeled as an analyzed model input.
        inputTypes: [...evidenceBoundary.analyzedInputTypes],
        iterationCount,
      });

      res.json({
        ...newDiagnosis,
        evidenceProcessing: evidenceBoundary.evidenceProcessing,
        analysisBoundary: evidenceBoundary.analysisBoundary,
      });
    } catch (error: any) {
      logEventError("api.follow_up_creation_failed", error);
      res.status(400).json({ 
        message: "Failed to create follow-up. Please try again." 
      });
    }
  });

  // Get subscription pricing and features
  app.get("/api/subscription/tiers", (req, res) => {
    res.json(SUBSCRIPTION_FEATURES);
  });

  // Get available mechanics for consultation
  app.get("/api/mechanics", async (req, res) => {
    try {
      const mechanics = await storage.getActiveMechanics();
      res.json(mechanics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch mechanics" });
    }
  });

  // Start mechanic consultation
  app.post("/api/consultations", requireReviewer, async (req, res) => {
    try {
      const { diagnosisId, mechanicId, userId } = req.body;
      
      const consultation = await storage.createConsultation({
        diagnosisId,
        mechanicId, 
        userId,
        status: "pending"
      });

      res.json(consultation);
    } catch (error: any) {
      logEventError("api.consultation_start_failed", error);
      res.status(400).json({ 
        message: "Failed to start consultation. Please try again." 
      });
    }
  });

  // Submit consultation feedback
  app.post("/api/consultations/:id/feedback", requireReviewer, async (req, res) => {
    try {
      const consultationId = req.params.id;
      const feedbackData = consultationFeedbackSchema.parse(req.body);
      
      // Calculate overall score (average of ratings, with wasFixed bonus)
      const ratingAverage = (
        feedbackData.politenessRating + 
        feedbackData.effectivenessRating + 
        feedbackData.easeOfWorkRating
      ) / 3;
      
      const overallScore = feedbackData.wasFixed ? 
        Math.min(ratingAverage + 1, 10) : ratingAverage;

      const consultation = await storage.updateConsultation(consultationId, {
        ...feedbackData,
        overallScore: overallScore.toString(),
        status: "completed",
        completedAt: new Date()
      });

      // Update mechanic rating based on feedback
      const consultations = await storage.getConsultationsByMechanic(consultation.mechanicId);
      const averageRating = consultations
        .filter(c => c.overallScore)
        .reduce((sum, c) => sum + parseFloat(c.overallScore!), 0) / consultations.length;
      
      await storage.updateMechanicRating(consultation.mechanicId, averageRating);

      res.json(consultation);
    } catch (error: any) {
      logEventError("api.consultation_feedback_failed", error);
      res.status(400).json({ 
        message: "Failed to submit feedback. Please try again." 
      });
    }
  });

  // Serve uploaded files
  app.get("/api/files/:filename", requireReviewer, (req, res) => {
    const filename = path.basename(String(req.params.filename || ""));

    if (!filename || filename !== req.params.filename) {
      res.status(400).json({ message: "Invalid file name" });
      return;
    }

    const resolvedRoot = path.resolve(uploadDir);
    const filepath = path.resolve(uploadDir, filename);

    if (!filepath.startsWith(resolvedRoot + path.sep)) {
      res.status(400).json({ message: "Invalid file name" });
      return;
    }

    if (fs.existsSync(filepath) && fs.statSync(filepath).isFile()) {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.sendFile(filepath);
    } else {
      res.status(404).json({ message: "File not found" });
    }
  });

  // Revoke durable intake consent for an authenticated customer's case.
  // Fail-closed: requires launch controls and an existing acceptance.
  app.post("/api/consent/revoke", requireCustomer, async (req, res) => {
    const accountId = req.drivableCustomer!.id;
    const actorId = req.drivableCustomer!.id;
    const caseId = String(req.body?.caseId || "").trim();
    if (!caseId || caseId.length > 200) {
      res.status(400).json({ message: "caseId is required.", code: "INVALID_CASE_ID" });
      return;
    }
    try {
      if (process.env.DRIVABLE_LAUNCH_CONTROLS_ENABLED !== "true") {
        res.status(503).json({ message: "Consent controls are not ready.", code: "CONSENT_CONTROLS_UNAVAILABLE" });
        return;
      }
      const runtime = await requireVerifiedLaunchControlRuntime();
      await recordConsentRevocation(
        runtime.consent,
        { actorId, accountId, caseId, purposes: req.body?.purposes },
      );
      res.json({ ok: true, revoked: true });
    } catch (error) {
      if (error instanceof IntakeConsentError) {
        const status = error.code === "NO_ACCEPTANCE" || error.code === "INVALID_PURPOSES" ? 400 : 503;
        res.status(status).json({ message: error.message, code: error.code });
        return;
      }
      logEventError("api.consent_revocation_failed", error);
      res.status(503).json({ message: "Consent controls are not ready.", code: "CONSENT_CONTROLS_UNAVAILABLE" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}



