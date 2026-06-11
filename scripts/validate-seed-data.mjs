import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const seedDirectory = path.resolve("docs/seed-data/json");

const schemas = {
  "symptom_categories_seed_v1.json": {
    id: "symptomCategoryId",
    required: ["symptomCategoryId", "label", "plainEnglishDescription", "possibleRiskLevel", "recommendedInitialPath", "safetyNote"]
  },
  "evidence_items_seed_v1.json": {
    id: "evidenceId",
    required: ["evidenceId", "label", "description", "evidenceType", "safeCaptureInstructions", "unsafeCaptureWarning", "priority"]
  },
  "roadside_risk_triggers_seed_v1.json": {
    id: "triggerId",
    required: ["triggerId", "label", "riskLevel", "recommendedAction", "stopNow", "safeCustomerMessage", "unsafePhrasingToAvoid"]
  },
  "decision_paths_seed_v1.json": {
    id: "decisionPathId",
    required: ["decisionPathId", "label", "plainEnglishMeaning", "whenToUse", "safetyBoundaries", "relatedStatuses"]
  },
  "follow_up_questions_seed_v1.json": {
    id: "questionId",
    required: ["questionId", "symptomCategoryId", "questionText", "whyItMatters", "safetyWarning", "priority", "answerType"]
  },
  "repair_vs_sell_factors_seed_v1.json": {
    id: "factorId",
    required: ["factorId", "label", "plainEnglishMeaning", "pushesTowardRepair", "pushesTowardSell", "riskNote"]
  },
  "buyer_risk_flags_seed_v1.json": {
    id: "flagId",
    required: ["flagId", "label", "whyItMatters", "evidenceToRequest", "riskLevel", "walkAwaySignal", "customerSafeAdvice"]
  },
  "seller_disclosure_seed_v1.json": {
    id: "disclosureId",
    required: ["disclosureId", "issueType", "plainEnglishDisclosurePrompt", "buyerConcern", "listingLanguageSuggestion", "safetyOrLegalNote"]
  }
};

const results = [];
let failed = false;

for (const [fileName, schema] of Object.entries(schemas)) {
  const errors = [];
  let rows = [];

  try {
    const content = await readFile(path.join(seedDirectory, fileName), "utf8");
    rows = JSON.parse(content);
  } catch (error) {
    errors.push(`parse/read error: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(rows)) {
    errors.push("root value must be an array");
    rows = [];
  } else if (rows.length === 0) {
    errors.push("array must contain at least one row");
  }

  const ids = new Set();
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`row ${index + 1} must be an object`);
      return;
    }

    for (const key of schema.required) {
      if (!(key in row) || row[key] === null || row[key] === "") {
        errors.push(`row ${index + 1} is missing ${key}`);
      }
    }

    const id = row[schema.id];
    if (typeof id === "string" && id) {
      if (ids.has(id)) errors.push(`duplicate ${schema.id}: ${id}`);
      ids.add(id);
    }
  });

  if (errors.length) failed = true;
  results.push({
    File: fileName,
    Rows: rows.length,
    Status: errors.length ? "FAIL" : "PASS",
    Details: errors.length ? errors.slice(0, 4).join("; ") : "valid array; required keys present; IDs unique"
  });
}

console.table(results);
console.log(failed ? "Seed data validation failed." : `Seed data validation passed for ${results.length} files.`);
process.exitCode = failed ? 1 : 0;
