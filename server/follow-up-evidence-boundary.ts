export type FollowUpEvidenceBoundary = Readonly<{
  receivedInputTypes: readonly string[];
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
  const receivedInputTypes = ["description"];
  const analyzedInputTypes = ["description"];
  const storedEvidenceTypes: string[] = [];
  if (input.photoStored) {
    receivedInputTypes.push("photo");
    storedEvidenceTypes.push("photos");
  }
  if (input.vibrationStored) receivedInputTypes.push("vibration");
  if (input.audioStored) receivedInputTypes.push("audio");
  if (input.videoStored) receivedInputTypes.push("video");
  if (input.audioStored) storedEvidenceTypes.push("audio");
  if (input.videoStored) storedEvidenceTypes.push("video");
  if (input.vibrationStored) storedEvidenceTypes.push("vibration");

  const analysisBoundary = storedEvidenceTypes.length > 0
    ? `Text details were processed. Stored for reviewer use and not analyzed: ${storedEvidenceTypes.join(", ")}.`
    : "Text details were processed.";

  return Object.freeze({
    receivedInputTypes: Object.freeze(receivedInputTypes),
    analyzedInputTypes: Object.freeze(analyzedInputTypes),
    evidenceProcessing: Object.freeze({
      photo: input.photoStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      audio: input.audioStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      video: input.videoStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      vibration: input.vibrationStored ? "stored_for_human_review_not_analyzed" : "not_provided",
    }),
    analysisBoundary,
  });
}
