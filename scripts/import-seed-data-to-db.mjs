import fs from "node:fs";
import pg from "pg";
import path from "node:path";
import {
  mutationTargetGuard,
  safeTargetDescription,
  sslConfigForUrl,
} from "./lib/db-target-safe.mjs";

const root = process.cwd();
const apply = process.argv.includes("--apply");
const seedDir = path.join(root, "docs", "seed-data", "json");

const databaseUrl = process.env.DATABASE_URL?.trim();
if (databaseUrl) {
  console.log(`Intended database target: ${safeTargetDescription(databaseUrl)}`);
}

const datasets = [
  {
    name: "symptom_categories",
    file: "symptom_categories_seed_v1.json",
    table: "drivable_seed_symptom_categories",
    primaryKey: "symptomCategoryId",
    columns: {
      symptomCategoryId: "symptom_category_id",
      label: "label",
      plainEnglishDescription: "plain_english_description",
      commonCustomerPhrases: "common_customer_phrases",
      commonEvidenceNeeded: "common_evidence_needed",
      possibleRiskLevel: "possible_risk_level",
      highRiskSignals: "high_risk_signals",
      relatedRoadsideModes: "related_roadside_modes",
      recommendedInitialPath: "recommended_initial_path",
      humanReviewRecommended: "human_review_recommended",
      safetyNote: "safety_note"
    }
  },
  {
    name: "evidence_items",
    file: "evidence_items_seed_v1.json",
    table: "drivable_seed_evidence_items",
    primaryKey: "evidenceId",
    columns: {
      evidenceId: "evidence_id",
      label: "label",
      description: "description",
      evidenceType: "evidence_type",
      usefulForSymptomCategories: "useful_for_symptom_categories",
      safeCaptureInstructions: "safe_capture_instructions",
      unsafeCaptureWarning: "unsafe_capture_warning",
      priority: "priority",
      customerPromptText: "customer_prompt_text"
    }
  },
  {
    name: "roadside_risk_triggers",
    file: "roadside_risk_triggers_seed_v1.json",
    table: "drivable_seed_roadside_risk_triggers",
    primaryKey: "triggerId",
    columns: {
      triggerId: "trigger_id",
      label: "label",
      customerPhraseExamples: "customer_phrase_examples",
      riskLevel: "risk_level",
      recommendedAction: "recommended_action",
      stopNow: "stop_now",
      humanReviewRequired: "human_review_required",
      towLikely: "tow_likely",
      safeCustomerMessage: "safe_customer_message",
      unsafePhrasingToAvoid: "unsafe_phrasing_to_avoid"
    }
  },
  {
    name: "decision_paths",
    file: "decision_paths_seed_v1.json",
    table: "drivable_seed_decision_paths",
    primaryKey: "decisionPathId",
    columns: {
      decisionPathId: "decision_path_id",
      label: "label",
      plainEnglishMeaning: "plain_english_meaning",
      whenToUse: "when_to_use",
      customerFacingRecommendation: "customer_facing_recommendation",
      safetyBoundaries: "safety_boundaries",
      humanReviewRecommended: "human_review_recommended",
      nextInfoNeeded: "next_info_needed",
      relatedStatuses: "related_statuses"
    }
  },
  {
    name: "follow_up_questions",
    file: "follow_up_questions_seed_v1.json",
    table: "drivable_seed_follow_up_questions",
    primaryKey: "questionId",
    columns: {
      questionId: "question_id",
      symptomCategoryId: "symptom_category_id",
      questionText: "question_text",
      whyItMatters: "why_it_matters",
      requestedEvidence: "requested_evidence",
      safetyWarning: "safety_warning",
      priority: "priority",
      answerType: "answer_type"
    }
  },
  {
    name: "repair_vs_sell_factors",
    file: "repair_vs_sell_factors_seed_v1.json",
    table: "drivable_seed_repair_vs_sell_factors",
    primaryKey: "factorId",
    columns: {
      factorId: "factor_id",
      label: "label",
      plainEnglishMeaning: "plain_english_meaning",
      pushesTowardRepair: "pushes_toward_repair",
      pushesTowardSell: "pushes_toward_sell",
      infoNeeded: "info_needed",
      riskNote: "risk_note",
      customerQuestion: "customer_question"
    }
  },
  {
    name: "buyer_risk_flags",
    file: "buyer_risk_flags_seed_v1.json",
    table: "drivable_seed_buyer_risk_flags",
    primaryKey: "flagId",
    columns: {
      flagId: "flag_id",
      label: "label",
      sellerPhraseExamples: "seller_phrase_examples",
      whyItMatters: "why_it_matters",
      evidenceToRequest: "evidence_to_request",
      riskLevel: "risk_level",
      walkAwaySignal: "walk_away_signal",
      customerSafeAdvice: "customer_safe_advice"
    }
  },
  {
    name: "seller_disclosure_prompts",
    file: "seller_disclosure_seed_v1.json",
    table: "drivable_seed_seller_disclosure_prompts",
    primaryKey: "disclosureId",
    columns: {
      disclosureId: "disclosure_id",
      issueType: "issue_type",
      plainEnglishDisclosurePrompt: "plain_english_disclosure_prompt",
      buyerConcern: "buyer_concern",
      evidenceHelpful: "evidence_helpful",
      listingLanguageSuggestion: "listing_language_suggestion",
      safetyOrLegalNote: "safety_or_legal_note"
    }
  }
];

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return Boolean(value);
}

function normalizeValue(key, value) {
  if (["humanReviewRecommended", "stopNow", "humanReviewRequired", "towLikely"].includes(key)) {
    return toBool(value);
  }
  return value ?? null;
}

function quoteIdent(value) {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function buildUpsert(dataset, row) {
  const mappedEntries = Object.entries(dataset.columns).map(([sourceKey, column]) => [
    column,
    normalizeValue(sourceKey, row[sourceKey])
  ]);

  mappedEntries.push(["raw", JSON.stringify(row)]);

  const columns = mappedEntries.map(([column]) => quoteIdent(column));
  const values = mappedEntries.map(([, value]) => sqlLiteral(value));
  const pkColumn = dataset.columns[dataset.primaryKey];

  const updateColumns = mappedEntries
    .filter(([column]) => column !== pkColumn)
    .map(([column]) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);

  return `INSERT INTO ${quoteIdent(dataset.table)} (${columns.join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT (${quoteIdent(pkColumn)}) DO UPDATE SET ${updateColumns.join(", ")};`;
}

let totalRows = 0;
let sqlStatements = [];

for (const dataset of datasets) {
  const filePath = path.join(seedDir, dataset.file);
  const rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
  totalRows += rows.length;

  console.log(`${dataset.name}: ${rows.length} rows -> ${dataset.table}`);

  for (const row of rows) {
    sqlStatements.push(buildUpsert(dataset, row));
  }
}

console.log("");
console.log(`Prepared ${sqlStatements.length} upsert statements across ${datasets.length} datasets.`);

const outDir = path.join(root, "tmp");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "drivable-seed-import.sql");
fs.writeFileSync(outFile, sqlStatements.join("\n") + "\n");

console.log(`SQL preview written to ${outFile}`);

if (!apply) {
  console.log("DRY RUN ONLY - no database connection made and no SQL executed.");
  console.log("To apply later, run this script with --apply after db schema has been pushed and DATABASE_URL is confirmed.");
  process.exit(0);
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing. Set it before running with --apply.");
}

const guard = mutationTargetGuard(databaseUrl);
if (!guard.ok) {
  console.error(`Seed import apply refused: ${guard.reason}`);
  console.error("Dry runs are always allowed. Apply requires an owner-confirmed target.");
  process.exit(1);
}
if (guard.markers?.length) {
  console.log(`Target blocked markers: ${guard.markers.join(", ")}`);
}
console.log(`Confirmed target: ${safeTargetDescription(databaseUrl)}`);

const { Client } = pg;
const client = new Client({
  connectionString: databaseUrl,
  ssl: sslConfigForUrl(databaseUrl),
});

await client.connect();

try {
  console.log("Applying seed data to database...");
  await client.query("BEGIN");

  for (const statement of sqlStatements) {
    await client.query(statement);
  }

  await client.query("COMMIT");
  console.log(`Applied ${sqlStatements.length} seed upserts successfully.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
