import { useEffect, useState, useCallback } from "react";

const DRAFT_KEY = "drivable_evidence_draft_v1";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface EvidenceDraft {
  description: string;
  vehicleInfo: string;
  timing: string;
  updatedAt: string;
}

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

export function useEvidenceDraft(formData: { description: string; vehicleInfo: string; timing: string }) {
  const [draftAvailable, setDraftAvailable] = useState<EvidenceDraft | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const draft = loadEvidenceDraft();
    const hasCurrentInput = Boolean(formData.description || formData.vehicleInfo || formData.timing);
    if (draft && !hasCurrentInput) {
      setDraftAvailable(draft);
    }
  }, []); // run once on mount

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

  const restore = useCallback(() => {
    if (!draftAvailable) return null;
    setDismissed(true);
    return draftAvailable;
  }, [draftAvailable]);

  const discard = useCallback(() => {
    clearEvidenceDraft();
    setDraftAvailable(null);
    setDismissed(true);
  }, []);

  const clearAfterSubmit = useCallback(() => {
    clearEvidenceDraft();
    setDraftAvailable(null);
  }, []);

  const showBanner = Boolean(draftAvailable && !dismissed);

  return { draftAvailable, showBanner, restore, discard, clearAfterSubmit };
}
