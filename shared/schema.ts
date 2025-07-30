import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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
  }>(),
  alternativeScenarios: json("alternative_scenarios").$type<Array<{
    title: string;
    description: string;
    confidence: number;
    severity: string;
    cost: string;
  }>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDiagnosisSchema = createInsertSchema(diagnoses).omit({
  id: true,
  createdAt: true,
}).extend({
  description: z.string().min(10, "Description must be at least 10 characters"),
  vehicleInfo: z.string().min(1, "Vehicle information is required"),
  timing: z.string().min(1, "Timing information is required"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertDiagnosis = z.infer<typeof insertDiagnosisSchema>;
export type Diagnosis = typeof diagnoses.$inferSelect;
