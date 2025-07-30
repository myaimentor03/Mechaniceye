import { type User, type InsertUser, type Diagnosis, type InsertDiagnosis } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getDiagnosis(id: string): Promise<Diagnosis | undefined>;
  getDiagnosesByUser(userId?: string): Promise<Diagnosis[]>;
  createDiagnosis(diagnosis: InsertDiagnosis): Promise<Diagnosis>;
  getRecentDiagnoses(limit?: number): Promise<Diagnosis[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private diagnoses: Map<string, Diagnosis>;

  constructor() {
    this.users = new Map();
    this.diagnoses = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getDiagnosis(id: string): Promise<Diagnosis | undefined> {
    return this.diagnoses.get(id);
  }

  async getDiagnosesByUser(userId?: string): Promise<Diagnosis[]> {
    return Array.from(this.diagnoses.values())
      .filter(diagnosis => !userId || diagnosis.userId === userId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  async createDiagnosis(insertDiagnosis: InsertDiagnosis): Promise<Diagnosis> {
    const id = randomUUID();
    const diagnosis: Diagnosis = {
      ...insertDiagnosis,
      id,
      createdAt: new Date(),
    };
    this.diagnoses.set(id, diagnosis);
    return diagnosis;
  }

  async getRecentDiagnoses(limit: number = 10): Promise<Diagnosis[]> {
    return Array.from(this.diagnoses.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, limit);
  }
}

export const storage = new MemStorage();
