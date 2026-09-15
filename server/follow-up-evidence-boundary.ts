export type FollowUpEvidenceBoundary = Readonly<{
  analyzedInputTypes: readonly string[];
  evidenceProcessing: Readonly<{
    photo: "stored_for_human_review_not_analyzed" | "not_provided";
    audio: "stored_for_human_review_not_analyzed" | "not_provided";
    video: "stored_for_human_review_not_analyzed" | "not_provided";
    vibration: "stored_for_human_review_not_analyzed" | "not_provided";
  }>;
  analysisBoundary: string;
}>;

export function buildFollowUpEvidenceBoundary(input: { photoStored: boolean; audioStored: boolean; videoStored: boolean; vibrationStored: boolean }): FollowUpEvidenceBoundary {
  const inputTypes: string[] = ["description"];
  if (input.photoStored) inputTypes.push("photo");
  if (input.vibrationStored) inputTypes.push("vibration");
  if (input.audioStored) inputTypes.push("audio");
  if (input.videoStored) inputTypes.push("video");

  const analysisBoundary = inputTypes.length > 1
    ? "Text details were processed. Photos, audio, video, and vibration were processed as reviewer evidence."
    : "Text details were processed.";

  return Object.freeze({
    analyzedInputTypes: Object.freeze(inputTypes),
    evidenceProcessing: Object.freeze({
      photo: input.photoStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      audio: input.audioStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      video: input.videoStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      vibration: input.vibrationStored ? "stored_for_human_review_not_analyzed" : "not_provided",
    }),
    analysisBoundary,
  });
}
