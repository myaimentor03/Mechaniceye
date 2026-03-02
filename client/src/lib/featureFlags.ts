// Central place to gate unfinished features for launch.
// Flip these to true as features become production-ready.
export const featureFlags = {
  stepByStepRepair: false,
  fixHistory: false,
  chatExport: false,
  profile: false,
  history: false,
  repairGuideGenerator: false,
} as const;

export type FeatureFlag = keyof typeof featureFlags;
