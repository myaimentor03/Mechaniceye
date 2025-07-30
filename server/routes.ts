import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDiagnosisSchema } from "@shared/schema";
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

// Mock analysis function
function performMockAnalysis(diagnosisData: any) {
  const mockScenarios = [
    {
      title: "Brake Pad Wear",
      description: "The squealing noise during braking indicates worn brake pads. The metal wear indicator is making contact with the rotor, creating the high-pitched sound you're hearing.",
      confidence: 94,
      severity: "Medium Priority",
      cost: "$200-400"
    },
    {
      title: "Engine Misfire",
      description: "Irregular engine sounds and vibrations suggest one or more cylinders are not firing properly, often due to faulty spark plugs or ignition coils.",
      confidence: 87,
      severity: "High Priority", 
      cost: "$150-500"
    },
    {
      title: "Belt Issues",
      description: "A squealing sound from the engine bay often indicates a worn or loose serpentine belt that needs adjustment or replacement.",
      confidence: 76,
      severity: "Low Priority",
      cost: "$100-250"
    },
    {
      title: "Brake Rotor Warping",
      description: "Warped brake rotors can cause vibration and noise during braking, especially noticeable at higher speeds.",
      confidence: 73,
      severity: "High Priority",
      cost: "$300-600"
    },
    {
      title: "Suspension Problems",
      description: "Unusual noises when turning or driving over bumps may indicate worn suspension components like struts or ball joints.",
      confidence: 68,
      severity: "Medium Priority",
      cost: "$400-800"
    }
  ];

  // Simple keyword-based selection for demo purposes
  const keywords = (diagnosisData.description || '').toLowerCase();
  
  let selectedScenarios = [...mockScenarios];
  
  if (keywords.includes('brake') || keywords.includes('squeal')) {
    selectedScenarios = selectedScenarios.sort((a, b) => 
      a.title.toLowerCase().includes('brake') ? -1 : 1
    );
  } else if (keywords.includes('engine') || keywords.includes('misfire')) {
    selectedScenarios = selectedScenarios.sort((a, b) => 
      a.title.toLowerCase().includes('engine') ? -1 : 1
    );
  }

  const [primary, ...alternatives] = selectedScenarios.slice(0, 3);
  
  return {
    primaryDiagnosis: primary,
    alternativeScenarios: alternatives
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  
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

      // Perform mock analysis
      const analysisResults = performMockAnalysis(validatedData);

      // Create diagnosis with analysis results
      const diagnosis = await storage.createDiagnosis({
        ...validatedData,
        primaryDiagnosis: analysisResults.primaryDiagnosis,
        alternativeScenarios: analysisResults.alternativeScenarios,
      });

      res.json(diagnosis);
    } catch (error: any) {
      console.error('Diagnosis creation error:', error);
      res.status(400).json({ 
        message: error.message || "Failed to create diagnosis" 
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
