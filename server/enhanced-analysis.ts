interface EnhancedDiagnosis {
  title: string;
  description: string;
  confidence: number;
  severity: string;
  cost: string;
  instructions: string[];
  requiredTools: string[];
  estimatedTime: string;
}

export const enhancedDiagnosisDatabase: EnhancedDiagnosis[] = [
  {
    title: "Brake Pad Wear",
    description: "The squealing noise during braking indicates worn brake pads. The metal wear indicator is making contact with the rotor, creating the high-pitched sound you're hearing.",
    confidence: 94,
    severity: "Medium Priority",
    cost: "$200-400",
    instructions: [
      "Jack up the vehicle and secure with jack stands",
      "Remove the wheel to access the brake caliper",
      "Remove the brake caliper mounting bolts",
      "Slide out the old brake pads from the caliper bracket",
      "Clean the caliper bracket and apply brake grease to contact points",
      "Install new brake pads in the same position as old ones",
      "Compress the caliper piston using a C-clamp or piston tool",
      "Reinstall the caliper and tighten mounting bolts to specification",
      "Pump the brake pedal several times before driving",
      "Test brakes at low speed before normal operation"
    ],
    requiredTools: ["Jack and jack stands", "Socket wrench set", "C-clamp or brake piston tool", "Wire brush", "Brake cleaner", "High-temperature brake grease"],
    estimatedTime: "1-2 hours per axle"
  },
  {
    title: "Engine Misfire",
    description: "Irregular engine sounds and vibrations suggest one or more cylinders are not firing properly, often due to faulty spark plugs or ignition coils.",
    confidence: 87,
    severity: "High Priority", 
    cost: "$150-500",
    instructions: [
      "Use an OBD-II scanner to identify which cylinder is misfiring",
      "Remove the engine cover to access spark plugs and coils",
      "Test ignition coils with a multimeter for proper resistance",
      "Remove spark plugs using a spark plug socket",
      "Inspect spark plugs for wear, carbon buildup, or damage",
      "Check spark plug gap with a feeler gauge",
      "Replace worn spark plugs with manufacturer-specified parts",
      "Apply anti-seize compound to new spark plug threads",
      "Install spark plugs and tighten to specified torque",
      "Clear diagnostic codes and test drive to verify repair"
    ],
    requiredTools: ["OBD-II scanner", "Socket wrench set", "Spark plug socket", "Feeler gauge", "Multimeter", "Anti-seize compound"],
    estimatedTime: "1-3 hours"
  },
  {
    title: "Belt Issues",
    description: "A squealing sound from the engine bay often indicates a worn or loose serpentine belt that needs adjustment or replacement.",
    confidence: 76,
    severity: "Low Priority",
    cost: "$100-250",
    instructions: [
      "Locate the serpentine belt routing diagram (usually on a sticker under the hood)",
      "Inspect the belt for cracks, fraying, or glazing",
      "Check belt tension by pressing down on the longest span",
      "If replacing, take a photo of the current belt routing",
      "Use a wrench to relieve tension on the belt tensioner",
      "Slide the old belt off the pulleys while maintaining tensioner position",
      "Route the new belt according to the diagram",
      "Release the tensioner to apply proper tension to the new belt",
      "Start the engine and listen for proper operation",
      "Check that all accessories (AC, power steering, alternator) work properly"
    ],
    requiredTools: ["Socket wrench set", "Belt tension gauge (optional)", "Flashlight"],
    estimatedTime: "30 minutes to 1 hour"
  },
  {
    title: "Brake Rotor Warping",
    description: "Warped brake rotors can cause vibration and noise during braking, especially noticeable at higher speeds.",
    confidence: 73,
    severity: "High Priority",
    cost: "$300-600",
    instructions: [
      "Jack up the vehicle and remove the wheels",
      "Remove the brake caliper and secure it with wire (don't let it hang)",
      "Remove the caliper bracket to access the rotor",
      "Check rotor thickness with a micrometer at multiple points",
      "Measure rotor runout using a dial indicator",
      "If within specifications, have rotors machined at a shop",
      "If too thin, replace with new rotors matching vehicle specifications",
      "Clean new rotors with brake cleaner to remove protective coating",
      "Install rotors and reassemble caliper bracket",
      "Reinstall brake caliper and pads, pump brakes before driving"
    ],
    requiredTools: ["Jack and jack stands", "Socket wrench set", "Micrometer", "Dial indicator", "Wire or bungee cord", "Brake cleaner"],
    estimatedTime: "2-4 hours"
  },
  {
    title: "Suspension Problems",
    description: "Unusual noises when turning or driving over bumps may indicate worn suspension components like struts or ball joints.",
    confidence: 68,
    severity: "Medium Priority",
    cost: "$400-800",
    instructions: [
      "Perform a visual inspection of suspension components",
      "Check for oil leaks around struts and shocks",
      "Inspect ball joints for excessive play by grasping the wheel",
      "Listen for clicking or popping sounds while turning the wheel",
      "Test shock absorbers by pushing down on each corner of the vehicle",
      "Use a pry bar to check ball joint and tie rod end play",
      "If components are worn, mark their position before removal",
      "Use proper spring compressor tools when working with struts",
      "Replace worn components with OEM or equivalent quality parts",
      "Have alignment checked after suspension repairs"
    ],
    requiredTools: ["Jack and jack stands", "Pry bar", "Spring compressor (if needed)", "Socket wrench set", "Flashlight", "Safety glasses"],
    estimatedTime: "3-6 hours depending on components"
  },
  {
    title: "Transmission Issues",
    description: "Grinding or whining noises during gear changes may indicate transmission problems requiring immediate attention.",
    confidence: 85,
    severity: "High Priority",
    cost: "$800-2500",
    instructions: [
      "Check transmission fluid level and condition using the dipstick",
      "Look for fluid leaks under the vehicle where it's parked",
      "Test drive to identify when the noise occurs (shifting, turning, etc.)",
      "Use an OBD-II scanner to check for transmission codes",
      "Inspect CV joints by turning the wheel while listening for clicking",
      "Check transmission mount for excessive movement",
      "If fluid is low, add the correct type specified in owner's manual",
      "If fluid is burnt (dark/smells burnt), consider transmission service",
      "For internal damage, seek professional transmission repair",
      "Document symptoms clearly for transmission specialist consultation"
    ],
    requiredTools: ["OBD-II scanner", "Flashlight", "Correct transmission fluid", "Funnel", "Jack and jack stands (if needed)"],
    estimatedTime: "1 hour diagnosis, repair varies widely"
  }
];

export function generateAdditionalQuestions(diagnosisTitle: string, iterationCount: number): string[] {
  const baseQuestions = [
    "Has the problem gotten worse since you first noticed it?",
    "Does the issue occur at specific temperatures (hot/cold engine)?",
    "Have you had any recent repairs or maintenance done?",
    "Do you hear the noise with the engine off but key in accessory position?"
  ];

  const specificQuestions: { [key: string]: string[] } = {
    "Brake Pad Wear": [
      "Do you feel vibration in the brake pedal when braking?",
      "Does the noise happen every time you brake or only sometimes?",
      "Is the noise louder when braking hard vs. light braking?",
      "Do you notice any pulling to one side when braking?"
    ],
    "Engine Misfire": [
      "Does the engine shake more at idle or while driving?",
      "Have you noticed any decrease in fuel economy?",
      "Does the check engine light flash or stay solid?",
      "Do you smell any unusual odors from the exhaust?"
    ],
    "Belt Issues": [
      "Does the noise happen immediately when starting or after warming up?",
      "Does turning on the AC or other accessories affect the noise?",
      "Can you see any obvious damage to the belt?",
      "Has the noise intensity changed over time?"
    ]
  };

  let questions = [...baseQuestions];
  
  if (specificQuestions[diagnosisTitle]) {
    questions = [...questions, ...specificQuestions[diagnosisTitle]];
  }

  // Add iteration-specific questions for follow-ups
  if (iterationCount > 1) {
    questions.push(
      "Which of the previous suggested fixes have you already tried?",
      "Did any of the previous suggestions make the problem better or worse?",
      "Have any new symptoms appeared since the last diagnosis?"
    );
  }

  return questions.slice(0, 5); // Limit to 5 questions to avoid overwhelming
}

export function performEnhancedAnalysis(
  diagnosisData: any, 
  iterationCount: number = 1,
  previousAttempts: string[] = []
): {
  primaryDiagnosis: EnhancedDiagnosis;
  alternativeScenarios: EnhancedDiagnosis[];
  needsMoreInfo: boolean;
  additionalQuestions: string[];
} {
  const keywords = (diagnosisData.description || '').toLowerCase();
  
  let availableScenarios = enhancedDiagnosisDatabase.filter(
    scenario => !previousAttempts.includes(scenario.title)
  );

  // If we've tried everything, include all scenarios but mark as needing professional help
  if (availableScenarios.length < 3) {
    availableScenarios = [...enhancedDiagnosisDatabase];
  }
  
  // Score diagnoses based on keywords and context
  let scoredDiagnoses = availableScenarios.map(diagnosis => {
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
    if (keywords.includes('noise') && diagnosis.title.toLowerCase().includes('belt')) {
      score += 8;
    }
    
    // Adjust score based on timing
    if (diagnosisData.timing === 'braking' && diagnosis.title.toLowerCase().includes('brake')) {
      score += 20;
    }
    if (diagnosisData.timing === 'startup' && diagnosis.title.toLowerCase().includes('engine')) {
      score += 15;
    }
    
    // Reduce confidence for later iterations if no additional data
    if (iterationCount > 1) {
      score -= (iterationCount - 1) * 5;
    }
    
    return {
      ...diagnosis,
      confidence: Math.min(Math.max(score, 30), 98)
    };
  });

  // Sort by confidence score
  scoredDiagnoses.sort((a, b) => b.confidence - a.confidence);

  const [primary, ...alternatives] = scoredDiagnoses.slice(0, 3);
  
  // Determine if we need more information
  const needsMoreInfo = iterationCount <= 3 && (
    primary.confidence < 80 || 
    (iterationCount > 1 && primary.confidence < 90)
  );

  const additionalQuestions = needsMoreInfo ? 
    generateAdditionalQuestions(primary.title, iterationCount) : [];

  return {
    primaryDiagnosis: primary,
    alternativeScenarios: alternatives,
    needsMoreInfo,
    additionalQuestions
  };
}