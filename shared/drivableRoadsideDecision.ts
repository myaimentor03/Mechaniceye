export type RoadsideDecisionMode =
  | "roadside_now"
  | "can_i_keep_driving"
  | "limp_to_safe_place"
  | "temporary_fix"
  | "complete_repair_path"
  | "tow_or_stop_now";

export type RoadsideRiskLevel =
  | "low"
  | "moderate"
  | "high"
  | "critical";

export type RoadsideRecommendedAction =
  | "continue_with_caution"
  | "drive_to_nearest_safe_place"
  | "do_not_drive"
  | "call_tow"
  | "request_more_information"
  | "try_basic_safe_check"
  | "seek_in_person_inspection"
  | "complete_repair_required";

export type RoadsideConfidenceLevel =
  | "low"
  | "moderate"
  | "high";

export const ROADSIDE_DECISION_MODES: readonly RoadsideDecisionMode[] = [
  "roadside_now",
  "can_i_keep_driving",
  "limp_to_safe_place",
  "temporary_fix",
  "complete_repair_path",
  "tow_or_stop_now"
] as const;

export const ROADSIDE_RISK_LEVELS: readonly RoadsideRiskLevel[] = [
  "low",
  "moderate",
  "high",
  "critical"
] as const;

export const ROADSIDE_RECOMMENDED_ACTIONS: readonly RoadsideRecommendedAction[] = [
  "continue_with_caution",
  "drive_to_nearest_safe_place",
  "do_not_drive",
  "call_tow",
  "request_more_information",
  "try_basic_safe_check",
  "seek_in_person_inspection",
  "complete_repair_required"
] as const;

export const ROADSIDE_CONFIDENCE_LEVELS: readonly RoadsideConfidenceLevel[] = [
  "low",
  "moderate",
  "high"
] as const;

export const ROADSIDE_SAFETY_CRITICAL_TRIGGERS = [
  "brake failure",
  "steering loss",
  "overheating",
  "fuel leak",
  "smoke/fire smell",
  "severe electrical issue",
  "wheel/tire failure",
  "loss of power in traffic",
  "oil pressure warning",
  "coolant temperature warning",
  "transmission will not engage",
  "engine knocking",
  "vehicle unstable or shaking violently"
] as const;

export type RoadsideSafetyCriticalTrigger =
  (typeof ROADSIDE_SAFETY_CRITICAL_TRIGGERS)[number];

export interface DrivableRoadsideDecision {
  mode: RoadsideDecisionMode;
  riskLevel: RoadsideRiskLevel;
  confidence: RoadsideConfidenceLevel;
  recommendedAction: RoadsideRecommendedAction;
  plainEnglishSummary: string;
  stopNowReasons: readonly string[];
  safeChecks: readonly string[];
  temporaryActions: readonly string[];
  completeRepairPath: readonly string[];
  missingInformation: readonly string[];
  mechanicScript: string;
  towRecommendation: string;
  safetyNotice: string;
  humanReviewRequired: boolean;
}

export const SAMPLE_ROADSIDE_DECISION: DrivableRoadsideDecision = {
  mode: "can_i_keep_driving",
  riskLevel: "high",
  confidence: "moderate",
  recommendedAction: "drive_to_nearest_safe_place",
  plainEnglishSummary:
    "A 2014 Toyota Camry with brake vibration and an intermittent ABS light may have a brake, wheel-speed sensor, tire, wheel, bearing, or suspension concern. The information provided does not confirm the cause or establish that the car is safe to drive home.",
  stopNowReasons: [
    "The brake pedal feels soft, sinks, or requires much more distance to stop.",
    "The red brake warning light appears or the ABS light stays on with changed braking behavior.",
    "The vehicle pulls hard, shakes violently, smells hot, smokes, or becomes difficult to control."
  ],
  safeChecks: [
    "While parked safely, check for a red brake warning light and visible fluid near the wheels or under the vehicle.",
    "Confirm that each tire looks inflated and that no wheel or tire has obvious damage.",
    "Note whether the vibration occurs only during braking and whether it is felt in the pedal, steering wheel, or whole vehicle."
  ],
  temporaryActions: [
    "If braking remains normal and no stop-now condition is present, use only the shortest low-speed route to the nearest safe place.",
    "Leave extra following distance, avoid highways and heavy traffic, and do not continue if the symptom worsens."
  ],
  completeRepairPath: [
    "Have a qualified shop inspect the brake pads, rotors, calipers, tires, wheels, bearings, and front suspension.",
    "Scan the ABS system and review wheel-speed sensor data before replacing parts.",
    "Confirm the cause with physical inspection and testing, then complete the required repair before normal driving."
  ],
  missingInformation: [
    "Brake pedal feel and stopping-distance changes",
    "Whether the red brake warning light is on",
    "ABS diagnostic codes and wheel-speed data",
    "The speed and conditions that trigger the vibration",
    "Photos or inspection results for brakes, tires, and wheels"
  ],
  mechanicScript:
    "I have a 2014 Toyota Camry with vibration while braking and an intermittent ABS light. Please inspect the brakes, rotors, calipers, tires, wheels, bearings, and front suspension, and scan the ABS system before recommending parts.",
  towRecommendation:
    "Tow the vehicle instead of driving if braking feels reduced or unpredictable, a red brake warning appears, fluid is leaking, the vehicle becomes unstable, or any stop-now symptom is present.",
  safetyNotice:
    "This is informational, confidence-rated guidance based only on the details provided. It is not a diagnosis or safety clearance. When braking or vehicle control is uncertain, stop in a safe place and seek qualified in-person help.",
  humanReviewRequired: true
};
