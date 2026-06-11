import type {
  ConfidenceLevel,
  DecisionPathId,
  IntakeScenario,
  ReportTypeId,
  RiskLevel
} from "./drivableDecisionEngine";
import type {
  DrivableDecisionPathRecommendation,
  DrivablePossibleCause,
  DrivableReport
} from "./drivableReportTypes";

export type MockDrivableIntakePayload = {
  intakeId: string;
  submittedAt: string;
  scenario: IntakeScenario;
  reportType: ReportTypeId;
  customer: {
    name: string;
    email?: string;
    phone?: string;
    goal?: string;
  };
  vehicle: {
    year: string;
    make: string;
    model: string;
    trim?: string;
    mileage?: string;
    vin?: string;
  };
  symptoms?: {
    description?: string;
    warningLights?: readonly string[];
    noise?: string;
    vibration?: string;
  };
  message?: string;
  media?: {
    photoLinks?: readonly string[];
    videoLinks?: readonly string[];
    audioLinks?: readonly string[];
    scanCodeScreenshots?: readonly string[];
  };
};

const SAFETY_PATTERN =
  /\b(brake|braking|steer|steering|overheat|overheating|fuel leak|smoke|fire|electrical burning|wheel loose|tire separation|unsafe|abs light)\b/i;

function scenarioGoal(scenario: IntakeScenario): string {
  const goals: Record<IntakeScenario, string> = {
    current_problem: "Understand the concern and decide whether to repair, monitor, or stop driving.",
    buying_vehicle: "Decide whether the vehicle is worth inspecting, negotiating for, or walking away from.",
    selling_vehicle: "Understand and explain the vehicle honestly before listing it.",
    ownership_health_check: "Decide whether the vehicle seems worth keeping, fixing, or monitoring.",
    sitting_vehicle: "Decide whether to revive, sell, or walk away from a sitting vehicle."
  };
  return goals[scenario];
}

function possibleCausesFor(text: string): readonly DrivablePossibleCause[] {
  const brakeRelated = /\b(brake|braking|abs)\b/i.test(text);
  const vibrationRelated = /\b(vibrat|shak)\w*/i.test(text);

  if (brakeRelated || vibrationRelated) {
    return [
      {
        id: "brake_rotor_pad",
        title: "Brake rotor or pad issue",
        confidence: brakeRelated && vibrationRelated ? "moderate" : "low",
        explanation:
          "Braking and vibration details can support a possible rotor, pad, caliper, or related brake path."
      },
      {
        id: "wheel_tire_suspension",
        title: "Wheel, tire, bearing, or suspension issue",
        confidence: "low",
        explanation:
          "Vehicle-speed vibration can also come from wheel, tire, bearing, or suspension conditions."
      },
      {
        id: "abs_sensor",
        title: "ABS sensor or related electrical concern",
        confidence: /\babs\b/i.test(text) ? "low" : "insufficient_information",
        explanation:
          "Warning-light behavior may require scan codes and wheel-speed data before confidence can improve."
      }
    ];
  }

  return [
    {
      id: "submitted_symptom_path",
      title: "Symptom-related mechanical concern",
      confidence: "low",
      explanation:
        "The submitted symptom may support several mechanical paths, but more specific evidence is needed."
    },
    {
      id: "maintenance_or_wear",
      title: "Maintenance or wear-related concern",
      confidence: "low",
      explanation:
        "Mileage, maintenance history, and recent repairs may materially change the likely path."
    },
    {
      id: "insufficient_evidence",
      title: "Another cause not shown by current evidence",
      confidence: "insufficient_information",
      explanation:
        "The information provided is not strong enough to responsibly narrow the concern further."
    }
  ];
}

function overallConfidence(causes: readonly DrivablePossibleCause[]): ConfidenceLevel {
  return causes.some((cause) => cause.confidence === "moderate")
    ? "moderate"
    : "insufficient_information";
}

function decisionRecommendations(
  scenario: IntakeScenario,
  highRisk: boolean
): readonly DrivableDecisionPathRecommendation[] {
  const recommendationByPath: Record<DecisionPathId, DrivableDecisionPathRecommendation> = {
    professional_repair: {
      pathId: "professional_repair",
      fit: highRisk ? "recommended" : "possible",
      recommendation: highRisk
        ? "Arrange a qualified in-person inspection before continued use or a major purchase decision."
        : "Consider a qualified inspection if the concern continues, worsens, or could affect safety."
    },
    diy_repair: {
      pathId: "diy_repair",
      fit: highRisk ? "not_recommended" : "conditional",
      recommendation: highRisk
        ? "Limit DIY work to safe evidence gathering unless the person has the proper tools and experience."
        : "Use DIY checks only when the risk, tools, and skill requirements are appropriate."
    },
    sell_as_is: {
      pathId: "sell_as_is",
      fit: scenario === "selling_vehicle" ? "recommended" : "conditional",
      recommendation:
        "If selling, disclose known symptoms and warning lights clearly and avoid unsupported repair claims."
    },
    monitor_wait: {
      pathId: "monitor_wait",
      fit: highRisk ? "not_recommended" : "possible",
      recommendation: highRisk
        ? "Do not rely on waiting or monitoring until safety-related causes have been inspected."
        : "Monitoring may fit only with clear warning signs, safe usage limits, and a follow-up point."
    },
    walk_away: {
      pathId: "walk_away",
      fit: scenario === "buying_vehicle" ? "possible" : "conditional",
      recommendation:
        scenario === "buying_vehicle"
          ? "Walk away if the seller refuses inspection, title verification, or reasonable evidence requests."
          : "Pause the decision when evidence, access, cost, or safety risk remains unacceptable."
    }
  };

  return Object.values(recommendationByPath);
}

export function buildMockDrivableReportFromIntake(
  intake: MockDrivableIntakePayload
): DrivableReport {
  const symptomText = [
    intake.symptoms?.description,
    intake.symptoms?.warningLights?.join(", "),
    intake.symptoms?.noise,
    intake.symptoms?.vibration,
    intake.message
  ].filter(Boolean).join(" ");
  const highRisk = SAFETY_PATTERN.test(symptomText);
  const possibleCauses = possibleCausesFor(symptomText);
  const confidence = overallConfidence(possibleCauses);
  const riskLevel: RiskLevel = highRisk ? "high" : "unknown";
  const generatedAt = new Date(intake.submittedAt).toISOString();
  const hasPhotos = Boolean(intake.media?.photoLinks?.length);
  const hasVideo = Boolean(intake.media?.videoLinks?.length);
  const hasCodes = Boolean(intake.media?.scanCodeScreenshots?.length);

  return {
    reportId: `MOCK-${intake.intakeId}`,
    reportType: intake.reportType,
    scenario: intake.scenario,
    status: highRisk ? "needs_human_review" : "draft",
    submittedAt: intake.submittedAt,
    generatedAt,
    customer: {
      name: intake.customer.name,
      email: intake.customer.email,
      phone: intake.customer.phone,
      goal: intake.customer.goal || scenarioGoal(intake.scenario)
    },
    vehicle: { ...intake.vehicle },
    plainEnglishSummary:
      highRisk
        ? "Based on the information provided, this vehicle has a possible safety-related concern that should be checked in person before heavy driving or a major spending decision."
        : "Based on the information provided, several possible causes remain and more evidence would improve confidence before money is spent.",
    possibleCauses,
    supportingEvidence: [
      {
        id: "submitted_symptoms",
        label: intake.symptoms?.description || intake.message || "Customer submitted a vehicle concern.",
        source: "customer"
      },
      ...(intake.symptoms?.warningLights?.length
        ? [{
            id: "warning_lights",
            label: `Warning lights: ${intake.symptoms.warningLights.join(", ")}`,
            source: "customer" as const
          }]
        : []),
      ...(intake.symptoms?.vibration
        ? [{
            id: "vibration",
            label: intake.symptoms.vibration,
            source: "customer" as const
          }]
        : [])
    ],
    missingInformation: [
      ...(!hasPhotos
        ? [{
            id: "photos",
            label: "Relevant photos",
            reason: "Photos of warning lights, tires, wheels, leaks, damage, or the engine bay may improve context.",
            priority: "important" as const
          }]
        : []),
      ...(!hasVideo
        ? [{
            id: "cold_start_video",
            label: "Cold start or symptom video",
            reason: "A safely captured video can show warning lights, startup behavior, vibration, or visible symptoms.",
            priority: "helpful" as const
          }]
        : []),
      ...(!hasCodes
        ? [{
            id: "scan_codes",
            label: "Scan codes or scanner screenshot",
            reason: "Codes and freeze-frame information may materially change the likely paths.",
            priority: "important" as const
          }]
        : []),
      {
        id: "in_person_inspection",
        label: "In-person inspection",
        reason: "Physical inspection is needed before confirming a cause, condition, or safety decision.",
        priority: highRisk ? "critical" : "important"
      }
    ],
    urgencySafetyRating: {
      level: riskLevel,
      headline: highRisk
        ? "Human review and in-person inspection recommended"
        : "Safety cannot be confirmed from current information",
      guidance: highRisk
        ? "Do not treat this report as clearance to drive, buy, or approve repairs. Seek qualified in-person help."
        : "Watch for worsening symptoms and arrange inspection when safety, reliability, or cost is uncertain.",
      limitation:
        "The available information supports possible causes and next checks, not a confirmed diagnosis."
    },
    decisionPaths: decisionRecommendations(intake.scenario, highRisk),
    mechanicScript: {
      title: "What to tell the shop",
      script:
        `The vehicle is a ${intake.vehicle.year} ${intake.vehicle.make} ${intake.vehicle.model}. ` +
        `${intake.symptoms?.description || intake.message || "The customer has a vehicle concern."} ` +
        "Please inspect and test the relevant systems, explain the evidence, and confirm the cause before replacing parts.",
      requestedChecks: [
        "Verify the submitted symptom under safe conditions",
        "Inspect related safety and wear components",
        "Scan relevant control modules when warning lights are present",
        "Explain test results before recommending parts"
      ]
    },
    nextQuestions: [
      "When does the concern happen and how often?",
      "Does it change with speed, braking, turning, temperature, or acceleration?",
      "Which warning lights stay on or come and go?",
      "What recent repairs or maintenance were completed?"
    ],
    safetyNotice: {
      level: riskLevel,
      headline: "Informational guidance only",
      guidance:
        "Major safety, title, structural, or high-cost decisions may require an independent in-person inspection.",
      limitation:
        "Drivable provides informational, confidence-rated guidance based on the information provided. This is not a certified diagnosis, inspection, safety clearance, title verification, or repair guarantee."
    },
    internalReviewRequired: highRisk || confidence === "insufficient_information"
  };
}

export const SAMPLE_DRIVABLE_INTAKE_PAYLOAD: MockDrivableIntakePayload = {
  intakeId: "2014-CAMRY-BRAKE-TEST",
  submittedAt: "2026-06-10T15:30:00.000Z",
  scenario: "buying_vehicle",
  reportType: "first_look_report",
  customer: {
    name: "Test Customer",
    email: "test.customer@example.com",
    phone: "(555) 010-2014",
    goal: "Decide whether this Camry is worth inspecting, negotiating for, or walking away from."
  },
  vehicle: {
    year: "2014",
    make: "Toyota",
    model: "Camry",
    trim: "SE",
    mileage: "138,400 miles"
  },
  symptoms: {
    description: "The steering wheel vibrates while braking above 40 mph.",
    warningLights: ["Intermittent ABS light"],
    noise: "No clear noise description provided.",
    vibration: "Steering-wheel vibration appears during braking."
  },
  message:
    'The seller says it "only needs pads," but no inspection or scan-code screenshot was provided.',
  media: {
    photoLinks: [],
    videoLinks: [],
    audioLinks: [],
    scanCodeScreenshots: []
  }
};

export const SAMPLE_GENERATED_DRIVABLE_REPORT =
  buildMockDrivableReportFromIntake(SAMPLE_DRIVABLE_INTAKE_PAYLOAD);
