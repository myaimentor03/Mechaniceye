// DRAFT ONLY
// NOT IMPORTED BY APP
// DO NOT USE FOR MIGRATION WITHOUT REVIEW
//
// Standalone PostgreSQL/Drizzle planning draft. It intentionally lives under
// docs/data and is not referenced by either Drizzle config or server code.

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

const seedAuditColumns = () => ({
  content: jsonb("content").notNull(),
  sourceFile: text("source_file").notNull(),
  sourceRow: integer("source_row").notNull(),
  importBatchId: text("import_batch_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const drivableSeedSymptomCategories = pgTable(
  "drivable_seed_symptom_categories",
  {
    symptomCategoryId: text("symptom_category_id").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    label: text("label").notNull(),
    plainEnglishDescription: text("plain_english_description").notNull(),
    possibleRiskLevel: text("possible_risk_level").notNull(),
    recommendedInitialPath: text("recommended_initial_path").notNull(),
    safetyNote: text("safety_note").notNull(),
    ...seedAuditColumns()
  },
  (table) => [
    primaryKey({ columns: [table.symptomCategoryId, table.datasetVersion] }),
    index("drivable_seed_symptoms_active_risk_idx").on(
      table.isActive,
      table.datasetVersion,
      table.possibleRiskLevel
    )
  ]
);
export const drivableSeedEvidenceItems = pgTable(
  "drivable_seed_evidence_items",
  {
    evidenceId: text("evidence_id").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    label: text("label").notNull(),
    evidenceType: text("evidence_type").notNull(),
    priority: text("priority").notNull(),
    safeCaptureInstructions: text("safe_capture_instructions").notNull(),
    unsafeCaptureWarning: text("unsafe_capture_warning").notNull(),
    ...seedAuditColumns()
  },
  (table) => [
    primaryKey({ columns: [table.evidenceId, table.datasetVersion] }),
    index("drivable_seed_evidence_type_priority_idx").on(
      table.isActive,
      table.datasetVersion,
      table.evidenceType,
      table.priority
    )
  ]
);

export const drivableSeedRoadsideRiskTriggers = pgTable(
  "drivable_seed_roadside_risk_triggers",
  {
    triggerId: text("trigger_id").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    label: text("label").notNull(),
    riskLevel: text("risk_level").notNull(),
    recommendedAction: text("recommended_action").notNull(),
    stopNow: boolean("stop_now").notNull(),
    humanReviewRequired: boolean("human_review_required").notNull(),
    towLikely: boolean("tow_likely").notNull(),
    safeCustomerMessage: text("safe_customer_message").notNull(),
    unsafePhrasingToAvoid: text("unsafe_phrasing_to_avoid").notNull(),
    ...seedAuditColumns()
  },
  (table) => [
    primaryKey({ columns: [table.triggerId, table.datasetVersion] }),
    index("drivable_seed_roadside_action_idx").on(
      table.isActive,
      table.datasetVersion,
      table.riskLevel,
      table.recommendedAction,
      table.stopNow
    )
  ]
);

export const drivableSeedDecisionPaths = pgTable(
  "drivable_seed_decision_paths",
  {
    decisionPathId: text("decision_path_id").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    label: text("label").notNull(),
    plainEnglishMeaning: text("plain_english_meaning").notNull(),
    whenToUse: text("when_to_use").notNull(),
    safetyBoundaries: text("safety_boundaries").notNull(),
    humanReviewRecommended: boolean("human_review_recommended").notNull(),
    ...seedAuditColumns()
  },
  (table) => [
    primaryKey({ columns: [table.decisionPathId, table.datasetVersion] }),
    index("drivable_seed_decision_paths_active_idx").on(
      table.isActive,
      table.datasetVersion
    )
  ]
);

export const drivableSeedFollowUpQuestions = pgTable(
  "drivable_seed_follow_up_questions",
  {
    questionId: text("question_id").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    symptomCategoryId: text("symptom_category_id").notNull(),
    questionText: text("question_text").notNull(),
    whyItMatters: text("why_it_matters").notNull(),
    safetyWarning: text("safety_warning").notNull(),
    priority: text("priority").notNull(),
    answerType: text("answer_type").notNull(),
    ...seedAuditColumns()
  },
  (table) => [
    primaryKey({ columns: [table.questionId, table.datasetVersion] }),
    index("drivable_seed_questions_category_priority_idx").on(
      table.isActive,
      table.datasetVersion,
      table.symptomCategoryId,
      table.priority
    )
  ]
);

export const drivableSeedRepairVsSellFactors = pgTable(
  "drivable_seed_repair_vs_sell_factors",
  {
    factorId: text("factor_id").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    label: text("label").notNull(),
    plainEnglishMeaning: text("plain_english_meaning").notNull(),
    pushesTowardRepair: text("pushes_toward_repair").notNull(),
    pushesTowardSell: text("pushes_toward_sell").notNull(),
    riskNote: text("risk_note").notNull(),
    ...seedAuditColumns()
  },
  (table) => [
    primaryKey({ columns: [table.factorId, table.datasetVersion] }),
    index("drivable_seed_repair_sell_active_idx").on(
      table.isActive,
      table.datasetVersion
    )
  ]
);

export const drivableSeedBuyerRiskFlags = pgTable(
  "drivable_seed_buyer_risk_flags",
  {
    flagId: text("flag_id").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    label: text("label").notNull(),
    whyItMatters: text("why_it_matters").notNull(),
    evidenceToRequest: text("evidence_to_request").notNull(),
    riskLevel: text("risk_level").notNull(),
    walkAwaySignal: text("walk_away_signal").notNull(),
    customerSafeAdvice: text("customer_safe_advice").notNull(),
    ...seedAuditColumns()
  },
  (table) => [
    primaryKey({ columns: [table.flagId, table.datasetVersion] }),
    index("drivable_seed_buyer_flags_risk_idx").on(
      table.isActive,
      table.datasetVersion,
      table.riskLevel
    )
  ]
);

export const drivableSeedSellerDisclosures = pgTable(
  "drivable_seed_seller_disclosures",
  {
    disclosureId: text("disclosure_id").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    issueType: text("issue_type").notNull(),
    plainEnglishDisclosurePrompt: text("plain_english_disclosure_prompt").notNull(),
    buyerConcern: text("buyer_concern").notNull(),
    listingLanguageSuggestion: text("listing_language_suggestion").notNull(),
    safetyOrLegalNote: text("safety_or_legal_note").notNull(),
    ...seedAuditColumns()
  },
  (table) => [
    primaryKey({ columns: [table.disclosureId, table.datasetVersion] }),
    index("drivable_seed_seller_disclosures_issue_idx").on(
      table.isActive,
      table.datasetVersion,
      table.issueType
    )
  ]
);

export const drivableCustomerCases = pgTable(
  "drivable_customer_cases",
  {
    caseId: text("case_id").primaryKey(),
    intakeType: text("intake_type").notNull(),
    source: text("source").notNull(),
    customerReference: text("customer_reference"),
    vehicle: jsonb("vehicle").notNull().default({}),
    rawIntake: jsonb("raw_intake").notNull(),
    normalizedSymptomIds: jsonb("normalized_symptom_ids").notNull().default([]),
    riskSignals: jsonb("risk_signals").notNull().default([]),
    riskLevel: text("risk_level"),
    customerGoal: text("customer_goal"),
    reportStatus: text("report_status").notNull().default("intake_received"),
    consentReference: text("consent_reference"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("drivable_customer_cases_status_submitted_idx").on(
      table.reportStatus,
      table.submittedAt
    ),
    index("drivable_customer_cases_customer_ref_idx").on(table.customerReference)
  ]
);

export const drivableCustomerMedia = pgTable(
  "drivable_customer_media",
  {
    mediaId: text("media_id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => drivableCustomerCases.caseId),
    sourceType: text("source_type").notNull(),
    modality: text("modality").notNull(),
    storageReference: text("storage_reference").notNull(),
    originalFileName: text("original_file_name"),
    consentStatus: text("consent_status").notNull(),
    licenseStatus: text("license_status"),
    captureContext: text("capture_context"),
    safetyContext: jsonb("safety_context").notNull().default({}),
    labels: jsonb("labels").notNull().default([]),
    labelConfidence: numeric("label_confidence", { precision: 5, scale: 4 }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("drivable_customer_media_case_idx").on(table.caseId),
    index("drivable_customer_media_consent_modality_idx").on(
      table.consentStatus,
      table.modality
    )
  ]
);

export const drivableAiReportDrafts = pgTable(
  "drivable_ai_report_drafts",
  {
    draftId: text("draft_id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => drivableCustomerCases.caseId),
    modelProvider: text("model_provider"),
    modelName: text("model_name").notNull(),
    promptVersion: text("prompt_version").notNull(),
    seedVersions: jsonb("seed_versions").notNull().default({}),
    inputSnapshot: jsonb("input_snapshot").notNull(),
    draftContent: jsonb("draft_content").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    safetyFlags: jsonb("safety_flags").notNull().default([]),
    generationStatus: text("generation_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("drivable_ai_drafts_case_created_idx").on(table.caseId, table.createdAt),
    index("drivable_ai_drafts_safety_status_idx").on(table.generationStatus)
  ]
);

export const drivableHumanReviews = pgTable(
  "drivable_human_reviews",
  {
    reviewId: text("review_id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => drivableCustomerCases.caseId),
    draftId: text("draft_id").references(() => drivableAiReportDrafts.draftId),
    reviewerReference: text("reviewer_reference").notNull(),
    decision: text("decision").notNull(),
    riskFlags: jsonb("risk_flags").notNull().default([]),
    rationale: text("rationale"),
    editedContent: jsonb("edited_content"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("drivable_human_reviews_case_idx").on(table.caseId, table.reviewedAt),
    index("drivable_human_reviews_draft_idx").on(table.draftId)
  ]
);

export const drivableCustomerReadyReports = pgTable(
  "drivable_customer_ready_reports",
  {
    reportId: text("report_id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => drivableCustomerCases.caseId),
    approvedReviewId: text("approved_review_id")
      .notNull()
      .references(() => drivableHumanReviews.reviewId),
    reportStatus: text("report_status").notNull(),
    customerContent: jsonb("customer_content").notNull(),
    confidenceAndLimitations: text("confidence_and_limitations").notNull(),
    safetyLanguage: text("safety_language").notNull(),
    contentHash: text("content_hash").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("drivable_ready_reports_content_hash_uidx").on(table.contentHash),
    index("drivable_ready_reports_case_status_idx").on(table.caseId, table.reportStatus),
    index("drivable_ready_reports_sent_idx").on(table.sentAt)
  ]
);

export const drivableCustomerOutcomes = pgTable(
  "drivable_customer_outcomes",
  {
    outcomeId: text("outcome_id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => drivableCustomerCases.caseId),
    reportId: text("report_id").references(() => drivableCustomerReadyReports.reportId),
    customerActionTaken: text("customer_action_taken"),
    vehicleDrivenAfterAdvice: text("vehicle_driven_after_advice"),
    towUsed: text("tow_used"),
    shopInspected: text("shop_inspected"),
    didAdviceHelp: text("did_advice_help"),
    customerNotes: text("customer_notes"),
    sourceType: text("source_type").notNull(),
    verificationLevel: text("verification_level").notNull(),
    outcomeStatus: text("outcome_status").notNull(),
    consentReference: text("consent_reference"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("drivable_customer_outcomes_case_idx").on(table.caseId, table.capturedAt),
    index("drivable_customer_outcomes_report_idx").on(table.reportId)
  ]
);

export const drivableRepairOutcomes = pgTable(
  "drivable_repair_outcomes",
  {
    repairOutcomeId: text("repair_outcome_id").primaryKey(),
    outcomeId: text("outcome_id")
      .notNull()
      .references(() => drivableCustomerOutcomes.outcomeId),
    actualCause: text("actual_cause"),
    actualRepairPerformed: text("actual_repair_performed"),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    amountType: text("amount_type"),
    currency: text("currency"),
    evidenceSource: text("evidence_source"),
    verificationLevel: text("verification_level").notNull(),
    supportingReference: text("supporting_reference"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("drivable_repair_outcomes_outcome_idx").on(table.outcomeId),
    index("drivable_repair_outcomes_verification_idx").on(
      table.verificationLevel,
      table.confirmedAt
    )
  ]
);

export const drivableBuyerOutcomes = pgTable(
  "drivable_buyer_outcomes",
  {
    buyerOutcomeId: text("buyer_outcome_id").primaryKey(),
    outcomeId: text("outcome_id")
      .notNull()
      .references(() => drivableCustomerOutcomes.outcomeId),
    listingReference: text("listing_reference"),
    vehicleReference: text("vehicle_reference"),
    inspected: boolean("inspected"),
    negotiated: boolean("negotiated"),
    purchased: boolean("purchased"),
    walkedAway: boolean("walked_away"),
    titleResult: text("title_result"),
    finalDecision: text("final_decision"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("drivable_buyer_outcomes_outcome_idx").on(table.outcomeId),
    index("drivable_buyer_outcomes_decision_idx").on(table.finalDecision)
  ]
);

export const drivableSellerOutcomes = pgTable(
  "drivable_seller_outcomes",
  {
    sellerOutcomeId: text("seller_outcome_id").primaryKey(),
    outcomeId: text("outcome_id")
      .notNull()
      .references(() => drivableCustomerOutcomes.outcomeId),
    listingReference: text("listing_reference"),
    disclosedIssues: jsonb("disclosed_issues").notNull().default([]),
    publicationStatus: text("publication_status"),
    inquiryCount: integer("inquiry_count"),
    sold: boolean("sold"),
    removed: boolean("removed"),
    saleAmount: numeric("sale_amount", { precision: 12, scale: 2 }),
    currency: text("currency"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("drivable_seller_outcomes_outcome_idx").on(table.outcomeId),
    index("drivable_seller_outcomes_listing_status_idx").on(
      table.listingReference,
      table.publicationStatus
    )
  ]
);
