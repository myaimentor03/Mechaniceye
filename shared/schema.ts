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
