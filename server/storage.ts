type DiagnosisRecord = {
  id: string;
  userId?: string;
  vehicleInfo?: string;
  description?: string;
  timing?: string;
  audioFile?: string | null;
  videoFile?: string | null;
  vibrationData?: unknown;
  confidenceScore?: number;
  confidenceLevel?: string;
  inputTypes?: string[];
  iterationCount?: number;
  createdAt: string;
  status?: string;
  primaryDiagnosis?: { title?: string; confidence?: number } | null;
  alternativeScenarios?: Array<{ title?: string }>;
};

type FollowUpRecord = {
  id: string;
  originalDiagnosisId: string;
  userId?: string;
  additionalInfo?: string;
  newAudioFile?: string | null;
  newVideoFile?: string | null;
  newVibrationData?: unknown;
  createdAt: string;
};

type ConsultationRecord = {
  id: string;
  diagnosisId: string;
  mechanicId: string;
  userId?: string;
  status: string;
  overallScore?: string;
  completedAt?: Date | string;
  politenessRating?: number;
  effectivenessRating?: number;
  easeOfWorkRating?: number;
  wasFixed?: boolean;
};

class LocalStorage {
  private diagnoses = new Map<string, DiagnosisRecord>();
  private followUps = new Map<string, FollowUpRecord[]>();
  private consultations = new Map<string, ConsultationRecord[]>();
  private mechanics = [
    { id: "mechanic-1", name: "Mechanic Queue", active: true, rating: 5 }
  ];

  async getRecentDiagnoses(limit: number) {
    return Array.from(this.diagnoses.values())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  }

  async getFixHistory(_diagnosisId: string) {
    return [];
  }

  async updateStepCompletion(diagnosisId: string, data: any) {
    return { success: true, diagnosisId, ...data };
  }

  async markFixComplete(diagnosisId: string, data: any) {
    return { success: true, diagnosisId, ...data };
  }

  async exportChatForMechanic(diagnosisId: string) {
    const diagnosis = this.diagnoses.get(diagnosisId);
    if (!diagnosis) {
      throw new Error("Diagnosis not found");
    }

    return {
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
        primaryDiagnosis: diagnosis.primaryDiagnosis || null,
        alternativeScenarios: diagnosis.alternativeScenarios || [],
        confidence: diagnosis.confidenceScore || 0
      },
      fixHistory: [],
      summary: {
        totalAttempts: 1,
        successfulFixes: 0,
        averageTime: 0
      }
    };
  }

  async sendToMechanic(diagnosisId: string) {
    const exportData = await this.exportChatForMechanic(diagnosisId);
    return {
      success: true,
      message: "Diagnostic data sent to available mechanics",
      exportData
    };
  }

  async getDiagnosesByUser() {
    return Array.from(this.diagnoses.values());
  }

  async getDiagnosis(id: string) {
    return this.diagnoses.get(id) || null;
  }

  async createDiagnosis(data: Partial<DiagnosisRecord>) {
    const diagnosis: DiagnosisRecord = {
      id: data.id || Date.now().toString(),
      userId: data.userId || "",
      vehicleInfo: data.vehicleInfo || "",
      description: data.description || "",
      timing: data.timing || "",
      audioFile: data.audioFile ?? null,
      videoFile: data.videoFile ?? null,
      vibrationData: data.vibrationData ?? null,
      confidenceScore: data.confidenceScore || 0,
      confidenceLevel: data.confidenceLevel || "low",
      inputTypes: data.inputTypes || [],
      iterationCount: data.iterationCount || 1,
      primaryDiagnosis: data.primaryDiagnosis || null,
      alternativeScenarios: data.alternativeScenarios || [],
      createdAt: new Date().toISOString(),
      status: data.status || "received"
    };

    this.diagnoses.set(diagnosis.id, diagnosis);
    return diagnosis;
  }

  async createFollowUp(data: Partial<FollowUpRecord>) {
    const followUp: FollowUpRecord = {
      id: Date.now().toString(),
      originalDiagnosisId: data.originalDiagnosisId || "",
      userId: data.userId || "",
      additionalInfo: data.additionalInfo || "",
      newAudioFile: data.newAudioFile ?? null,
      newVideoFile: data.newVideoFile ?? null,
      newVibrationData: data.newVibrationData ?? null,
      createdAt: new Date().toISOString()
    };

    const existing = this.followUps.get(followUp.originalDiagnosisId) || [];
    existing.push(followUp);
    this.followUps.set(followUp.originalDiagnosisId, existing);
    return followUp;
  }

  async getFollowUpsByDiagnosis(diagnosisId: string) {
    return this.followUps.get(diagnosisId) || [];
  }

  async getActiveMechanics() {
    return this.mechanics.filter(m => m.active);
  }

  async createConsultation(data: Partial<ConsultationRecord>) {
    const consultation: ConsultationRecord = {
      id: Date.now().toString(),
      diagnosisId: data.diagnosisId || "",
      mechanicId: data.mechanicId || "",
      userId: data.userId || "",
      status: data.status || "pending"
    };

    const existing = this.consultations.get(consultation.mechanicId) || [];
    existing.push(consultation);
    this.consultations.set(consultation.mechanicId, existing);
    return consultation;
  }

  async updateConsultation(id: string, updates: Partial<ConsultationRecord>) {
    for (const [mechanicId, list] of this.consultations.entries()) {
      const index = list.findIndex(item => item.id === id);
      if (index >= 0) {
        list[index] = { ...list[index], ...updates };
        this.consultations.set(mechanicId, list);
        return list[index];
      }
    }
    throw new Error("Consultation not found");
  }

  async getConsultationsByMechanic(mechanicId: string) {
    return this.consultations.get(mechanicId) || [];
  }

  async updateMechanicRating(mechanicId: string, averageRating: number) {
    this.mechanics = this.mechanics.map(m =>
      m.id === mechanicId ? { ...m, rating: averageRating } : m
    );
    return { success: true, mechanicId, averageRating };
  }
}

export const storage = new LocalStorage();
