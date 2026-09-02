export type FollowUpEvidenceBoundary = Readonly<{
  analyzedInputTypes: readonly ["description"];
  evidenceProcessing: Readonly<{
    audio: "stored_for_human_review_not_analyzed" | "not_provided";
    video: "stored_for_human_review_not_analyzed" | "not_provided";
    vibration: "unsupported_not_stored";
  }>;
  analysisBoundary: string;
}>;

export function buildFollowUpEvidenceBoundary(input: { audioStored: boolean; videoStored: boolean }): FollowUpEvidenceBoundary {
  return Object.freeze({
    analyzedInputTypes: Object.freeze(["description"] as const),
    evidenceProcessing: Object.freeze({
      audio: input.audioStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      video: input.videoStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      vibration: "unsupported_not_stored",
    }),
    analysisBoundary: "Text details were processed. Audio and video were not analyzed by the model.",
  });
}
