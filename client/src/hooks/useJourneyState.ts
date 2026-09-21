import { useState, useEffect, useCallback } from "react";

export type JourneyStep = "describe" | "evidence" | "review" | "complete";

export interface JourneyState {
  step: JourneyStep;
  setStep: (step: JourneyStep) => void;
  proceedToEvidence: () => void;
  proceedToReview: () => void;
  goToComplete: () => void;
  resetToDescribe: () => void;
}

export function useJourneyState(): JourneyState {
  const [step, setStep] = useState<JourneyStep>("describe");

  const proceedToEvidence = useCallback(() => {
    setStep("evidence");
  }, []);

  const proceedToReview = useCallback(() => {
    setStep("review");
  }, []);

  const goToComplete = useCallback(() => {
    setStep("complete");
  }, []);

  const resetToDescribe = useCallback(() => {
    setStep("describe");
  }, []);

  return {
    step,
    setStep,
    proceedToEvidence,
    proceedToReview,
    goToComplete,
    resetToDescribe,
  };
}