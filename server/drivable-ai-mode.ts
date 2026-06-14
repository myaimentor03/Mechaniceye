export type DrivableAiMode = "mock" | "live";

export function getDrivableAiMode(): DrivableAiMode {
  if (process.env.DRIVABLE_AI_MODE?.trim().toLowerCase() === "mock") {
    return "mock";
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return "mock";
  }

  return "live";
}
