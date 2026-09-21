import { useEffect, useState, useCallback } from "react";

const DRAFT_KEY = "drivable_evidence_draft_v1";
const JOURNEY_KEY = "drivable_journey_step_v1";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface EvidenceDraft {
  description: string;
  vehicleInfo: string;
  timing: string;
  updatedAt: string;
}

export type JourneyStep = "describe" | "evidence" | "review" | "complete";

export interface JourneyStepRecord {
  step: JourneyStep;
  updatedAt: string;
}

const VALID_JOURNEY_STEPS: readonly JourneyStep[] = ["describe", "evidence", "review", "complete"];

export function loadEvidenceDraft(): EvidenceDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EvidenceDraft;
    if (!parsed.updatedAt) return null;
    const age = Date.now() - new Date(parsed.updatedAt).getTime();
    if (!Number.isFinite(age) || age > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    if (!parsed.description && !parsed.vehicleInfo && !parsed.timing) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearEvidenceDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function saveEvidenceDraft(draft: Omit<EvidenceDraft, "updatedAt">) {
  if (!draft.description && !draft.vehicleInfo && !draft.timing) {
    clearEvidenceDraft();
    return;
  }
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // localStorage may be unavailable or full; ignore silently
  }
}

export function loadJourneyStep(): JourneyStepRecord | null {
  try {
    const raw = localStorage.getItem(JOURNEY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JourneyStepRecord;
    if (!parsed.step) return null;
    if (!(VALID_JOURNEY_STEPS as readonly string[]).includes(parsed.step)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveJourneyStep(step: JourneyStep) {
  try {
    localStorage.setItem(
      JOURNEY_KEY,
      JSON.stringify({ step, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // localStorage may be unavailable or full; ignore silently
  }
}

export function clearJourneyStep() {
  try {
    localStorage.removeItem(JOURNEY_KEY);
  } catch {
    // ignore
  }
}

export function useEvidenceDraft(formData: { description: string; vehicleInfo: string; timing: string }) {
  const [draftAvailable, setDraftAvailable] = useState<EvidenceDraft | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [journeyStep, setJourneyStep] = useState<JourneyStep>("describe");

  useEffect(() => {
    const draft = loadEvidenceDraft();
    const hasCurrentInput = Boolean(formData.description || formData.vehicleInfo || formData.timing);
    if (draft && !hasCurrentInput) {
      setDraftAvailable(draft);
    }
  }, []); // run once on mount

  useEffect(() => {
    const stored = loadJourneyStep();
    if (stored) {
      setJourneyStep(stored.step);
    }
  }, []);

  // Autosave when text fields change (debounced via effect)
  useEffect(() => {
    const handle = window.setTimeout(() => {
      saveEvidenceDraft({
        description: formData.description,
        vehicleInfo: formData.vehicleInfo,
        timing: formData.timing,
      });
    }, 600);
    return () => window.clearTimeout(handle);
  }, [formData.description, formData.vehicleInfo, formData.timing]);

  // Persist journey step on change
  useEffect(() => {
    saveJourneyStep(journeyStep);
  }, [journeyStep]);

  const restore = useCallback(() => {
    if (!draftAvailable) return null;
    setDismissed(true);
    return draftAvailable;
  }, [draftAvailable]);

  const discard = useCallback(() => {
    clearEvidenceDraft();
    setDraftAvailable(null);
    setDismissed(true);
    clearJourneyStep();
    setJourneyStep("describe");
  }, []);

  const clearAfterSubmit = useCallback(() => {
    clearEvidenceDraft();
    setDraftAvailable(null);
    clearJourneyStep();
  }, []);

  const showBanner = Boolean(draftAvailable && !dismissed);

  return { draftAvailable, showBanner, restore, discard, clearAfterSubmit, journeyStep, setJourneyStep };
}
