import {
  type DrivableSeedSymptomCategory,
} from "../shared/schema";

export type MatchedSymptom = {
  symptomCategoryId: string;
  label: string;
  confidence: number;
  matchedPhrases: string[];
  possibleRiskLevel: string;
  safetyNote: string | null;
  humanReviewRecommended: boolean;
  recommendedInitialPath: string | null;
  commonEvidenceNeeded: string | null;
};

const PHRASE_INDEX: Map<string, { category: DrivableSeedSymptomCategory; phrases: string[] }> = new Map();

function buildPhraseIndex(categories: DrivableSeedSymptomCategory[]): void {
  PHRASE_INDEX.clear();
  for (const cat of categories) {
    const rawPhrases = cat.commonCustomerPhrases || "";
    const phrases = rawPhrases
      .split(";")
      .map((p: string) => p.trim().toLowerCase())
      .filter((p: string) => p.length > 0);
    if (phrases.length > 0) {
      PHRASE_INDEX.set(cat.symptomCategoryId, { category: cat, phrases });
    }
  }
}

const HIGH_RISK_KEYWORDS: Record<string, string[]> = {
  no_start: ["nothing happens", "car will not start", "will not start", "dead", "no power"],
  crank_no_start: ["cranks", "turns over", "cranking", "will not fire"],
  starts_then_dies: ["starts then", "shuts off", "will not stay running", "stalls"],
  rough_idle: ["shakes at idle", "idle is lumpy", "rough idle", "idles rough"],
  misfire: ["engine is missing", "flashing check engine", "misfire", "skipping"],
  loss_of_power: ["no power", "struggles uphill", "cannot accelerate", "loses power", "limp mode"],
  overheating: ["overheating", "over heat", "temperature gauge", "hot", "temp warning", "steam"],
  coolant_leak: ["coolant leak", "puddle", "losing coolant", "green puddle", "pink puddle"],
  oil_pressure_warning: ["oil pressure", "oil can light", "low oil", "oil warning"],
  brake_noise: ["brakes squeak", "grinding when stopping", "brake noise", "squealing brakes"],
  brake_vibration: ["steering shakes when braking", "pedal pulses", "brake vibration", "shakes braking"],
  soft_brake_pedal: ["pedal goes to floor", "brakes feel mushy", "soft pedal", "brake pedal sinks"],
  steering_pull: ["pulls left", "pulls right", "will not track", "drifts", "pulling"],
  steering_loss: ["cannot steer", "steering wheel loose", "steering loss", "wheel got heavy"],
  suspension_clunk: ["clunks over bumps", "front end knocks", "clunk", "suspension noise"],
  wheel_bearing_noise: ["wheel hum", "growl", "bearing noise", "humming wheel"],
  tire_wheel_vibration: ["shakes on highway", "steering wheel vibrates", "tire vibration", "wheel vibration"],
  transmission_slip: ["revs but barely moves", "slipping gears", "transmission slip", "revs up"],
  transmission_no_engage: ["goes into gear but will not move", "no engage", "will not move"],
  electrical_dead_battery: ["battery is dead", "only clicks", "dead battery", "no electrical"],
  charging_warning: ["battery light is on", "alternator warning", "charging warning"],
  fuel_smell: ["smells like gas", "raw fuel odor", "fuel smell", "gas smell"],
  fuel_leak: ["gas dripping", "fuel puddle", "fuel leak", "gas leak"],
  smoke_from_engine: ["smoke under hood", "engine bay smoking", "smoke from", "steam from"],
  burning_smell: ["burning plastic", "hot rubber smell", "burning smell", "burning odor"],
  check_engine_light: ["check engine light", "service engine soon", "engine warning"],
  abs_light: ["abs light", "anti-lock warning", "abs warning"],
  airbag_light: ["srs light", "airbag warning", "airbag light"],
  weird_noise: ["weird sound", "rattle", "hum", "unfamiliar noise", "strange noise"],
};

function matchDescriptionToSymptoms(
  description: string,
  categories: DrivableSeedSymptomCategory[]
): MatchedSymptom[] {
  const combined = description.toLowerCase();
  const results: MatchedSymptom[] = [];

  for (const cat of categories) {
    const highRiskKws = HIGH_RISK_KEYWORDS[cat.symptomCategoryId] || [];
    const matchedPhrases: string[] = [];

    for (const kw of highRiskKws) {
      if (combined.includes(kw)) {
        matchedPhrases.push(kw);
      }
    }

    if (matchedPhrases.length > 0) {
      const confidence = Math.min(0.4 + matchedPhrases.length * 0.2, 1.0);
      results.push({
        symptomCategoryId: cat.symptomCategoryId,
        label: cat.label,
        confidence,
        matchedPhrases,
        possibleRiskLevel: cat.possibleRiskLevel || "unknown",
        safetyNote: cat.safetyNote,
        humanReviewRecommended: cat.humanReviewRecommended === true || cat.humanReviewRecommended === ("true" as any),
        recommendedInitialPath: cat.recommendedInitialPath,
        commonEvidenceNeeded: cat.commonEvidenceNeeded,
      });
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

export function classifySymptoms(
  description: string,
  timing?: string,
  urgency?: string,
  canDrive?: string,
  categories?: DrivableSeedSymptomCategory[]
): MatchedSymptom[] {
  if (!categories || categories.length === 0) {
    return [];
  }

  if (PHRASE_INDEX.size === 0) {
    buildPhraseIndex(categories);
  }

  const combinedText = [
    description || "",
    timing || "",
    urgency || "",
    canDrive || "",
  ].join(" ");

  return matchDescriptionToSymptoms(combinedText, categories);
}

export function getTopSymptomCategory(
  matches: MatchedSymptom[]
): MatchedSymptom | undefined {
  return matches[0];
}

export function shouldRequestHumanReview(matches: MatchedSymptom[]): boolean {
  return matches.some((m) => m.humanReviewRecommended);
}

export function isCriticalRisk(matches: MatchedSymptom[]): boolean {
  return matches.some((m) => m.possibleRiskLevel === "critical");
}

export function resetPhraseIndex(): void {
  PHRASE_INDEX.clear();
}
