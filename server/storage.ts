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
  type FixHistoryLog,
  type InsertFixHistoryLog,
  type ChatExportLog,
  type InsertChatExportLog,
  users,
  diagnoses,
  mechanics,
  consultations,
  followUpRequests,
  fixHistoryLog,
  chatExportLog
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
  
  // Fix History operations
  getFixHistory(diagnosisId: string): Promise<FixHistoryLog[]>;
  updateStepCompletion(diagnosisId: string, data: {
    suggestionIndex: number;
    stepIndex: number;
    completed: boolean;
    timeSpent?: number;
  }): Promise<any>;
  markFixComplete(diagnosisId: string, data: {
    suggestionIndex: number;
    wasSuccessful: boolean;
    feedback?: string;
    timeSpent?: number;
    stepsCompleted?: number[];
  }): Promise<any>;
  
  // Chat Export operations
  exportChatForMechanic(diagnosisId: string): Promise<any>;
  sendToMechanic(diagnosisId: string): Promise<any>;
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

  // Fix History operations
  async getFixHistory(diagnosisId: string): Promise<FixHistoryLog[]> {
    return await db.select().from(fixHistoryLog)
      .where(eq(fixHistoryLog.diagnosisId, diagnosisId))
      .orderBy(desc(fixHistoryLog.createdAt));
  }

  async updateStepCompletion(diagnosisId: string, data: {
    suggestionIndex: number;
    stepIndex: number;
    completed: boolean;
    timeSpent?: number;
  }): Promise<any> {
    // Get current diagnosis
    const diagnosis = await this.getDiagnosis(diagnosisId);
    if (!diagnosis) {
      throw new Error("Diagnosis not found");
    }

    // Update the step completion in the primary diagnosis or alternative scenarios
    let updated = false;
    
    if (data.suggestionIndex === 0 && diagnosis.primaryDiagnosis) {
      const stepsCompleted = diagnosis.primaryDiagnosis.stepsCompleted || [];
      if (data.completed && !stepsCompleted.includes(data.stepIndex)) {
        stepsCompleted.push(data.stepIndex);
      } else if (!data.completed && stepsCompleted.includes(data.stepIndex)) {
        const index = stepsCompleted.indexOf(data.stepIndex);
        stepsCompleted.splice(index, 1);
      }
      
      await db.update(diagnoses)
        .set({
          primaryDiagnosis: {
            ...diagnosis.primaryDiagnosis,
            stepsCompleted
          }
        })
        .where(eq(diagnoses.id, diagnosisId));
      updated = true;
    } else if (data.suggestionIndex > 0 && diagnosis.alternativeScenarios) {
      const scenarios = [...diagnosis.alternativeScenarios];
      const scenarioIndex = data.suggestionIndex - 1;
      
      if (scenarios[scenarioIndex]) {
        const stepsCompleted = scenarios[scenarioIndex].stepsCompleted || [];
        if (data.completed && !stepsCompleted.includes(data.stepIndex)) {
          stepsCompleted.push(data.stepIndex);
        } else if (!data.completed && stepsCompleted.includes(data.stepIndex)) {
          const index = stepsCompleted.indexOf(data.stepIndex);
          stepsCompleted.splice(index, 1);
        }
        
        scenarios[scenarioIndex] = {
          ...scenarios[scenarioIndex],
          stepsCompleted
        };
        
        await db.update(diagnoses)
          .set({ alternativeScenarios: scenarios })
          .where(eq(diagnoses.id, diagnosisId));
        updated = true;
      }
    }

    return { success: updated };
  }

  async markFixComplete(diagnosisId: string, data: {
    suggestionIndex: number;
    wasSuccessful: boolean;
    feedback?: string;
    timeSpent?: number;
    stepsCompleted?: number[];
  }): Promise<any> {
    // Create fix history log entry
    const historyEntry: InsertFixHistoryLog = {
      diagnosisId,
      userId: "", // Would normally get from session
      attemptNumber: 1, // Calculate based on existing entries
      wasSuccessful: data.wasSuccessful,
      userFeedback: data.feedback,
      stepsCompleted: data.stepsCompleted,
      timeSpent: data.timeSpent,
      suggestedFix: null // Would populate with the actual fix details
    };

    // Get existing history to calculate attempt number
    const existingHistory = await this.getFixHistory(diagnosisId);
    historyEntry.attemptNumber = existingHistory.length + 1;

    await db.insert(fixHistoryLog).values(historyEntry);

    // Update diagnosis with success status and confidence adjustment
    const diagnosis = await this.getDiagnosis(diagnosisId);
    if (diagnosis) {
      let newConfidenceScore = diagnosis.confidenceScore || 0;
      
      // Adjust confidence based on success/failure
      if (data.wasSuccessful) {
        newConfidenceScore = Math.min(100, newConfidenceScore + 10);
      } else {
        newConfidenceScore = Math.max(0, newConfidenceScore - 15);
      }

      await db.update(diagnoses)
        .set({
          confidenceScore: newConfidenceScore,
          confidenceLevel: newConfidenceScore >= 80 ? "high" : newConfidenceScore >= 60 ? "medium" : "low",
          isResolved: data.wasSuccessful
        })
        .where(eq(diagnoses.id, diagnosisId));
    }

    return { success: true, wasSuccessful: data.wasSuccessful };
  }

  // Chat Export operations
  async exportChatForMechanic(diagnosisId: string): Promise<any> {
    const diagnosis = await this.getDiagnosis(diagnosisId);
    const fixHistory = await this.getFixHistory(diagnosisId);
    
    if (!diagnosis) {
      throw new Error("Diagnosis not found");
    }

    const exportData = {
      timestamp: new Date().toISOString(),
      diagnosisId,
      userInputs: {
        vehicleInfo: diagnosis.vehicleInfo,
        description: diagnosis.description,
        timing: diagnosis.timing,
        audioFile: diagnosis.audioFile,
        videoFile: diagnosis.videoFile,
        vibrationData: diagnosis.vibrationData
      },
      aiSuggestions: {
        primaryDiagnosis: diagnosis.primaryDiagnosis,
        alternativeScenarios: diagnosis.alternativeScenarios,
        confidence: diagnosis.confidenceScore
      },
      fixHistory: fixHistory.map(h => ({
        attemptNumber: h.attemptNumber,
        wasSuccessful: h.wasSuccessful,
        userFeedback: h.userFeedback,
        timeSpent: h.timeSpent,
        stepsCompleted: h.stepsCompleted
      })),
      summary: {
        totalAttempts: fixHistory.length + 1,
        successfulFixes: fixHistory.filter(h => h.wasSuccessful).length,
        averageTime: fixHistory.reduce((acc, h) => acc + (h.timeSpent || 0), 0) / Math.max(1, fixHistory.length)
      }
    };

    // Log the export
    const exportLogEntry: InsertChatExportLog = {
      diagnosisId,
      userId: "", // Would get from session
      exportData: exportData as any
    };

    await db.insert(chatExportLog).values(exportLogEntry);
    
    return exportData;
  }

  async sendToMechanic(diagnosisId: string): Promise<any> {
    // In a real app, this would send the export data to available mechanics
    // For now, we'll just mark it as sent
    const exportData = await this.exportChatForMechanic(diagnosisId);
    
    return {
      success: true,
      message: "Diagnostic data sent to available mechanics",
      exportData
    };
  }
}

export const storage = new DatabaseStorage();
