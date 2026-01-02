import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDiagnosisSchema, insertFollowUpSchema, consultationFeedbackSchema } from "@shared/schema";
import { performEnhancedAnalysis } from "./enhanced-analysis";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a',
      'video/mp4', 'video/quicktime', 'video/x-msvideo'
    ];
    cb(null, allowedMimes.includes(file.mimetype));
  }
});

// Subscription tier features
const SUBSCRIPTION_FEATURES = {
  basic: {
    maxAnalyses: 5,
    features: ['description', 'photos', 'audio'],
    price: 14.99
  },
  premium: {
    maxAnalyses: 20,
    features: ['description', 'photos', 'audio', 'vibration'],
    price: 19.99
  },
  expert: {
    maxAnalyses: -1, // unlimited
    features: ['description', 'photos', 'audio', 'vibration', 'mechanic_consultation'],
    price: 24.99
  }
};

function checkSubscriptionAccess(userTier: string, feature: string): boolean {
  const tierFeatures = SUBSCRIPTION_FEATURES[userTier as keyof typeof SUBSCRIPTION_FEATURES];
  return tierFeatures ? tierFeatures.features.includes(feature) : false;
}

export async function registerRoutes(app: Express): Promise<Server> {

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

  
  // Get recent diagnoses
  app.get("/api/diagnoses/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const diagnoses = await storage.getRecentDiagnoses(limit);
      res.json(diagnoses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent diagnoses" });
    }
  });

  // Fix History Log endpoints
  app.get("/api/fix-history/:diagnosisId", async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const history = await storage.getFixHistory(diagnosisId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching fix history:", error);
      res.status(500).json({ message: "Failed to fetch fix history" });
    }
  });

  // Update step completion
  app.post("/api/diagnoses/:diagnosisId/steps", async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const { suggestionIndex, stepIndex, completed, timeSpent } = req.body;
      
      const result = await storage.updateStepCompletion(diagnosisId, {
        suggestionIndex,
        stepIndex,
        completed,
        timeSpent
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error updating step completion:", error);
      res.status(500).json({ message: "Failed to update step completion" });
    }
  });

  // Mark fix as complete
  app.post("/api/diagnoses/:diagnosisId/fix-complete", async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const { suggestionIndex, wasSuccessful, feedback, timeSpent, stepsCompleted } = req.body;
      
      const result = await storage.markFixComplete(diagnosisId, {
        suggestionIndex,
        wasSuccessful,
        feedback,
        timeSpent,
        stepsCompleted
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error marking fix complete:", error);
      res.status(500).json({ message: "Failed to mark fix complete" });
    }
  });

  // Export chat for mechanic
  app.post("/api/diagnoses/:diagnosisId/export-chat", async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const exportData = await storage.exportChatForMechanic(diagnosisId);
      res.json(exportData);
    } catch (error) {
      console.error("Error exporting chat:", error);
      res.status(500).json({ message: "Failed to export chat" });
    }
  });

  // Send to mechanic
  app.post("/api/diagnoses/:diagnosisId/send-to-mechanic", async (req, res) => {
    try {
      const { diagnosisId } = req.params;
      const result = await storage.sendToMechanic(diagnosisId);
      res.json(result);
    } catch (error) {
      console.error("Error sending to mechanic:", error);
      res.status(500).json({ message: "Failed to send to mechanic" });
    }
  });

  // Get all diagnoses
  app.get("/api/diagnoses", async (req, res) => {
    try {
      const diagnoses = await storage.getDiagnosesByUser();
      res.json(diagnoses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch diagnoses" });
    }
  });

  // Get specific diagnosis
  app.get("/api/diagnoses/:id", async (req, res) => {
    try {
      const diagnosis = await storage.getDiagnosis(req.params.id);
      if (!diagnosis) {
        return res.status(404).json({ message: "Diagnosis not found" });
      }
      res.json(diagnosis);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch diagnosis" });
    }
  });

  // Create new diagnosis with file uploads
  app.post("/api/diagnoses", upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      // Parse form data
      const diagnosisData = {
        description: req.body.description,
        vehicleInfo: req.body.vehicleInfo,
        timing: req.body.timing,
        vibrationData: req.body.vibrationData ? JSON.parse(req.body.vibrationData) : null,
        audioFile: files?.audio?.[0]?.filename || null,
        videoFile: files?.video?.[0]?.filename || null,
      };

      // Validate the data
      const validatedData = insertDiagnosisSchema.parse(diagnosisData);

      // Perform enhanced analysis
      const analysisResults = performEnhancedAnalysis(validatedData);

      // Create diagnosis with analysis results
      const diagnosis = await storage.createDiagnosis({
        ...validatedData,
        confidenceScore: analysisResults.primaryDiagnosis?.confidence || 0,
        confidenceLevel: analysisResults.primaryDiagnosis?.confidence >= 80 ? "high" : 
                       analysisResults.primaryDiagnosis?.confidence >= 60 ? "medium" : "low",
        inputTypes: [
          validatedData.description ? "description" : null,
          validatedData.audioFile ? "audio" : null,
          validatedData.videoFile ? "video" : null,
          validatedData.vibrationData ? "vibration" : null
        ].filter(Boolean) as string[]
      });

      res.json(diagnosis);
    } catch (error: any) {
      console.error('Diagnosis creation error:', error);
      res.status(400).json({ 
        message: error.message || "Failed to create diagnosis" 
      });
    }
  });

  // Create follow-up request when previous fixes didn't work
  app.post("/api/diagnoses/:id/follow-up", upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const diagnosisId = req.params.id;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      // Get original diagnosis
      const originalDiagnosis = await storage.getDiagnosis(diagnosisId);
      if (!originalDiagnosis) {
        return res.status(404).json({ message: "Original diagnosis not found" });
      }

      // Create follow-up request
      const followUpData = {
        originalDiagnosisId: diagnosisId,
        userId: originalDiagnosis.userId!,
        additionalInfo: req.body.additionalInfo,
        newAudioFile: files?.audio?.[0]?.filename || null,
        newVideoFile: files?.video?.[0]?.filename || null,
        newVibrationData: req.body.vibrationData ? JSON.parse(req.body.vibrationData) : null,
      };

      const followUp = await storage.createFollowUp(followUpData);

      // Get previously attempted fixes
      const previousFollowUps = await storage.getFollowUpsByDiagnosis(diagnosisId);
      const previousAttempts = [
        originalDiagnosis.primaryDiagnosis?.title,
        ...originalDiagnosis.alternativeScenarios?.map(s => s.title) || [],
        ...previousFollowUps.map(fu => `Follow-up ${fu.id}`)
      ].filter(Boolean);

      // Perform enhanced analysis with iteration count
      const iterationCount = previousFollowUps.length + 2; // +1 for original, +1 for current
      const analysisResults = performEnhancedAnalysis(
        {
          description: `${originalDiagnosis.description}\n\nAdditional info: ${followUpData.additionalInfo}`,
          vehicleInfo: originalDiagnosis.vehicleInfo,
          timing: originalDiagnosis.timing
        },
        iterationCount,
        previousAttempts
      );

      // Create new diagnosis with follow-up results
      const newDiagnosis = await storage.createDiagnosis({
        userId: originalDiagnosis.userId,
        vehicleInfo: originalDiagnosis.vehicleInfo!,
        description: `Follow-up #${iterationCount - 1}: ${followUpData.additionalInfo}`,
        timing: originalDiagnosis.timing!,
        audioFile: followUpData.newAudioFile,
        videoFile: followUpData.newVideoFile,
        vibrationData: followUpData.newVibrationData,
        confidenceScore: analysisResults.primaryDiagnosis?.confidence || 0,
        confidenceLevel: analysisResults.primaryDiagnosis?.confidence >= 80 ? "high" : 
                       analysisResults.primaryDiagnosis?.confidence >= 60 ? "medium" : "low",
        inputTypes: [
          "description",
          followUpData.newAudioFile ? "audio" : null,
          followUpData.newVideoFile ? "video" : null,
          followUpData.newVibrationData ? "vibration" : null
        ].filter(Boolean) as string[],
        iterationCount,
      });

      res.json(newDiagnosis);
    } catch (error: any) {
      console.error('Follow-up creation error:', error);
      res.status(400).json({ 
        message: error.message || "Failed to create follow-up" 
      });
    }
  });

  // Get subscription pricing and features
  app.get("/api/subscription/tiers", (req, res) => {
    res.json(SUBSCRIPTION_FEATURES);
  });

  // Get available mechanics for consultation
  app.get("/api/mechanics", async (req, res) => {
    try {
      const mechanics = await storage.getActiveMechanics();
      res.json(mechanics);
   } catch (error) {
  console.error("Failed to fetch recent diagnoses:", error);
  res.status(500).json({ message: "Failed to fetch recent diagnoses" });
}
  });

  // Start mechanic consultation
  app.post("/api/consultations", async (req, res) => {
    try {
      const { diagnosisId, mechanicId, userId } = req.body;
      
      const consultation = await storage.createConsultation({
        diagnosisId,
        mechanicId, 
        userId,
        status: "pending"
      });

      res.json(consultation);
    } catch (error: any) {
      res.status(400).json({ 
        message: error.message || "Failed to start consultation" 
      });
    }
  });

  // Submit consultation feedback
  app.post("/api/consultations/:id/feedback", async (req, res) => {
    try {
      const consultationId = req.params.id;
      const feedbackData = consultationFeedbackSchema.parse(req.body);
      
      // Calculate overall score (average of ratings, with wasFixed bonus)
      const ratingAverage = (
        feedbackData.politenessRating + 
        feedbackData.effectivenessRating + 
        feedbackData.easeOfWorkRating
      ) / 3;
      
      const overallScore = feedbackData.wasFixed ? 
        Math.min(ratingAverage + 1, 10) : ratingAverage;

      const consultation = await storage.updateConsultation(consultationId, {
        ...feedbackData,
        overallScore: overallScore.toString(),
        status: "completed",
        completedAt: new Date()
      });

      // Update mechanic rating based on feedback
      const consultations = await storage.getConsultationsByMechanic(consultation.mechanicId);
      const averageRating = consultations
        .filter(c => c.overallScore)
        .reduce((sum, c) => sum + parseFloat(c.overallScore!), 0) / consultations.length;
      
      await storage.updateMechanicRating(consultation.mechanicId, averageRating);

      res.json(consultation);
    } catch (error: any) {
      res.status(400).json({ 
        message: error.message || "Failed to submit feedback" 
      });
    }
  });

  // Serve uploaded files
  app.get("/api/files/:filename", (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(uploadDir, filename);
    
    if (fs.existsSync(filepath)) {
      res.sendFile(filepath);
    } else {
      res.status(404).json({ message: "File not found" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
