import { getDrivableAiMode } from "./drivable-ai-mode";

export const MOCK_CUSTOMER_WARNING =
  "Test response only. Not a real diagnosis or safety clearance.";

export type MockDrivableReportInput = {
  reportType?: string;
  scenario?: string;
  vehicleSummary?: string;
  symptomSummary?: string;
};

export type MockDrivableReport = {
  aiMode: "mock";
  reviewStatus: "mock_test_only";
  reportType: string;
  scenario: string;
  vehicleSummary: string;
  symptomSummary: string;
  possibleCauses: string[];
  riskLevel: "low";
  confidenceLevel: "low";
  missingInformation: string[];
  recommendedNextSteps: string[];
  safetyWarning: string;
  customerFacingWarning: string;
  internalNote: string;
};

export type MockAiPayloadFields = {
  aiMode: "mock";
  reviewStatus: "mock_test_only";
  mockReport: MockDrivableReport | null;
  needsHumanReview: true;
  customerFacingWarning: string;
  mockReportBlockedReason?: string;
};

const CRITICAL_RISK_PATTERN =
  /\b(brake failure|braking loss|no brakes|steering loss|cannot steer|overheat(?:ing)?|fuel leak|gasoline leak|smoke|fire|burning smell|oil pressure|wheel loose|wheel separation|tire separation|shaking violently|unsafe to drive|loss of control)\b/i;

function safeText(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function hasCriticalDrivableRiskSignals(input: MockDrivableReportInput) {
  return CRITICAL_RISK_PATTERN.test(
    `${input.vehicleSummary || ""} ${input.symptomSummary || ""}`
  );
}

function possibleCausesForScenario(scenario: string) {
  if (scenario === "selling_vehicle") {
    return [
      "A possible maintenance or wear concern based on information provided",
      "A possible condition or disclosure gap that needs human review"
    ];
  }

  if (scenario === "buying_vehicle") {
    return [
      "A possible vehicle-condition concern based on information provided",
      "A possible evidence or seller-claim gap that needs independent review"
    ];
  }

  return [
    "A possible symptom-related mechanical concern based on information provided",
    "A possible maintenance or wear concern that needs human review"
  ];
}

export function buildMockDrivableReport(
  input: MockDrivableReportInput
): MockDrivableReport {
  const scenario = safeText(input.scenario, "current_problem");

  return {
    aiMode: "mock",
    reviewStatus: "mock_test_only",
    reportType: safeText(input.reportType, "first_look_report"),
    scenario,
    vehicleSummary: safeText(input.vehicleSummary, "Vehicle details not provided"),
    symptomSummary: safeText(
      input.symptomSummary,
      "No detailed symptom summary was provided."
    ),
    possibleCauses: possibleCausesForScenario(scenario),
    riskLevel: "low",
    confidenceLevel: "low",
    missingInformation: [
      "Qualified in-person inspection findings",
      "Relevant warning lights, scan codes, photos, or video",
      "Recent repair and maintenance history"
    ],
    recommendedNextSteps: [
      "Have a human review the intake and mock output.",
      "Request missing evidence before making a repair, purchase, sale, or driving decision.",
      "Use a qualified in-person inspection when condition or safety is uncertain."
    ],
    safetyWarning:
      "This mock report cannot determine whether a vehicle is safe to drive. Stop testing this flow and seek qualified help if critical risk signals are present.",
    customerFacingWarning: MOCK_CUSTOMER_WARNING,
    internalNote:
      "Mock test data only. Not a certified diagnosis, repair guarantee, or safety clearance. Needs human review and must not be sent as a real customer report."
  };
}

export function buildDrivableAiPayloadFields(
  input: MockDrivableReportInput
): Partial<MockAiPayloadFields> {
  if (getDrivableAiMode() !== "mock") {
    return {};
  }

  if (hasCriticalDrivableRiskSignals(input)) {
    return {
      aiMode: "mock",
      reviewStatus: "mock_test_only",
      mockReport: null,
      needsHumanReview: true,
      customerFacingWarning: MOCK_CUSTOMER_WARNING,
      mockReportBlockedReason:
        "Critical risk signals detected. Mock diagnosis content was withheld; qualified human and in-person safety review are required."
    };
  }

  return {
    aiMode: "mock",
    reviewStatus: "mock_test_only",
    mockReport: buildMockDrivableReport(input),
    needsHumanReview: true,
    customerFacingWarning: MOCK_CUSTOMER_WARNING
  };
}
