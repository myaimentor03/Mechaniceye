import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, json, boolean, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  subscriptionTier: text("subscription_tier").default("basic"), // basic, premium, expert
  subscriptionStatus: text("subscription_status").default("active"), // active, inactive, cancelled
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const diagnoses = pgTable("diagnoses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  vehicleInfo: text("vehicle_info"),
  description: text("description"),
  timing: text("timing"),
  audioFile: text("audio_file"),
  videoFile: text("video_file"),
  vibrationData: json("vibration_data"),
  primaryDiagnosis: json("primary_diagnosis").$type<{
    title: string;
    description: string;
    confidence: number;
    severity: string;
    cost: string;
    instructions: string[];
    requiredTools: string[];
    estimatedTime: string;
    wasSuccessful?: boolean;
    stepsCompleted?: number[];
  }>(),
  alternativeScenarios: json("alternative_scenarios").$type<Array<{
    title: string;
    description: string;
    confidence: number;
    severity: string;
    cost: string;
    instructions: string[];
    requiredTools: string[];
    estimatedTime: string;
    wasSuccessful?: boolean;
    stepsCompleted?: number[];
  }>>(),
  needsMoreInfo: boolean("needs_more_info").default(false),
  additionalQuestions: json("additional_questions").$type<string[]>(),
  iterationCount: integer("iteration_count").default(1),
  isResolved: boolean("is_resolved").default(false),
  mechanicConsultationId: varchar("mechanic_consultation_id"),
  confidenceScore: integer("confidence_score").default(0),
  confidenceLevel: text("confidence_level").default("low"), // low, medium, high
  inputTypes: json("input_types").$type<string[]>(), // track what inputs were used
  createdAt: timestamp("created_at").defaultNow(),
});

// Fix history log
export const fixHistoryLog = pgTable("fix_history_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  diagnosisId: varchar("diagnosis_id").notNull(),
  userId: varchar("user_id").notNull(),
  attemptNumber: integer("attempt_number").default(1),
  suggestedFix: json("suggested_fix").$type<{
    title: string;
    description: string;
    instructions: string[];
    confidence: number;
  }>(),
  wasSuccessful: boolean("was_successful"),
  userFeedback: text("user_feedback"),
  stepsCompleted: json("steps_completed").$type<number[]>(),
  timeSpent: integer("time_spent_minutes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Chat export log for mechanic handoff
export const chatExportLog = pgTable("chat_export_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  diagnosisId: varchar("diagnosis_id").notNull(),
  userId: varchar("user_id").notNull(),
  mechanicId: varchar("mechanic_id"),
  exportData: json("export_data").$type<{
    userInputs: any[];
    aiSuggestions: any[];
    confidenceScores: number[];
    fixHistory: any[];
    chatMessages: any[];
  }>(),
  exportedAt: timestamp("exported_at").defaultNow(),
});

export const mechanics = pgTable("mechanics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  specialties: json("specialties").$type<string[]>(),
  experienceYears: integer("experience_years"),
  rating: numeric("rating", { precision: 3, scale: 2 }).default("0.00"),
  totalConsultations: integer("total_consultations").default(0),
  isActive: boolean("is_active").default(true),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("mechanics_rating_idx").on(table.rating),
  index("mechanics_active_idx").on(table.isActive),
]);

export const consultations = pgTable("consultations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  diagnosisId: varchar("diagnosis_id").notNull(),
  mechanicId: varchar("mechanic_id").notNull(),
  userId: varchar("user_id").notNull(),
  status: text("status").default("pending"), // pending, active, completed, cancelled
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  duration: integer("duration_minutes"),
  wasFixed: boolean("was_fixed"),
  mechanicRating: integer("mechanic_rating"), // 1-10
  politenessRating: integer("politeness_rating"), // 1-10
  effectivenessRating: integer("effectiveness_rating"), // 1-10
  easeOfWorkRating: integer("ease_of_work_rating"), // 1-10
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }),
  userFeedback: text("user_feedback"),
  mechanicNotes: text("mechanic_notes"),
  cost: numeric("cost", { precision: 10, scale: 2 }),
  mechanicPayment: numeric("mechanic_payment", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("consultations_mechanic_idx").on(table.mechanicId),
  index("consultations_user_idx").on(table.userId),
  index("consultations_status_idx").on(table.status),
]);

export const followUpRequests = pgTable("follow_up_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalDiagnosisId: varchar("original_diagnosis_id").notNull(),
  userId: varchar("user_id").notNull(),
  additionalInfo: text("additional_info"),
  newAudioFile: text("new_audio_file"),
  newVideoFile: text("new_video_file"),
  newVibrationData: json("new_vibration_data"),
  status: text("status").default("pending"), // pending, processed, completed
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("follow_up_diagnosis_idx").on(table.originalDiagnosisId),
]);


// Drivable seed knowledge tables
// These tables power day-one guidance, buyer/seller workflows, roadside safety routing,
// follow-up question selection, and repair-vs-sell decisions.
// Source data lives in docs/seed-data and must be imported with a dry-run first.

export const drivableSeedSymptomCategories = pgTable("drivable_seed_symptom_categories", {
  symptomCategoryId: varchar("symptom_category_id").primaryKey(),
  label: text("label").notNull(),
  plainEnglishDescription: text("plain_english_description"),
  commonCustomerPhrases: text("common_customer_phrases"),
  commonEvidenceNeeded: text("common_evidence_needed"),
  possibleRiskLevel: text("possible_risk_level"),
  highRiskSignals: text("high_risk_signals"),
  relatedRoadsideModes: text("related_roadside_modes"),
  recommendedInitialPath: text("recommended_initial_path"),
  humanReviewRecommended: boolean("human_review_recommended").default(false),
  safetyNote: text("safety_note"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const drivableSeedEvidenceItems = pgTable("drivable_seed_evidence_items", {
  evidenceId: varchar("evidence_id").primaryKey(),
  label: text("label").notNull(),
  description: text("description"),
  evidenceType: text("evidence_type"),
  usefulForSymptomCategories: text("useful_for_symptom_categories"),
  safeCaptureInstructions: text("safe_capture_instructions"),
  unsafeCaptureWarning: text("unsafe_capture_warning"),
  priority: text("priority"),
  customerPromptText: text("customer_prompt_text"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const drivableSeedRoadsideRiskTriggers = pgTable("drivable_seed_roadside_risk_triggers", {
  triggerId: varchar("trigger_id").primaryKey(),
  label: text("label").notNull(),
  customerPhraseExamples: text("customer_phrase_examples"),
  riskLevel: text("risk_level"),
  recommendedAction: text("recommended_action"),
  stopNow: boolean("stop_now").default(false),
  humanReviewRequired: boolean("human_review_required").default(false),
  towLikely: boolean("tow_likely").default(false),
  safeCustomerMessage: text("safe_customer_message"),
  unsafePhrasingToAvoid: text("unsafe_phrasing_to_avoid"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const drivableSeedDecisionPaths = pgTable("drivable_seed_decision_paths", {
  decisionPathId: varchar("decision_path_id").primaryKey(),
  label: text("label").notNull(),
  plainEnglishMeaning: text("plain_english_meaning"),
  whenToUse: text("when_to_use"),
  customerFacingRecommendation: text("customer_facing_recommendation"),
  safetyBoundaries: text("safety_boundaries"),
  humanReviewRecommended: boolean("human_review_recommended").default(false),
  nextInfoNeeded: text("next_info_needed"),
  relatedStatuses: text("related_statuses"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const drivableSeedFollowUpQuestions = pgTable("drivable_seed_follow_up_questions", {
  questionId: varchar("question_id").primaryKey(),
  symptomCategoryId: varchar("symptom_category_id"),
  questionText: text("question_text").notNull(),
  whyItMatters: text("why_it_matters"),
  requestedEvidence: text("requested_evidence"),
  safetyWarning: text("safety_warning"),
  priority: text("priority"),
  answerType: text("answer_type"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("seed_follow_up_symptom_idx").on(table.symptomCategoryId),
]);

export const drivableSeedRepairVsSellFactors = pgTable("drivable_seed_repair_vs_sell_factors", {
  factorId: varchar("factor_id").primaryKey(),
  label: text("label").notNull(),
  plainEnglishMeaning: text("plain_english_meaning"),
  pushesTowardRepair: text("pushes_toward_repair"),
  pushesTowardSell: text("pushes_toward_sell"),
  infoNeeded: text("info_needed"),
  riskNote: text("risk_note"),
  customerQuestion: text("customer_question"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const drivableSeedBuyerRiskFlags = pgTable("drivable_seed_buyer_risk_flags", {
  flagId: varchar("flag_id").primaryKey(),
  label: text("label").notNull(),
  sellerPhraseExamples: text("seller_phrase_examples"),
  whyItMatters: text("why_it_matters"),
  evidenceToRequest: text("evidence_to_request"),
  riskLevel: text("risk_level"),
  walkAwaySignal: text("walk_away_signal"),
  customerSafeAdvice: text("customer_safe_advice"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const drivableSeedSellerDisclosurePrompts = pgTable("drivable_seed_seller_disclosure_prompts", {
  disclosureId: varchar("disclosure_id").primaryKey(),
  issueType: text("issue_type").notNull(),
  plainEnglishDisclosurePrompt: text("plain_english_disclosure_prompt"),
  buyerConcern: text("buyer_concern"),
  evidenceHelpful: text("evidence_helpful"),
  listingLanguageSuggestion: text("listing_language_suggestion"),
  safetyOrLegalNote: text("safety_or_legal_note"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const drivableConfirmedCases = pgTable("drivable_confirmed_cases", {
  caseId: varchar("case_id").primaryKey(),
  vehicleYear: integer("vehicle_year"),
  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  symptomSummary: text("symptom_summary").notNull(),
  confirmedFix: text("confirmed_fix").notNull(),
  evidencePattern: json("evidence_pattern").$type<string[]>(),
  drivableLesson: text("drivable_lesson"),
  confidence: text("confidence").default("high"),
  source: text("source").default("glenn_confirmed_repair"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("confirmed_cases_vehicle_idx").on(table.vehicleYear, table.vehicleMake, table.vehicleModel),
]);

export const drivableVehicleKnowledgePacks = pgTable("drivable_vehicle_knowledge_packs", {
  packId: varchar("pack_id").primaryKey(),
  vehicleYear: integer("vehicle_year"),
  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  source: text("source").default("drivable_seed"),
  sourceType: text("source_type"),
  summary: text("summary"),
  riskTags: json("risk_tags").$type<string[]>(),
  buyerQuestions: json("buyer_questions").$type<string[]>(),
  sellerEvidenceRequests: json("seller_evidence_requests").$type<string[]>(),
  inspectionPrompts: json("inspection_prompts").$type<string[]>(),
  confidence: text("confidence").default("medium"),
  vinRequiredForApplicability: boolean("vin_required_for_applicability").default(false),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("knowledge_packs_vehicle_idx").on(table.vehicleYear, table.vehicleMake, table.vehicleModel),
]);


export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDiagnosisSchema = createInsertSchema(diagnoses).omit({
  id: true,
  createdAt: true,
  primaryDiagnosis: true,
  alternativeScenarios: true,
  needsMoreInfo: true,
  additionalQuestions: true,
  iterationCount: true,
  isResolved: true,
  mechanicConsultationId: true,
}).extend({
  description: z.string().min(10, "Description must be at least 10 characters"),
  vehicleInfo: z.string().min(1, "Vehicle information is required"),
  timing: z.string().min(1, "Timing information is required"),
});

export const insertMechanicSchema = createInsertSchema(mechanics).omit({
  id: true,
  rating: true,
  totalConsultations: true,
  joinedAt: true,
});

export const insertConsultationSchema = createInsertSchema(consultations).omit({
  id: true,
  createdAt: true,
  overallScore: true,
  mechanicPayment: true,
});

export const insertFollowUpSchema = createInsertSchema(followUpRequests).omit({
  id: true,
  createdAt: true,
});

export const consultationFeedbackSchema = z.object({
  wasFixed: z.boolean(),
  politenessRating: z.number().min(1).max(10),
  effectivenessRating: z.number().min(1).max(10), 
  easeOfWorkRating: z.number().min(1).max(10),
  userFeedback: z.string().optional(),
});

export const insertFixHistoryLogSchema = createInsertSchema(fixHistoryLog).omit({
  id: true,
  createdAt: true,
});

export const insertChatExportLogSchema = createInsertSchema(chatExportLog).omit({
  id: true,
  exportedAt: true,
});


export const insertDrivableSeedSymptomCategorySchema = createInsertSchema(drivableSeedSymptomCategories).omit({ createdAt: true });
export const insertDrivableSeedEvidenceItemSchema = createInsertSchema(drivableSeedEvidenceItems).omit({ createdAt: true });
export const insertDrivableSeedRoadsideRiskTriggerSchema = createInsertSchema(drivableSeedRoadsideRiskTriggers).omit({ createdAt: true });
export const insertDrivableSeedDecisionPathSchema = createInsertSchema(drivableSeedDecisionPaths).omit({ createdAt: true });
export const insertDrivableSeedFollowUpQuestionSchema = createInsertSchema(drivableSeedFollowUpQuestions).omit({ createdAt: true });
export const insertDrivableSeedRepairVsSellFactorSchema = createInsertSchema(drivableSeedRepairVsSellFactors).omit({ createdAt: true });
export const insertDrivableSeedBuyerRiskFlagSchema = createInsertSchema(drivableSeedBuyerRiskFlags).omit({ createdAt: true });
export const insertDrivableSeedSellerDisclosurePromptSchema = createInsertSchema(drivableSeedSellerDisclosurePrompts).omit({ createdAt: true });
export const insertDrivableConfirmedCaseSchema = createInsertSchema(drivableConfirmedCases).omit({ createdAt: true });
export const insertDrivableVehicleKnowledgePackSchema = createInsertSchema(drivableVehicleKnowledgePacks).omit({ createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDiagnosis = z.infer<typeof insertDiagnosisSchema>;
export type Diagnosis = typeof diagnoses.$inferSelect;
export type InsertMechanic = z.infer<typeof insertMechanicSchema>;
export type Mechanic = typeof mechanics.$inferSelect;
export type InsertConsultation = z.infer<typeof insertConsultationSchema>;
export type Consultation = typeof consultations.$inferSelect;
export type InsertFollowUp = z.infer<typeof insertFollowUpSchema>;
export type FollowUpRequest = typeof followUpRequests.$inferSelect;
export type ConsultationFeedback = z.infer<typeof consultationFeedbackSchema>;
export type InsertFixHistoryLog = z.infer<typeof insertFixHistoryLogSchema>;
export type FixHistoryLog = typeof fixHistoryLog.$inferSelect;
export type InsertChatExportLog = z.infer<typeof insertChatExportLogSchema>;
export type ChatExportLog = typeof chatExportLog.$inferSelect;


export type InsertDrivableSeedSymptomCategory = z.infer<typeof insertDrivableSeedSymptomCategorySchema>;
export type DrivableSeedSymptomCategory = typeof drivableSeedSymptomCategories.$inferSelect;
export type InsertDrivableSeedEvidenceItem = z.infer<typeof insertDrivableSeedEvidenceItemSchema>;
export type DrivableSeedEvidenceItem = typeof drivableSeedEvidenceItems.$inferSelect;
export type InsertDrivableSeedRoadsideRiskTrigger = z.infer<typeof insertDrivableSeedRoadsideRiskTriggerSchema>;
export type DrivableSeedRoadsideRiskTrigger = typeof drivableSeedRoadsideRiskTriggers.$inferSelect;
export type InsertDrivableSeedDecisionPath = z.infer<typeof insertDrivableSeedDecisionPathSchema>;
export type DrivableSeedDecisionPath = typeof drivableSeedDecisionPaths.$inferSelect;
export type InsertDrivableSeedFollowUpQuestion = z.infer<typeof insertDrivableSeedFollowUpQuestionSchema>;
export type DrivableSeedFollowUpQuestion = typeof drivableSeedFollowUpQuestions.$inferSelect;
export type InsertDrivableSeedRepairVsSellFactor = z.infer<typeof insertDrivableSeedRepairVsSellFactorSchema>;
export type DrivableSeedRepairVsSellFactor = typeof drivableSeedRepairVsSellFactors.$inferSelect;
export type InsertDrivableSeedBuyerRiskFlag = z.infer<typeof insertDrivableSeedBuyerRiskFlagSchema>;
export type DrivableSeedBuyerRiskFlag = typeof drivableSeedBuyerRiskFlags.$inferSelect;
export type InsertDrivableSeedSellerDisclosurePrompt = z.infer<typeof insertDrivableSeedSellerDisclosurePromptSchema>;
export type DrivableSeedSellerDisclosurePrompt = typeof drivableSeedSellerDisclosurePrompts.$inferSelect;
export type InsertDrivableConfirmedCase = z.infer<typeof insertDrivableConfirmedCaseSchema>;
export type DrivableConfirmedCase = typeof drivableConfirmedCases.$inferSelect;
export type InsertDrivableVehicleKnowledgePack = z.infer<typeof insertDrivableVehicleKnowledgePackSchema>;
export type DrivableVehicleKnowledgePack = typeof drivableVehicleKnowledgePacks.$inferSelect;
