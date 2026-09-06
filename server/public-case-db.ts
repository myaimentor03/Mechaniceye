import { diagnoses } from "./shared/shared/schema";
import { logEvent, logEventError } from "./observability/safe-log";
import { getDb } from "./db";
import type { IncomingDiagnosisCase, StoredDiagnosisCase } from "./case-storage";

type PublicDiagnosisResponse = {
  id?: string;
  caseId?: string;
  vehicleInfo?: string;
  description?: string;
  timing?: string;
};

type PublicDiagnosisInput = IncomingDiagnosisCase & {
  photoEvidenceStatus?: string;
  audioEvidenceStatus?: string;
  videoEvidenceStatus?: string;
  vibrationEvidenceStatus?: string;
  photoFileNames?: string[];
  audioFileNames?: string[];
  videoFileNames?: string[];
  vibrationFileNames?: string[];
};

type PublicCaseDbInsertResult =
  | { ok: true; status: "inserted"; id: string }
  | { ok: true; status: "already_exists"; id: string }
  | { ok: false; status: "failed"; id?: string; error: string };

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function firstNonEmptyString(...values: unknown[]) {
  return values.find(nonEmptyString) as string | undefined;
}

function normalizeFileList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item))
    : [];
}

function evidenceStatusIndicatesPresence(value: unknown) {
  if (!nonEmptyString(value)) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return !["none", "no", "not provided", "not_provided", "missing", "absent"].includes(normalized);
}

function hasEvidence(status: unknown, fileNames: unknown, data?: unknown) {
  return (
    evidenceStatusIndicatesPresence(status) ||
    normalizeFileList(fileNames).length > 0 ||
    (data !== undefined && data !== null && data !== "")
  );
}

function buildInputTypes(input: PublicDiagnosisInput) {
  const inputTypes = new Set<string>();

  if (nonEmptyString(input.description)) {
    inputTypes.add("written");
  }

  if (hasEvidence(input.photoEvidenceStatus, input.photoFileNames)) {
    inputTypes.add("photo");
  }

  if (hasEvidence(input.audioEvidenceStatus, input.audioFileNames)) {
    inputTypes.add("audio");
  }

  if (hasEvidence(input.videoEvidenceStatus, input.videoFileNames)) {
    inputTypes.add("video");
  }

  if (hasEvidence(input.vibrationEvidenceStatus, input.vibrationFileNames, input.vibrationData)) {
    inputTypes.add("vibration");
  }

  return Array.from(inputTypes);
}

function buildVibrationData(input: PublicDiagnosisInput) {
  const vibrationData: Record<string, unknown> = {
    unsupportedVehicle: input.unsupportedVehicle,
    manualVehicleEntryUsed: input.manualVehicleEntryUsed
  };

  if (input.vibrationEvidenceStatus) {
    vibrationData.vibrationEvidenceStatus = input.vibrationEvidenceStatus;
  }

  if (input.vibrationFileNames?.length) {
    vibrationData.vibrationFileNames = input.vibrationFileNames;
  }

  if (input.vibrationData !== undefined && input.vibrationData !== null) {
    vibrationData.vibrationData = input.vibrationData;
  }

  if (input.rawVehicleSelection !== undefined && input.rawVehicleSelection !== null) {
    vibrationData.rawVehicleSelection = input.rawVehicleSelection;
  }

  return vibrationData;
}

function fileSummary(fileNames: unknown, fallbackStatus: unknown) {
  const files = normalizeFileList(fileNames);

  if (files.length > 0) {
    return files.join(", ");
  }

  return nonEmptyString(fallbackStatus) ? fallbackStatus.trim() : null;
}

function errorMessage(error: unknown) {
  let message = error instanceof Error ? error.message : "Unknown database error";
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    message = message.replaceAll(databaseUrl, "[redacted]");

    try {
      const parsedUrl = new URL(databaseUrl);
      if (parsedUrl.password) {
        message = message.replaceAll(parsedUrl.password, "[redacted]");
      }
    } catch {
      // Ignore malformed env values; the direct string replacement above still applies.
    }
  }

  return message;
}

export async function insertPublicDiagnosisCaseToDb(
  responseBody: PublicDiagnosisResponse,
  input: PublicDiagnosisInput,
  storedCase?: StoredDiagnosisCase,
  userId?: string,
): Promise<PublicCaseDbInsertResult> {
  const id = firstNonEmptyString(responseBody.id, responseBody.caseId, storedCase?.id);

  if (!id) {
    const error = "Public diagnosis case has no id";
    logEventError("public_case_db.insert_failed_no_id", undefined, { error });
    return { ok: false, status: "failed", error };
  }

  try {
    const inserted = await getDb()
      .insert(diagnoses)
      .values({
        id,
        userId: firstNonEmptyString(userId),
        vehicleInfo: firstNonEmptyString(input.vehicleInfo, storedCase?.vehicleInfo, responseBody.vehicleInfo) || "",
        description: firstNonEmptyString(input.description, storedCase?.description, responseBody.description) || "",
        timing: firstNonEmptyString(input.timing, storedCase?.timing, responseBody.timing) || "",
        audioFile: fileSummary(input.audioFileNames, input.audioEvidenceStatus),
        videoFile: fileSummary(input.videoFileNames, input.videoEvidenceStatus),
        vibrationData: buildVibrationData(input),
        confidenceScore: 0,
        confidenceLevel: "low",
        inputTypes: buildInputTypes(input)
      })
      .onConflictDoNothing({ target: diagnoses.id })
      .returning({ id: diagnoses.id });

    if (inserted.length === 0) {
      logEvent("public_case_db.already_exists", { id });
      return { ok: true, status: "already_exists", id };
    }

    logEvent("public_case_db.inserted", { id });
    return { ok: true, status: "inserted", id };
  } catch (error) {
    const message = errorMessage(error);
    logEventError("public_case_db.insert_failed", undefined, { id });
    return { ok: false, status: "failed", id, error: message };
  }
}
