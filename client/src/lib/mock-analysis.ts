export interface MockDiagnosis {
  title: string;
  description: string;
  confidence: number;
  severity: "Low Priority" | "Medium Priority" | "High Priority";
  cost: string;
}

export const mockDiagnosisDatabase: MockDiagnosis[] = [
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
  },
  {
    title: "Transmission Issues",
    description: "Grinding or whining noises during gear changes may indicate transmission problems requiring immediate attention.",
    confidence: 85,
    severity: "High Priority",
    cost: "$800-2500"
  },
  {
    title: "Alternator Problems",
    description: "Electrical issues and unusual noises from the engine bay may indicate a failing alternator affecting charging system.",
    confidence: 79,
    severity: "Medium Priority",
    cost: "$300-700"
  },
  {
    title: "Exhaust System Issues",
    description: "Loud rumbling or hissing sounds may indicate problems with the exhaust system, muffler, or catalytic converter.",
    confidence: 72,
    severity: "Low Priority",
    cost: "$200-800"
  }
];

export function analyzeVehicleIssue(description: string, timing: string, vehicleInfo: string): {
  primaryDiagnosis: MockDiagnosis;
  alternativeScenarios: MockDiagnosis[];
} {
  const keywords = description.toLowerCase();
  let scoredDiagnoses = [...mockDiagnosisDatabase];

  // Score diagnoses based on keywords
  scoredDiagnoses = scoredDiagnoses.map(diagnosis => {
    let score = diagnosis.confidence;
    
    // Boost score for relevant keywords
    if (keywords.includes('brake') && diagnosis.title.toLowerCase().includes('brake')) {
      score += 15;
    }
    if (keywords.includes('squeal') && diagnosis.title.toLowerCase().includes('brake')) {
      score += 10;
    }
    if (keywords.includes('engine') && diagnosis.title.toLowerCase().includes('engine')) {
      score += 15;
    }
    if (keywords.includes('vibrat') && diagnosis.title.toLowerCase().includes('suspension')) {
      score += 12;
    }
    if (keywords.includes('noise') && diagnosis.title.toLowerCase().includes('exhaust')) {
      score += 8;
    }
    
    // Adjust score based on timing
    if (timing === 'braking' && diagnosis.title.toLowerCase().includes('brake')) {
      score += 20;
    }
    if (timing === 'startup' && diagnosis.title.toLowerCase().includes('engine')) {
      score += 15;
    }
    
    return {
      ...diagnosis,
      confidence: Math.min(Math.max(score, 30), 98) // Keep between 30-98%
    };
  });

  // Sort by confidence score
  scoredDiagnoses.sort((a, b) => b.confidence - a.confidence);

  const [primary, ...alternatives] = scoredDiagnoses.slice(0, 3);

  return {
    primaryDiagnosis: primary,
    alternativeScenarios: alternatives
  };
}
