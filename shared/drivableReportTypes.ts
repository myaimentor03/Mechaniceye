import type {
  ConfidenceLevel,
  DecisionPathId,
  IntakeScenario,
  ReportTypeId,
  RiskLevel
} from "./drivableDecisionEngine";

export type DrivableReviewStatus =
  | "sample_preview"
  | "draft"
  | "needs_human_review"
  | "approved"
  | "customer_ready"
  | "delivered";

export type DrivableReportVehicle = {
  year: string;
  make: string;
  model: string;
  trim?: string;
  mileage?: string;
  vin?: string;
};

export type DrivableReportCustomer = {
  name: string;
  email?: string;
  phone?: string;
  goal: string;
};

export type DrivablePossibleCause = {
  id: string;
  title: string;
  confidence: ConfidenceLevel;
  explanation: string;
};

export type DrivableEvidenceItem = {
  id: string;
  label: string;
  detail?: string;
  source?: "customer" | "seller" | "media" | "scan_code" | "history" | "observation";
};

export type DrivableMissingInfoItem = {
  id: string;
  label: string;
  reason: string;
  priority: "helpful" | "important" | "critical";
};

export type DrivableDecisionPathRecommendation = {
  pathId: DecisionPathId;
  recommendation: string;
  fit: "recommended" | "possible" | "not_recommended" | "conditional";
};

export type DrivableMechanicScript = {
  title: string;
  script: string;
  requestedChecks: readonly string[];
};

export type DrivableSafetyNotice = {
  level: RiskLevel;
  headline: string;
  guidance: string;
  limitation: string;
};

export type DrivableReport = {
  reportId: string;
  reportType: ReportTypeId;
  scenario: IntakeScenario;
  status: DrivableReviewStatus;
  submittedAt: string;
  generatedAt: string;
  customer: DrivableReportCustomer;
  vehicle: DrivableReportVehicle;
  plainEnglishSummary: string;
  possibleCauses: readonly DrivablePossibleCause[];
  supportingEvidence: readonly DrivableEvidenceItem[];
  missingInformation: readonly DrivableMissingInfoItem[];
  urgencySafetyRating: DrivableSafetyNotice;
  decisionPaths: readonly DrivableDecisionPathRecommendation[];
  mechanicScript: DrivableMechanicScript;
  nextQuestions: readonly string[];
  safetyNotice: DrivableSafetyNotice;
  internalReviewRequired: boolean;
};

export const SAMPLE_DRIVABLE_REPORT: DrivableReport = {
  reportId: "DRV-SAMPLE-2014-CAMRY",
  reportType: "first_look_report",
  scenario: "buying_vehicle",
  status: "sample_preview",
  submittedAt: "2026-06-10T15:30:00.000Z",
  generatedAt: "2026-06-10T15:35:00.000Z",
  customer: {
    name: "Test Customer",
    email: "test.customer@example.com",
    phone: "(555) 010-2014",
    goal: "Decide whether this vehicle is worth inspecting, negotiating for, or walking away from."
  },
  vehicle: {
    year: "2014",
    make: "Toyota",
    model: "Camry",
    trim: "SE",
    mileage: "138,400 miles"
  },
  plainEnglishSummary:
    "Based on the information provided, this vehicle shows signs of a brake or vibration issue that should be checked before money is spent or the vehicle is driven heavily.",
  possibleCauses: [
    {
      id: "brake_rotor_pad",
      title: "Brake rotor or pad issue",
      confidence: "moderate",
      explanation: "Vibration during braking most strongly supports a possible front brake or rotor concern."
    },
    {
      id: "front_suspension_bearing",
      title: "Front suspension or wheel bearing issue",
      confidence: "low",
      explanation: "A wheel, bearing, tire, or suspension issue remains possible without a detailed road test."
    },
    {
      id: "abs_sensor",
      title: "ABS or sensor-related concern",
      confidence: "low",
      explanation: "The intermittent ABS light may indicate a separate sensor, wiring, or wheel-speed concern."
    }
  ],
  supportingEvidence: [
    { id: "braking_vibration", label: "Vibration while braking", source: "customer" },
    { id: "abs_light", label: "Intermittent ABS light", source: "customer" },
    { id: "seller_claim", label: 'Seller says it "only needs pads"', source: "seller" },
    { id: "no_inspection", label: "No in-person inspection has been completed", source: "observation" }
  ],
  missingInformation: [
    {
      id: "cold_start_video",
      label: "Cold start video",
      reason: "Helps identify warning lights, startup behavior, and unrelated engine concerns.",
      priority: "helpful"
    },
    {
      id: "brake_photos",
      label: "Brake inspection photos",
      reason: "Could show visible rotor, pad, caliper, or wear concerns.",
      priority: "important"
    },
    {
      id: "scan_codes",
      label: "Scan code screenshot",
      reason: "Needed to understand the intermittent ABS warning.",
      priority: "important"
    },
    {
      id: "test_drive",
      label: "Braking and vibration details",
      reason: "Speed, pedal feel, steering-wheel movement, and braking conditions would improve confidence.",
      priority: "critical"
    },
    {
      id: "tire_wheel_photos",
      label: "Tire and wheel condition photos",
      reason: "Could reveal wear, damage, or wheel concerns that contribute to vibration.",
      priority: "important"
    }
  ],
  urgencySafetyRating: {
    level: "high",
    headline: "Needs inspection before a purchase or heavy-driving decision",
    guidance:
      "Do not treat this vehicle as cleared for driving or purchase. Brake, steering, wheel, tire, overheating, fuel leak, smoke, or severe electrical concerns may require immediate in-person inspection.",
    limitation:
      "The available information is not enough to confirm the cause or establish that the vehicle is safe."
  },
  decisionPaths: [
    {
      pathId: "professional_repair",
      fit: "recommended",
      recommendation: "Arrange an independent brake, wheel, tire, suspension, and ABS inspection before purchase."
    },
    {
      pathId: "diy_repair",
      fit: "not_recommended",
      recommendation: "Limit DIY work to safe evidence gathering unless the person has proper brake and scan-tool experience."
    },
    {
      pathId: "sell_as_is",
      fit: "conditional",
      recommendation: "If selling instead, disclose the vibration and ABS light clearly and avoid unsupported repair claims."
    },
    {
      pathId: "monitor_wait",
      fit: "not_recommended",
      recommendation: "Waiting is not a strong path until safety-related causes have been inspected."
    },
    {
      pathId: "walk_away",
      fit: "possible",
      recommendation: "Walk away if the seller refuses inspection, title verification, scan results, or reasonable evidence requests."
    }
  ],
  mechanicScript: {
    title: "What to tell the shop",
    script:
      "The vehicle vibrates while braking above 40 mph and the ABS light is intermittent. Please inspect the front brakes, rotors, calipers, wheel bearings, suspension, tires, and scan the ABS system before recommending parts.",
    requestedChecks: [
      "Front brake pads, rotors, and calipers",
      "Wheel bearings and front suspension",
      "Tire and wheel condition",
      "ABS scan codes and wheel-speed sensor data"
    ]
  },
  nextQuestions: [
    "Does the ABS light stay on or come and go?",
    "Does the vibration happen only while braking?",
    "Is the steering wheel shaking or the whole car?",
    "Can the seller provide a cold start and braking video?"
  ],
  safetyNotice: {
    level: "high",
    headline: "Informational guidance only",
    guidance:
      "Major safety, title, structural, or high-cost decisions may require an independent in-person inspection.",
    limitation:
      "Drivable provides informational, confidence-rated guidance based on the information provided. This is not a certified diagnosis, inspection, safety clearance, title verification, or repair guarantee."
  },
  internalReviewRequired: true
};
