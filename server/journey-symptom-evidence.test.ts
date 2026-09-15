import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifySymptoms,
  getTopSymptomCategory,
  shouldRequestHumanReview,
  isCriticalRisk,
  resetPhraseIndex,
} from "./journey-symptom-classifier";
import {
  createJourneyCase,
  type JourneyCase,
} from "./journey-state-machine";
import {
  planEvidence,
  getNextEvidenceToRequest,
  buildEvidencePrompt,
} from "./journey-evidence-planner";

const MOCK_SYMPTOM_CATEGORIES = [
  {
    symptomCategoryId: "brake_noise",
    label: "Noise occurs during braking",
    plainEnglishDescription: "Noise occurs during braking.",
    commonCustomerPhrases: "brakes squeak; grinding when stopping",
    commonEvidenceNeeded: "vehicle details; timeline; dashboard photo",
    possibleRiskLevel: "high",
    highRiskSignals: "loud grinding; reduced braking",
    relatedRoadsideModes: "can_i_keep_driving",
    recommendedInitialPath: "schedule_inspection",
    humanReviewRecommended: true,
    safetyNote: "Do not drive when control risk is present.",
    raw: null,
    createdAt: new Date(),
  },
  {
    symptomCategoryId: "overheating",
    label: "Engine temperature is too high",
    plainEnglishDescription: "Engine temperature is too high.",
    commonCustomerPhrases: "temperature gauge is hot; overheating",
    commonEvidenceNeeded: "vehicle details; dashboard photo",
    possibleRiskLevel: "critical",
    highRiskSignals: "steam; coolant pouring out",
    relatedRoadsideModes: "roadside_now",
    recommendedInitialPath: "stop_now",
    humanReviewRecommended: true,
    safetyNote: "Do not drive when overheating.",
    raw: null,
    createdAt: new Date(),
  },
  {
    symptomCategoryId: "weird_noise",
    label: "An unfamiliar noise needs classification",
    plainEnglishDescription: "An unfamiliar noise needs classification.",
    commonCustomerPhrases: "weird sound; rattle or hum",
    commonEvidenceNeeded: "vehicle details; audio",
    possibleRiskLevel: "unknown",
    highRiskSignals: "grinding; knocking",
    relatedRoadsideModes: "can_i_keep_driving",
    recommendedInitialPath: "request_more_info",
    humanReviewRecommended: false,
    safetyNote: null,
    raw: null,
    createdAt: new Date(),
  },
];

const MOCK_EVIDENCE_ITEMS = [
  {
    evidenceId: "dash_warning_photo",
    label: "Dashboard warning photo",
    description: "Dashboard warning photo can add context.",
    evidenceType: "photo",
    usefulForSymptomCategories: "check_engine_light;abs_light;airbag_light",
    safeCaptureInstructions: "Photograph the parked vehicle dashboard.",
    unsafeCaptureWarning: "Do not photograph while driving.",
    priority: "high",
    customerPromptText: "Please provide dashboard warning photo.",
    raw: null,
    createdAt: new Date(),
  },
  {
    evidenceId: "sound_audio_clip",
    label: "Sound or audio clip",
    description: "Sound or audio clip can add context.",
    evidenceType: "audio",
    usefulForSymptomCategories: "weird_noise;brake_noise;wheel_bearing_noise",
    safeCaptureInstructions: "Record briefly from a safe parked location.",
    unsafeCaptureWarning: "Do not place device near moving parts.",
    priority: "medium",
    customerPromptText: "Please provide sound or audio clip.",
    raw: null,
    createdAt: new Date(),
  },
  {
    evidenceId: "smoke_photo",
    label: "Smoke photo if safe",
    description: "Smoke photo if safe can add context.",
    evidenceType: "photo",
    usefulForSymptomCategories: "smoke_from_engine;burning_smell;overheating",
    safeCaptureInstructions: "Only capture from a safe distance.",
    unsafeCaptureWarning: "Do not approach fire or heavy smoke.",
    priority: "high",
    customerPromptText: "Please provide smoke photo if safe.",
    raw: null,
    createdAt: new Date(),
  },
  {
    evidenceId: "coolant_level_photo",
    label: "Coolant level photo when cold",
    description: "Coolant level photo when cold can add context.",
    evidenceType: "photo",
    usefulForSymptomCategories: "overheating;coolant_leak",
    safeCaptureInstructions: "Photograph the external reservoir only after engine is cold.",
    unsafeCaptureWarning: "Never open a hot cooling system.",
    priority: "high",
    customerPromptText: "Please provide coolant level photo.",
    raw: null,
    createdAt: new Date(),
  },
];

describe("journey-symptom-classifier", () => {
  it("classifies brake-related symptoms", () => {
    const matches = classifySymptoms(
      "My brakes squeak loudly when stopping at low speeds",
      undefined,
      undefined,
      undefined,
      MOCK_SYMPTOM_CATEGORIES as any
    );
    assert.ok(matches.length > 0, "Should match at least one symptom");
    assert.equal(matches[0].symptomCategoryId, "brake_noise");
    assert.ok(matches[0].matchedPhrases.length > 0, "Should have matched phrases");
  });

  it("classifies overheating symptoms", () => {
    const matches = classifySymptoms(
      "My car is overheating, the temperature gauge is in the red",
      undefined,
      "Not Safe to Drive",
      undefined,
      MOCK_SYMPTOM_CATEGORIES as any
    );
    assert.ok(matches.length > 0, "Should match at least one symptom");
    const overheating = matches.find((m) => m.symptomCategoryId === "overheating");
    assert.ok(overheating, "Should match overheating");
    assert.equal(overheating!.possibleRiskLevel, "critical");
  });

  it("classifies multiple symptoms", () => {
    const matches = classifySymptoms(
      "Weird sound and brakes squeak when stopping",
      undefined,
      undefined,
      undefined,
      MOCK_SYMPTOM_CATEGORIES as any
    );
    assert.ok(matches.length >= 2, "Should match at least two symptoms");
  });

  it("returns empty for unrecognized description", () => {
    const matches = classifySymptoms(
      "The radio volume knob is loose",
      undefined,
      undefined,
      undefined,
      MOCK_SYMPTOM_CATEGORIES as any
    );
    assert.equal(matches.length, 0);
  });

  it("returns empty when no categories provided", () => {
    const matches = classifySymptoms("brakes squeak");
    assert.equal(matches.length, 0);
  });

  it("returns correct top symptom", () => {
    const matches = classifySymptoms(
      "My brakes squeak loudly when stopping",
      undefined,
      undefined,
      undefined,
      MOCK_SYMPTOM_CATEGORIES as any
    );
    const top = getTopSymptomCategory(matches);
    assert.ok(top, "Should have a top symptom");
    assert.equal(top!.symptomCategoryId, "brake_noise");
  });

  it("detects human review recommended", () => {
    const matches = classifySymptoms(
      "My brakes squeak loudly when stopping",
      undefined,
      undefined,
      undefined,
      MOCK_SYMPTOM_CATEGORIES as any
    );
    assert.equal(shouldRequestHumanReview(matches), true);
  });

  it("detects critical risk", () => {
    const matches = classifySymptoms(
      "My car is overheating, the temperature gauge is in the red",
      undefined,
      undefined,
      undefined,
      MOCK_SYMPTOM_CATEGORIES as any
    );
    assert.equal(isCriticalRisk(matches), true);
  });
});

describe("journey-evidence-planner", () => {
  it("plans evidence based on matched symptoms", () => {
    const matchedSymptoms = [
      {
        symptomCategoryId: "brake_noise",
        label: "Noise occurs during braking",
        confidence: 0.6,
        matchedPhrases: ["brakes squeak"],
        possibleRiskLevel: "high",
        safetyNote: null,
        humanReviewRecommended: true,
        recommendedInitialPath: "schedule_inspection",
        commonEvidenceNeeded: null,
      },
    ];

    const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS as any);
    assert.ok(planned.length > 0, "Should plan at least one evidence item");
    const audioItem = planned.find((p) => p.evidenceId === "sound_audio_clip");
    assert.ok(audioItem, "Should include audio clip for brake noise");
  });

  it("excludes evidence not relevant to symptoms", () => {
    const matchedSymptoms = [
      {
        symptomCategoryId: "overheating",
        label: "Engine temperature is too high",
        confidence: 0.6,
        matchedPhrases: ["overheating"],
        possibleRiskLevel: "critical",
        safetyNote: null,
        humanReviewRecommended: true,
        recommendedInitialPath: "stop_now",
        commonEvidenceNeeded: null,
      },
    ];

    const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS as any);
    const audioItem = planned.find((p) => p.evidenceId === "sound_audio_clip");
    assert.equal(audioItem, undefined, "Should not include audio for overheating");
    const smokeItem = planned.find((p) => p.evidenceId === "smoke_photo");
    assert.ok(smokeItem, "Should include smoke photo for overheating");
  });

  it("returns empty when no symptoms matched", () => {
    const planned = planEvidence([], MOCK_EVIDENCE_ITEMS as any);
    assert.equal(planned.length, 0);
  });

  it("gets next evidence to request", () => {
    const matchedSymptoms = [
      {
        symptomCategoryId: "brake_noise",
        label: "Noise occurs during braking",
        confidence: 0.6,
        matchedPhrases: ["brakes squeak"],
        possibleRiskLevel: "high",
        safetyNote: null,
        humanReviewRecommended: true,
        recommendedInitialPath: "schedule_inspection",
        commonEvidenceNeeded: null,
      },
    ];

    const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS as any);
    const next = getNextEvidenceToRequest(planned, []);
    assert.ok(next, "Should have next evidence to request");
    assert.equal(next!.evidenceId, "sound_audio_clip");
  });

  it("skips already provided evidence", () => {
    const matchedSymptoms = [
      {
        symptomCategoryId: "brake_noise",
        label: "Noise occurs during braking",
        confidence: 0.6,
        matchedPhrases: ["brakes squeak"],
        possibleRiskLevel: "high",
        safetyNote: null,
        humanReviewRecommended: true,
        recommendedInitialPath: "schedule_inspection",
        commonEvidenceNeeded: null,
      },
    ];

    const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS as any);
    const next = getNextEvidenceToRequest(planned, [
      { description: "Sound or audio clip" },
    ]);
    assert.equal(next, undefined, "Should skip already provided evidence");
  });

  it("builds evidence prompt with safety instructions", () => {
    const evidence = {
      evidenceId: "smoke_photo",
      label: "Smoke photo if safe",
      description: null,
      evidenceType: "photo",
      safeCaptureInstructions: "Only capture from a safe distance.",
      unsafeCaptureWarning: "Do not approach fire.",
      priority: "high",
      customerPromptText: "Please provide smoke photo if safe.",
      relevanceScore: 0.7,
    };

    const prompt = buildEvidencePrompt(evidence, false);
    assert.ok(prompt.includes("Please provide smoke photo if safe"), "Should include customer prompt text");
    assert.ok(prompt.includes("Only capture from a safe distance"), "Should include safe instructions");
    assert.ok(prompt.includes("Do not approach fire"), "Should include warning");
  });

  it("builds safety prompt when safety triggered", () => {
    const evidence = {
      evidenceId: "smoke_photo",
      label: "Smoke photo if safe",
      description: null,
      evidenceType: "photo",
      safeCaptureInstructions: "Only capture from a safe distance.",
      unsafeCaptureWarning: "Do not approach fire.",
      priority: "high",
      customerPromptText: "Please provide smoke photo if safe.",
      relevanceScore: 0.7,
    };

    const prompt = buildEvidencePrompt(evidence, true);
    assert.ok(prompt.includes("safety trigger"), "Should mention safety trigger");
  });
});

describe("journey-state-machine integration", () => {
  it("creates journey case with matched symptoms", () => {
    const caseData = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Brakes squeak loudly when stopping at low speeds",
      urgency: "Safe to Drive",
      canDrive: "Yes",
      symptomCategories: MOCK_SYMPTOM_CATEGORIES,
      evidenceItems: MOCK_EVIDENCE_ITEMS,
    });

    assert.ok(caseData.matchedSymptomCategories.length > 0, "Should have matched symptoms");
    assert.equal(caseData.matchedSymptomCategories[0].symptomCategoryId, "brake_noise");
  });

  it("creates journey case with safety trigger for overheating", () => {
    const caseData = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "My car is overheating, the temperature gauge is in the red",
      urgency: "Not Safe to Drive",
      symptomCategories: MOCK_SYMPTOM_CATEGORIES,
      evidenceItems: MOCK_EVIDENCE_ITEMS,
    });

    assert.equal(caseData.safetyTriggered, true, "Should trigger safety");
    assert.equal(caseData.state, "escalation_required", "Should escalate");
  });

  it("includes matched symptoms in case", () => {
    const caseData = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Weird rattle sound coming from under the car",
      symptomCategories: MOCK_SYMPTOM_CATEGORIES,
      evidenceItems: MOCK_EVIDENCE_ITEMS,
    });

    assert.equal(caseData.state, "intake");
    assert.ok(
      caseData.matchedSymptomCategories.some((m) => m.symptomCategoryId === "weird_noise"),
      "Should match weird_noise symptom"
    );
  });

  it("builds next action with evidence prompt for triage", () => {
    const caseData = createJourneyCase({
      vehicleInfo: "2018 Honda Civic",
      description: "Brakes squeak loudly when stopping",
      symptomCategories: MOCK_SYMPTOM_CATEGORIES,
      evidenceItems: MOCK_EVIDENCE_ITEMS,
    });

    assert.equal(caseData.state, "intake");
    assert.ok(caseData.matchedSymptomCategories.length > 0, "Should have matched symptoms");
  });
});
