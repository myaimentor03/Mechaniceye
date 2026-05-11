export const YEARS = Array.from({ length: 2025 - 2000 + 1 }, (_, i) => String(2025 - i));

const COMMON_MAKES = [
  "Ford",
  "Chevrolet",
  "GMC",
  "Dodge",
  "Ram",
  "Toyota",
  "Honda",
  "Nissan",
  "Hyundai",
  "Kia",
  "Subaru",
  "Jeep",
  "Chrysler",
  "Mazda",
  "Volkswagen",
  "BMW",
  "Mercedes-Benz",
  "Lexus",
  "Acura",
  "Infiniti",
  "Audi",
];

const COMMON_MODELS_BY_MAKE: Record<string, string[]> = {
  Ford: ["F-150", "Escape", "Explorer", "Fusion", "Focus", "Edge"],
  Chevrolet: ["Silverado", "Equinox", "Malibu", "Cruze", "Tahoe"],
  GMC: ["Sierra", "Terrain", "Yukon"],
  Dodge: ["Charger", "Challenger", "Durango", "Grand Caravan"],
  Ram: ["1500"],
  Toyota: ["Camry", "Corolla", "RAV4", "Tacoma", "Tundra", "Highlander", "Prius"],
  Honda: ["Civic", "Accord", "CR-V", "Pilot", "Odyssey"],
  Nissan: ["Altima", "Sentra", "Rogue", "Pathfinder", "Frontier"],
  Hyundai: ["Elantra", "Sonata", "Tucson", "Santa Fe"],
  Kia: ["Forte", "Optima", "K5", "Sorento", "Sportage"],
  Subaru: ["Outback", "Forester", "Impreza", "Crosstrek"],
  Jeep: ["Grand Cherokee", "Wrangler", "Cherokee"],
  Chrysler: ["300", "Pacifica", "Town & Country"],
  Mazda: ["Mazda3", "Mazda6", "CX-5"],
  Volkswagen: ["Jetta", "Passat", "Tiguan"],
  BMW: ["3 Series", "5 Series", "X3", "X5"],
  "Mercedes-Benz": ["C-Class", "E-Class", "GLC", "GLE"],
  Lexus: ["RX", "ES", "IS"],
  Acura: ["MDX", "RDX", "TL", "TSX"],
  Infiniti: ["G37", "Q50", "QX60"],
  Audi: ["A4", "Q5"],
};

const ENGINE_OPTIONS_BY_MAKE_MODEL: Record<string, string[]> = {
  "Ford|F-150": ["3.3L V6", "2.7L EcoBoost", "3.5L EcoBoost", "5.0L V8", "I Don't Know"],
  "Ford|Escape": ["2.5L I4", "1.5L I4 Turbo", "2.0L I4 Turbo", "Hybrid", "I Don't Know"],
  "Ford|Explorer": ["2.3L I4 Turbo", "3.5L V6", "3.0L V6 Turbo", "I Don't Know"],
  "Ford|Fusion": ["2.5L I4", "1.5L Turbo", "2.0L Turbo", "Hybrid", "I Don't Know"],
  "Ford|Focus": ["2.0L I4", "2.3L Turbo", "I Don't Know"],
  "Ford|Edge": ["2.0L I4 Turbo", "2.7L V6 Turbo", "3.5L V6", "I Don't Know"],

  "Chevrolet|Silverado": ["4.3L V6", "5.3L V8", "6.2L V8", "2.7L Turbo", "3.0L Duramax", "I Don't Know"],
  "Chevrolet|Equinox": ["2.4L I4", "1.5L Turbo", "2.0L Turbo", "1.6L Diesel", "I Don't Know"],
  "Chevrolet|Malibu": ["2.5L I4", "1.5L Turbo", "2.0L Turbo", "Hybrid", "I Don't Know"],
  "Chevrolet|Cruze": ["1.4L Turbo", "1.8L I4", "1.6L Diesel", "I Don't Know"],
  "Chevrolet|Tahoe": ["5.3L V8", "6.2L V8", "3.0L Diesel", "I Don't Know"],

  "GMC|Sierra": ["4.3L V6", "5.3L V8", "6.2L V8", "2.7L Turbo", "3.0L Duramax", "I Don't Know"],
  "GMC|Terrain": ["2.4L I4", "1.5L Turbo", "2.0L Turbo", "1.6L Diesel", "I Don't Know"],
  "GMC|Yukon": ["5.3L V8", "6.2L V8", "3.0L Diesel", "I Don't Know"],

  "Dodge|Charger": ["3.6L V6", "5.7L V8", "6.4L V8", "6.2L Supercharged V8", "I Don't Know"],
  "Dodge|Challenger": ["3.6L V6", "5.7L V8", "6.4L V8", "6.2L Supercharged V8", "I Don't Know"],
  "Dodge|Durango": ["3.6L V6", "5.7L V8", "6.4L V8", "I Don't Know"],
  "Dodge|Grand Caravan": ["3.6L V6", "I Don't Know"],

  "Ram|1500": ["3.6L V6", "5.7L V8", "3.0L Diesel", "2.0L eTorque", "I Don't Know"],

  "Toyota|Camry": ["2.4L I4", "2.5L I4", "3.5L V6", "Hybrid", "I Don't Know"],
  "Toyota|Corolla": ["1.8L I4", "2.0L I4", "Hybrid", "I Don't Know"],
  "Toyota|RAV4": ["2.4L I4", "2.5L I4", "Hybrid", "Prime", "I Don't Know"],
  "Toyota|Tacoma": ["2.7L I4", "3.5L V6", "2.4L Turbo", "I Don't Know"],
  "Toyota|Tundra": ["4.6L V8", "5.7L V8", "3.4L Twin Turbo V6", "Hybrid", "I Don't Know"],
  "Toyota|Highlander": ["2.7L I4", "3.5L V6", "2.4L Turbo", "Hybrid", "I Don't Know"],
  "Toyota|Prius": ["1.8L Hybrid", "2.0L Hybrid", "I Don't Know"],

  "Honda|Civic": ["1.8L I4", "2.0L I4", "1.5L Turbo", "2.0L Type R", "Hybrid", "I Don't Know"],
  "Honda|Accord": ["2.4L I4", "1.5L Turbo", "2.0L Turbo", "3.5L V6", "Hybrid", "I Don't Know"],
  "Honda|CR-V": ["2.4L I4", "1.5L Turbo", "Hybrid", "I Don't Know"],
  "Honda|Pilot": ["3.5L V6", "I Don't Know"],
  "Honda|Odyssey": ["3.5L V6", "I Don't Know"],

  "Nissan|Altima": ["2.5L I4", "3.5L V6", "2.0L Turbo", "I Don't Know"],
  "Nissan|Sentra": ["1.8L I4", "2.0L I4", "I Don't Know"],
  "Nissan|Rogue": ["2.5L I4", "1.5L Turbo", "Hybrid", "I Don't Know"],
  "Nissan|Pathfinder": ["3.5L V6", "I Don't Know"],
  "Nissan|Frontier": ["2.5L I4", "4.0L V6", "3.8L V6", "I Don't Know"],

  "Hyundai|Elantra": ["2.0L I4", "1.6L Turbo", "Hybrid", "I Don't Know"],
  "Hyundai|Sonata": ["2.4L I4", "2.5L I4", "1.6L Turbo", "2.0L Turbo", "Hybrid", "I Don't Know"],
  "Hyundai|Tucson": ["2.0L I4", "2.5L I4", "1.6L Turbo", "Hybrid", "I Don't Know"],
  "Hyundai|Santa Fe": ["2.4L I4", "2.5L I4", "2.0L Turbo", "1.6L Hybrid", "I Don't Know"],

  "Kia|Forte": ["2.0L I4", "1.6L Turbo", "I Don't Know"],
  "Kia|Optima": ["2.4L I4", "2.0L Turbo", "1.6L Turbo", "Hybrid", "I Don't Know"],
  "Kia|K5": ["1.6L Turbo", "2.5L Turbo", "I Don't Know"],
  "Kia|Sorento": ["2.4L I4", "2.5L I4", "2.0L Turbo", "3.3L V6", "Hybrid", "I Don't Know"],
  "Kia|Sportage": ["2.4L I4", "2.5L I4", "1.6L Turbo", "Hybrid", "I Don't Know"],

  "Subaru|Outback": ["2.5L H4", "3.6L H6", "2.4L Turbo H4", "I Don't Know"],
  "Subaru|Forester": ["2.5L H4", "2.0L Turbo H4", "I Don't Know"],
  "Subaru|Impreza": ["2.0L H4", "2.5L H4", "I Don't Know"],
  "Subaru|Crosstrek": ["2.0L H4", "2.5L H4", "Hybrid", "I Don't Know"],

  "Jeep|Grand Cherokee": ["3.6L V6", "5.7L V8", "6.4L V8", "3.0L Diesel", "2.0L Hybrid", "I Don't Know"],
  "Jeep|Wrangler": ["3.6L V6", "2.0L Turbo", "3.0L Diesel", "3.6L eTorque", "4xe Hybrid", "I Don't Know"],
  "Jeep|Cherokee": ["2.4L I4", "3.2L V6", "2.0L Turbo", "I Don't Know"],

  "Chrysler|300": ["3.6L V6", "5.7L V8", "6.4L V8", "I Don't Know"],
  "Chrysler|Pacifica": ["3.6L V6", "Hybrid", "I Don't Know"],
  "Chrysler|Town & Country": ["3.6L V6", "I Don't Know"],

  "Mazda|Mazda3": ["2.0L I4", "2.5L I4", "2.5L Turbo", "I Don't Know"],
  "Mazda|Mazda6": ["2.5L I4", "2.5L Turbo", "I Don't Know"],
  "Mazda|CX-5": ["2.5L I4", "2.5L Turbo", "2.2L Diesel", "I Don't Know"],

  "Volkswagen|Jetta": ["1.4L Turbo", "1.8L Turbo", "2.0L I4", "2.0L Turbo", "1.5L Turbo", "I Don't Know"],
  "Volkswagen|Passat": ["1.8L Turbo", "2.0L Turbo", "3.6L V6", "I Don't Know"],
  "Volkswagen|Tiguan": ["2.0L Turbo", "I Don't Know"],

  "BMW|3 Series": ["2.0L Turbo", "3.0L Turbo", "Hybrid", "I Don't Know"],
  "BMW|5 Series": ["2.0L Turbo", "3.0L Turbo", "4.4L V8", "Hybrid", "I Don't Know"],
  "BMW|X3": ["2.0L Turbo", "3.0L Turbo", "I Don't Know"],
  "BMW|X5": ["3.0L Turbo", "4.4L V8", "Diesel", "Hybrid", "I Don't Know"],

  "Mercedes-Benz|C-Class": ["2.0L Turbo", "3.0L Turbo", "4.0L V8", "I Don't Know"],
  "Mercedes-Benz|E-Class": ["2.0L Turbo", "3.0L Turbo", "4.0L V8", "Hybrid", "I Don't Know"],
  "Mercedes-Benz|GLC": ["2.0L Turbo", "3.0L Turbo", "I Don't Know"],
  "Mercedes-Benz|GLE": ["2.0L Turbo", "3.0L Turbo", "4.0L V8", "Hybrid", "Diesel", "I Don't Know"],

  "Lexus|RX": ["3.5L V6", "2.4L Turbo", "Hybrid", "I Don't Know"],
  "Lexus|ES": ["2.5L I4", "3.5L V6", "Hybrid", "I Don't Know"],
  "Lexus|IS": ["2.0L Turbo", "3.5L V6", "5.0L V8", "I Don't Know"],

  "Acura|MDX": ["3.5L V6", "3.0L Turbo Hybrid", "I Don't Know"],
  "Acura|RDX": ["2.3L Turbo", "2.0L Turbo", "I Don't Know"],
  "Acura|TL": ["3.2L V6", "3.5L V6", "3.7L V6", "I Don't Know"],
  "Acura|TSX": ["2.4L I4", "3.5L V6", "I Don't Know"],

  "Infiniti|G37": ["3.7L V6", "I Don't Know"],
  "Infiniti|Q50": ["2.0L Turbo", "3.0L Turbo", "3.5L Hybrid", "I Don't Know"],
  "Infiniti|QX60": ["3.5L V6", "2.5L Hybrid", "I Don't Know"],

  "Audi|A4": ["2.0L Turbo", "3.0L Supercharged", "I Don't Know"],
  "Audi|Q5": ["2.0L Turbo", "3.0L Supercharged", "Hybrid", "Diesel", "I Don't Know"],
};

function normalizeEngineList(list?: string[]) {
  if (!list || list.length === 0) return ["I Don't Know"];
  return Array.from(new Set([...list, "I Don't Know"]));
}

export const VEHICLE_DATA: Record<string, Record<string, { models: Record<string, string[]> }>> = Object.fromEntries(
  YEARS.map((year) => [
    year,
    Object.fromEntries(
      COMMON_MAKES.map((make) => [
        make,
        {
          models: Object.fromEntries(
            (COMMON_MODELS_BY_MAKE[make] || []).map((model) => [
              model,
              normalizeEngineList(ENGINE_OPTIONS_BY_MAKE_MODEL[`${make}|${model}`]),
            ])
          ),
        },
      ])
    ),
  ])
);

export const FALLBACK_MAKES = [...COMMON_MAKES, "Other Make", "Unknown Make", "I Don't Know"];
export const FALLBACK_MODELS = ["Other Model", "Unknown Model", "I Don't Know"];
export const FALLBACK_ENGINES = ["Other Engine", "Unknown Engine", "I Don't Know"];

export const TRANSMISSION_OPTIONS = ["Automatic", "Manual", "CVT", "Dual-Clutch", "I Don't Know"];
export const DRIVETRAIN_OPTIONS = [
  "Front-Wheel Drive (FWD)",
  "Rear-Wheel Drive (RWD)",
  "All-Wheel Drive (AWD)",
  "Four-Wheel Drive (4WD)",
  "I Don't Know",
];
