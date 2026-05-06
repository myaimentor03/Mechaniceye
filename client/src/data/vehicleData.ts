export const YEARS = Array.from({ length: 2026 - 1980 + 1 }, (_, i) => String(2026 - i));

export const VEHICLE_DATA: Record<string, Record<string, { models: Record<string, string[]> }>> = {
  "2010": {
    Ford: { models: { Edge: ["3.5L", "I Don't Know"], Escape: ["2.5L", "3.0L V6", "I Don't Know"] } },
    Toyota: { models: { Tacoma: ["2.7L", "4.0L V6", "I Don't Know"], Camry: ["2.5L", "3.5L V6", "I Don't Know"] } },
    Honda: { models: { Accord: ["2.4L", "3.5L V6", "I Don't Know"], CRV: ["2.4L", "I Don't Know"] } }
  },
  "2014": {
    Ford: { models: { Escape: ["1.6L", "2.0L", "2.5L", "I Don't Know"], Edge: ["2.0L", "3.5L", "I Don't Know"] } },
    Toyota: { models: { Tacoma: ["2.7L", "4.0L V6", "I Don't Know"], Camry: ["2.5L", "3.5L V6", "I Don't Know"] } },
    Honda: { models: { Accord: ["2.4L", "3.5L V6", "I Don't Know"], CRV: ["2.4L", "I Don't Know"] } }
  },
  "2020": {
    Ford: { models: { F150: ["2.7L EcoBoost", "3.5L EcoBoost", "5.0L V8", "I Don't Know"], Escape: ["1.5L", "2.0L", "Hybrid", "I Don't Know"] } },
    Toyota: { models: { Tacoma: ["2.7L", "3.5L V6", "I Don't Know"], Camry: ["2.5L", "3.5L V6", "Hybrid", "I Don't Know"] } },
    Honda: { models: { Accord: ["1.5L Turbo", "2.0L Turbo", "Hybrid", "I Don't Know"], CRV: ["1.5L Turbo", "I Don't Know"] } }
  },
  "2024": {
    Ford: { models: { F150: ["2.7L EcoBoost", "3.5L EcoBoost", "5.0L V8", "I Don't Know"], Escape: ["1.5L", "2.0L", "Hybrid", "I Don't Know"] } },
    Toyota: { models: { Tacoma: ["2.4L Turbo", "I Don't Know"], Camry: ["2.5L", "3.5L V6", "Hybrid", "I Don't Know"] } },
    Honda: { models: { Accord: ["1.5L Turbo", "2.0L Hybrid", "I Don't Know"], CRV: ["1.5L Turbo", "Hybrid", "I Don't Know"] } }
  }
};

export const FALLBACK_MAKES = ["Ford", "Toyota", "Honda", "I Don't Know"];
export const FALLBACK_MODELS = ["I Don't Know"];
export const FALLBACK_ENGINES = ["I Don't Know"];

export const TRANSMISSION_OPTIONS = ["Automatic", "Manual", "CVT", "Dual-Clutch", "I Don't Know"];
export const DRIVETRAIN_OPTIONS = [
  "Front-Wheel Drive (FWD)",
  "Rear-Wheel Drive (RWD)",
  "All-Wheel Drive (AWD)",
  "Four-Wheel Drive (4WD)",
  "I Don't Know"
];
