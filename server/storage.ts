import { 
  type User, 
  type InsertUser, 
  type Diagnosis, 
  type InsertDiagnosis,
  type Mechanic,
  type InsertMechanic,
  type Consultation,
  type InsertConsultation,
  type FollowUpRequest,
  type InsertFollowUp,
  users,
  diagnoses,
  mechanics,
  consultations,
  followUpRequests
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSubscription(userId: string, tier: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<User>;
  
  // Diagnosis operations
  getDiagnosis(id: string): Promise<Diagnosis | undefined>;
  getDiagnosesByUser(userId?: string): Promise<Diagnosis[]>;
  createDiagnosis(diagnosis: InsertDiagnosis): Promise<Diagnosis>;
  updateDiagnosis(id: string, updates: Partial<Diagnosis>): Promise<Diagnosis>;
  getRecentDiagnoses(limit?: number): Promise<Diagnosis[]>;
  
  // Mechanic operations
  getMechanic(id: string): Promise<Mechanic | undefined>;
  getActiveMechanics(): Promise<Mechanic[]>;
  createMechanic(mechanic: InsertMechanic): Promise<Mechanic>;
  updateMechanicRating(mechanicId: string, newRating: number): Promise<void>;
  
  // Consultation operations
  getConsultation(id: string): Promise<Consultation | undefined>;
  createConsultation(consultation: InsertConsultation): Promise<Consultation>;
  updateConsultation(id: string, updates: Partial<Consultation>): Promise<Consultation>;
  getConsultationsByMechanic(mechanicId: string): Promise<Consultation[]>;
  
  // Follow-up operations
  createFollowUp(followUp: InsertFollowUp): Promise<FollowUpRequest>;
  getFollowUpsByDiagnosis(diagnosisId: string): Promise<FollowUpRequest[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserSubscription(userId: string, tier: string, stripeCustomerId?: string, stripeSubscriptionId?: string): Promise<User> {
    const [user] = await db.update(users)
      .set({
        subscriptionTier: tier,
        stripeCustomerId,
        stripeSubscriptionId,
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Diagnosis operations
  async getDiagnosis(id: string): Promise<Diagnosis | undefined> {
    const [diagnosis] = await db.select().from(diagnoses).where(eq(diagnoses.id, id));
    return diagnosis;
  }

  async getDiagnosesByUser(userId?: string): Promise<Diagnosis[]> {
    if (userId) {
      return await db.select().from(diagnoses)
        .where(eq(diagnoses.userId, userId))
        .orderBy(desc(diagnoses.createdAt));
    }
    return await db.select().from(diagnoses).orderBy(desc(diagnoses.createdAt));
  }

  async createDiagnosis(insertDiagnosis: InsertDiagnosis): Promise<Diagnosis> {
    const [diagnosis] = await db.insert(diagnoses).values(insertDiagnosis).returning();
    return diagnosis;
  }

  async updateDiagnosis(id: string, updates: Partial<Diagnosis>): Promise<Diagnosis> {
    const [diagnosis] = await db.update(diagnoses)
      .set(updates)
      .where(eq(diagnoses.id, id))
      .returning();
    return diagnosis;
  }

  async getRecentDiagnoses(limit: number = 10): Promise<Diagnosis[]> {
    return await db.select().from(diagnoses)
      .orderBy(desc(diagnoses.createdAt))
      .limit(limit);
  }

  // Mechanic operations
  async getMechanic(id: string): Promise<Mechanic | undefined> {
    const [mechanic] = await db.select().from(mechanics).where(eq(mechanics.id, id));
    return mechanic;
  }

  async getActiveMechanics(): Promise<Mechanic[]> {
    return await db.select().from(mechanics)
      .where(eq(mechanics.isActive, true))
      .orderBy(desc(mechanics.rating));
  }

  async createMechanic(insertMechanic: InsertMechanic): Promise<Mechanic> {
    const [mechanic] = await db.insert(mechanics).values(insertMechanic).returning();
    return mechanic;
  }

  async updateMechanicRating(mechanicId: string, newRating: number): Promise<void> {
    await db.update(mechanics)
      .set({ rating: newRating.toString() })
      .where(eq(mechanics.id, mechanicId));
  }

  // Consultation operations
  async getConsultation(id: string): Promise<Consultation | undefined> {
    const [consultation] = await db.select().from(consultations).where(eq(consultations.id, id));
    return consultation;
  }

  async createConsultation(insertConsultation: InsertConsultation): Promise<Consultation> {
    const [consultation] = await db.insert(consultations).values(insertConsultation).returning();
    return consultation;
  }

  async updateConsultation(id: string, updates: Partial<Consultation>): Promise<Consultation> {
    const [consultation] = await db.update(consultations)
      .set(updates)
      .where(eq(consultations.id, id))
      .returning();
    return consultation;
  }

  async getConsultationsByMechanic(mechanicId: string): Promise<Consultation[]> {
    return await db.select().from(consultations)
      .where(eq(consultations.mechanicId, mechanicId))
      .orderBy(desc(consultations.createdAt));
  }

  // Follow-up operations
  async createFollowUp(insertFollowUp: InsertFollowUp): Promise<FollowUpRequest> {
    const [followUp] = await db.insert(followUpRequests).values(insertFollowUp).returning();
    return followUp;
  }

  async getFollowUpsByDiagnosis(diagnosisId: string): Promise<FollowUpRequest[]> {
    return await db.select().from(followUpRequests)
      .where(eq(followUpRequests.originalDiagnosisId, diagnosisId))
      .orderBy(desc(followUpRequests.createdAt));
  }
}

export const storage = new DatabaseStorage();
