export type DecisionPathId =
  | "professional_repair"
  | "diy_repair"
  | "sell_as_is"
  | "monitor_wait"
  | "walk_away";

export type RiskLevel =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "unknown";

export type ConfidenceLevel =
  | "low"
  | "moderate"
  | "high"
  | "insufficient_information";

export type IntakeScenario =
  | "current_problem"
  | "buying_vehicle"
  | "selling_vehicle"
  | "ownership_health_check"
  | "sitting_vehicle";

export type ReportTypeId =
  | "first_look_report"
  | "full_decision_report"
  | "human_review_add_on"
  | "buyer_remote_risk_review"
  | "seller_as_is_listing_pack";

export type DecisionPathDefinition = {
  id: DecisionPathId;
  label: string;
  description: string;
};

export type SafetyStopDrivingTrigger = {
  id: string;
  label: string;
  description: string;
};

export type ReportTypeDefinition = {
  id: ReportTypeId;
  label: string;
  description: string;
};

export const DRIVABLE_NORTH_STAR =
  "Drivable gives everyday people clear, confidence-rated vehicle information so they can decide whether to drive, fix, sell, buy, or walk away.";

export const DECISION_PATHS: readonly DecisionPathDefinition[] = [
  {
    id: "professional_repair",
    label: "Get It Repaired Professionally",
    description:
      "Take the vehicle and the available evidence to a qualified shop, mobile mechanic, specialist, or inspector."
  },
  {
    id: "diy_repair",
    label: "Fix It Yourself",
    description:
      "Consider a user-performed check or repair only when the risk, tools, complexity, and skill requirements are appropriate."
  },
  {
    id: "sell_as_is",
    label: "Sell or List It As-Is",
    description:
      "Prepare an honest condition summary and evidence-backed listing when repair is not the preferred path."
  },
  {
    id: "monitor_wait",
    label: "Wait and Monitor",
    description:
      "Monitor a lower-risk concern with clear warning signs, usage limits, and a defined follow-up point."
  },
  {
    id: "walk_away",
    label: "Walk Away or Do Not Buy",
    description:
      "Pause or leave a purchase when risk, missing evidence, seller claims, inspection access, or transaction conditions are unacceptable."
  }
] as const;

export const SAFETY_STOP_DRIVING_TRIGGERS: readonly SafetyStopDrivingTrigger[] = [
  {
    id: "brakes",
    label: "Brake Safety Risk",
    description:
      "Brake failure, severe braking loss, or braking behavior that makes the vehicle unsafe to control."
  },
  {
    id: "steering",
    label: "Steering Safety Risk",
    description:
      "Steering loss, binding, separation, or severe control problems."
  },
  {
    id: "overheating",
    label: "Overheating",
    description:
      "Overheating, active coolant loss, or severe temperature warnings."
  },
  {
    id: "fuel_leak",
    label: "Fuel Leak or Fire Risk",
    description:
      "Fuel leaks, strong fuel odor, or another indication of possible fire risk."
  },
  {
    id: "smoke_fire",
    label: "Smoke or Fire",
    description:
      "Active smoke, fire, or severe heat coming from the vehicle."
  },
  {
    id: "severe_electrical",
    label: "Severe Electrical Risk",
    description:
      "Electrical overheating, arcing, burning odor, or battery thermal risk."
  },
  {
    id: "wheel_tire_separation",
    label: "Wheel or Tire Separation Risk",
    description:
      "Wheel, tire, hub, bearing, suspension, or fastener conditions that suggest separation risk."
  },
  {
    id: "unsafe_drivability",
    label: "Unsafe Drivability",
    description:
      "Any condition where the vehicle cannot be driven predictably or safely."
  }
] as const;

export const REPORT_TYPES: readonly ReportTypeDefinition[] = [
  {
    id: "first_look_report",
    label: "First Look Report",
    description:
      "An initial review with possible causes, confidence, safety flags, missing evidence, and next checks."
  },
  {
    id: "full_decision_report",
    label: "Full Decision Report",
    description:
      "A complete evidence and decision-path report based on the information provided."
  },
  {
    id: "human_review_add_on",
    label: "Human Review Add-On",
    description:
      "An optional qualified human review that does not certify condition or replace physical inspection."
  },
  {
    id: "buyer_remote_risk_review",
    label: "Buyer Remote Risk Review",
    description:
      "A buyer-focused review of claims, evidence, gaps, red flags, questions, and walk-away conditions."
  },
  {
    id: "seller_as_is_listing_pack",
    label: "Seller As-Is Listing Pack",
    description:
      "A structured condition, evidence, disclosure, and listing-language package without certification or warranty."
  }
] as const;

