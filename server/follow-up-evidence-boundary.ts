export type FollowUpEvidenceBoundary = Readonly<{
  analyzedInputTypes: readonly string[];
  evidenceProcessing: Readonly<{
    audio: "stored_for_human_review_not_analyzed" | "not_provided";
    video: "stored_for_human_review_not_analyzed" | "not_provided";
    vibration: "stored_for_human_review_not_analyzed" | "not_provided";
  }>;
  analysisBoundary: string;
}>;

export function buildFollowUpEvidenceBoundary(input: { audioStored: boolean; videoStored: boolean; vibrationStored: boolean }): FollowUpEvidenceBoundary {
  const inputTypes: string[] = ["description"];
  const storedTypes: string[] = [];
  if (input.vibrationStored) {
    inputTypes.push("vibration");
    storedTypes.push("vibration");
  }
  if (input.audioStored) {
    inputTypes.push("audio");
    storedTypes.push("audio");
  }
  if (input.videoStored) {
    inputTypes.push("video");
    storedTypes.push("video");
  }

  const typeList = storedTypes.length > 0
    ? storedTypes.map((t) => t).join(", ").replace(/,([^,]*)$/, ", and$1")
    : "";
  const analysisBoundary = inputTypes.length > 1
    ? `Text details were processed. ${typeList} were processed as reviewer evidence.`
    : "Text details were processed.";

  return Object.freeze({
    analyzedInputTypes: Object.freeze(inputTypes),
    evidenceProcessing: Object.freeze({
      audio: input.audioStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      video: input.videoStored ? "stored_for_human_review_not_analyzed" : "not_provided",
      vibration: input.vibrationStored ? "stored_for_human_review_not_analyzed" : "not_provided",
    }),
    analysisBoundary,
  });
}
