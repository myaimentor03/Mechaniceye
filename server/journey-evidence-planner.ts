import {
  type DrivableSeedEvidenceItem,
} from "../shared/schema";
import { type MatchedSymptom } from "./journey-symptom-classifier";

export type PlannedEvidenceItem = {
  evidenceId: string;
  label: string;
  description: string | null;
  evidenceType: string | null;
  safeCaptureInstructions: string | null;
  unsafeCaptureWarning: string | null;
  priority: string;
  customerPromptText: string | null;
  relevanceScore: number;
};

function parseUsefulCategories(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
}

function scoreEvidenceRelevance(
  evidence: DrivableSeedEvidenceItem,
  matchedSymptoms: MatchedSymptom[]
): number {
  const usefulFor = parseUsefulCategories(evidence.usefulForSymptomCategories);
  const matchedIds = new Set(matchedSymptoms.map((m) => m.symptomCategoryId));

  let matchCount = 0;
  for (const catId of usefulFor) {
    if (matchedIds.has(catId)) matchCount++;
  }

  if (matchCount === 0) return 0;

  const priorityBoost: Record<string, number> = {
    critical: 0.4,
    high: 0.3,
    medium: 0.2,
    low: 0.1,
  };
  const boost = priorityBoost[evidence.priority || "medium"] || 0.2;

  const baseScore = matchCount / usefulFor.length;
  return baseScore + boost;
}

export function planEvidence(
  matchedSymptoms: MatchedSymptom[],
  evidenceItems: DrivableSeedEvidenceItem[],
  alreadyProvided: { evidenceId?: string; kind?: string; description?: string }[] = [],
  maxItems: number = 5
): PlannedEvidenceItem[] {
  if (matchedSymptoms.length === 0 || evidenceItems.length === 0) {
    return [];
  }

  const providedDescriptions = new Set(
    alreadyProvided
      .map((e) => (e.description || "").toLowerCase().trim())
      .filter((d) => d.length > 0)
  );

  const scored: PlannedEvidenceItem[] = [];

  for (const evidence of evidenceItems) {
    const relevanceScore = scoreEvidenceRelevance(evidence, matchedSymptoms);
    if (relevanceScore <= 0) continue;

    const alreadyCovered = providedDescriptions.has(
      (evidence.label || "").toLowerCase().trim()
    );
    if (alreadyCovered) continue;

    scored.push({
      evidenceId: evidence.evidenceId,
      label: evidence.label,
      description: evidence.description,
      evidenceType: evidence.evidenceType,
      safeCaptureInstructions: evidence.safeCaptureInstructions,
      unsafeCaptureWarning: evidence.unsafeCaptureWarning,
      priority: evidence.priority || "medium",
      customerPromptText: evidence.customerPromptText,
      relevanceScore,
    });
  }

  scored.sort((a, b) => {
    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    const pa = priorityOrder[a.priority] ?? 2;
    const pb = priorityOrder[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return b.relevanceScore - a.relevanceScore;
  });

  return scored.slice(0, maxItems);
}

export function buildEvidencePrompt(
  evidence: PlannedEvidenceItem,
  safetyTriggered: boolean
): string {
  if (safetyTriggered) {
    return "This case has a safety trigger. Do not capture evidence if it requires driving or approaching danger. Only provide information you can safely share right now.";
  }

  const parts: string[] = [];

  parts.push(evidence.customerPromptText || `Can you provide: ${evidence.label}?`);

  if (evidence.safeCaptureInstructions) {
    parts.push(`How: ${evidence.safeCaptureInstructions}`);
  }

  if (evidence.unsafeCaptureWarning) {
    parts.push(`Warning: ${evidence.unsafeCaptureWarning}`);
  }

  return parts.join(" ");
}

export function getNextEvidenceToRequest(
  planned: PlannedEvidenceItem[],
  providedEvidence: { kind?: string; description?: string }[]
): PlannedEvidenceItem | undefined {
  const providedDescriptions = new Set(
    providedEvidence
      .map((e) => (e.description || "").toLowerCase().trim())
      .filter((d) => d.length > 0)
  );

  for (const item of planned) {
    if (!providedDescriptions.has((item.label || "").toLowerCase().trim())) {
      return item;
    }
  }

  return undefined;
}
