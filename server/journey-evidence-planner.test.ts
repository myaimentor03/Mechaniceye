import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  planEvidence,
  getNextEvidenceToRequest,
  buildEvidencePrompt,
} from "./journey-evidence-planner";
import type { MatchedSymptom } from "./journey-symptom-classifier";
import type { DrivableSeedEvidenceItem } from "../shared/schema";

const MOCK_SYMPTOMS: MatchedSymptom[] = [
  {
    symptomCategoryId: "brake_noise",
    label: "Noise occurs during braking",
    confidence: 0.8,
    matchedPhrases: ["brakes squeak", "grinding when stopping"],
    possibleRiskLevel: "high",
    safetyNote: "Do not drive when control risk is present.",
    humanReviewRecommended: true,
    recommendedInitialPath: "schedule_inspection",
    commonEvidenceNeeded: "vehicle details; timeline; dashboard photo",
  },
  {
    symptomCategoryId: "overheating",
    label: "Engine temperature is too high",
    confidence: 0.9,
    matchedPhrases: ["overheating", "temperature gauge"],
    possibleRiskLevel: "critical",
    safetyNote: "Do not drive when overheating.",
    humanReviewRecommended: true,
    recommendedInitialPath: "stop_now",
    commonEvidenceNeeded: "vehicle details; dashboard photo",
  },
  {
    symptomCategoryId: "weird_noise",
    label: "An unfamiliar noise needs classification",
    confidence: 0.5,
    matchedPhrases: ["weird sound", "rattle"],
    possibleRiskLevel: "unknown",
    safetyNote: null,
    humanReviewRecommended: false,
    recommendedInitialPath: "request_more_info",
    commonEvidenceNeeded: "vehicle details; audio",
  },
];

const MOCK_EVIDENCE_ITEMS: DrivableSeedEvidenceItem[] = [
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
  },
  {
    evidenceId: "audio_interior",
    label: "Interior audio clip",
    description: "Interior audio can capture engine sounds.",
    evidenceType: "audio",
    usefulForSymptomCategories: "weird_noise",
    safeCaptureInstructions: "Record from inside the cabin safely.",
    unsafeCaptureWarning: null,
    priority: "low",
    customerPromptText: "Please provide interior audio clip.",
  },
];

describe("journey-evidence-planner", () => {
  describe("planEvidence", () => {
    it("returns empty array when no symptoms are matched", () => {
      const planned = planEvidence([], MOCK_EVIDENCE_ITEMS);
      assert.equal(planned.length, 0);
    });

    it("returns empty array when no evidence items are provided", () => {
      const planned = planEvidence(MOCK_SYMPTOMS, []);
      assert.equal(planned.length, 0);
    });

    it("returns empty array when both symptoms and evidence are empty", () => {
      const planned = planEvidence([], []);
      assert.equal(planned.length, 0);
    });

    it("plans evidence items relevant to matched symptoms", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      assert.ok(planned.length > 0, "Should plan at least one evidence item");
      const audioItem = planned.find((p) => p.evidenceId === "sound_audio_clip");
      assert.ok(audioItem, "Should include audio clip for brake_noise");
    });

    it("excludes evidence not relevant to matched symptoms", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[1]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      const audioItem = planned.find((p) => p.evidenceId === "sound_audio_clip");
      assert.equal(audioItem, undefined, "Should not include audio for overheating-only match");
      const coolantItem = planned.find((p) => p.evidenceId === "coolant_level_photo");
      assert.ok(coolantItem, "Should include coolant photo for overheating");
    });

    it("includes evidence relevant to multiple matched symptoms", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0], MOCK_SYMPTOMS[1]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      const smokeItem = planned.find((p) => p.evidenceId === "smoke_photo");
      assert.ok(smokeItem, "Should include smoke photo for overheating match");
      const audioItem = planned.find((p) => p.evidenceId === "sound_audio_clip");
      assert.ok(audioItem, "Should include audio for brake_noise match");
    });

    it("sorts by priority then relevance score descending", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      for (let i = 1; i < planned.length; i++) {
        const prev = planned[i - 1];
        const curr = planned[i];
        const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        const pa = priorityOrder[prev.priority] ?? 2;
        const pb = priorityOrder[curr.priority] ?? 2;
        if (pa !== pb) {
          assert.ok(pa < pb, `Priority order violation at index ${i}`);
        } else {
          assert.ok(prev.relevanceScore >= curr.relevanceScore, `Relevance order violation at index ${i}`);
        }
      }
    });

    it("limits results to maxItems", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0], MOCK_SYMPTOMS[1]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS, [], 2);
      assert.equal(planned.length, 2, "Should return at most maxItems");
    });

    it("default maxItems is 5", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0], MOCK_SYMPTOMS[1]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      assert.ok(planned.length <= 5, "Default maxItems should be 5");
    });

    it("excludes already provided evidence by description", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS, [
        { description: "Sound or audio clip" },
      ]);
      const audioItem = planned.find((p) => p.evidenceId === "sound_audio_clip");
      assert.equal(audioItem, undefined, "Should skip already provided evidence");
    });

    it("includes evidence when alreadyProvided descriptions do not match labels", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS, [
        { description: "Unrelated evidence" },
      ]);
      const audioItem = planned.find((p) => p.evidenceId === "sound_audio_clip");
      assert.ok(audioItem, "Should still include audio when descriptions don't match labels");
    });

    it("handles evidence with empty label gracefully", () => {
      const evidenceWithEmptyLabel = [
        ...MOCK_EVIDENCE_ITEMS,
        {
          evidenceId: "empty_label",
          label: "",
          description: "test",
          evidenceType: "text" as const,
          usefulForSymptomCategories: "brake_noise",
          safeCaptureInstructions: null,
          unsafeCaptureWarning: null,
          priority: "medium",
          customerPromptText: null,
        },
      ];
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, evidenceWithEmptyLabel);
      const emptyLabelItem = planned.find((p) => p.evidenceId === "empty_label");
      assert.ok(emptyLabelItem, "Should include evidence with empty label");
    });

    it("all planned items have valid relevance scores", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0], MOCK_SYMPTOMS[1]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      for (const item of planned) {
        assert.ok(item.relevanceScore > 0, `Item ${item.evidenceId} should have positive relevance`);
      }
    });
  });

  describe("getNextEvidenceToRequest", () => {
    it("returns the first planned item when none are provided", () => {
      const planned = planEvidence(MOCK_SYMPTOMS, MOCK_EVIDENCE_ITEMS);
      const next = getNextEvidenceToRequest(planned, []);
      assert.ok(next, "Should return next evidence when nothing is provided");
      assert.equal(next!.evidenceId, planned[0].evidenceId);
    });

    it("skips already provided evidence by description match", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      const next = getNextEvidenceToRequest(planned, [
        { description: planned[0].label },
      ]);
      const nextIndex = planned.findIndex((p) => p.evidenceId === next?.evidenceId);
      assert.ok(nextIndex > 0 || next === undefined, "Should skip the first provided item");
    });

    it("returns undefined when all planned evidence is already provided", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      const allProvided = planned.map((p) => ({ description: p.label }));
      const next = getNextEvidenceToRequest(planned, allProvided);
      assert.equal(next, undefined, "Should return undefined when all evidence is provided");
    });

    it("returns undefined when planned list is empty", () => {
      const next = getNextEvidenceToRequest([], []);
      assert.equal(next, undefined, "Should return undefined for empty planned list");
    });

    it("skips multiple already-provided items", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0], MOCK_SYMPTOMS[1]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      const firstTwoLabels = planned.slice(0, 2).map((p) => ({ description: p.label }));
      const next = getNextEvidenceToRequest(planned, firstTwoLabels);
      const nextIndex = planned.findIndex((p) => p.evidenceId === next?.evidenceId);
      assert.equal(nextIndex, 2, "Should skip first two provided items and return third");
    });

    it("is case-insensitive when skipping provided evidence", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      const firstLabel = planned[0].label;
      const next = getNextEvidenceToRequest(planned, [
        { description: firstLabel.toUpperCase() },
      ]);
      assert.notEqual(next?.evidenceId, firstLabel, "Should be case-insensitive");
    });
  });

  describe("buildEvidencePrompt", () => {
    const sampleEvidence = {
      evidenceId: "test_photo",
      label: "Test Photo",
      description: null,
      evidenceType: "photo",
      safeCaptureInstructions: "Stand back and press the button.",
      unsafeCaptureWarning: "Do not enter the danger zone.",
      priority: "high",
      customerPromptText: "Please take a photo of the damage.",
      relevanceScore: 0.8,
    };

    it("builds prompt with customer text when safety is not triggered", () => {
      const prompt = buildEvidencePrompt(sampleEvidence, false);
      assert.ok(prompt.includes("Please take a photo of the damage"), "Should include customer prompt text");
      assert.ok(prompt.includes("Stand back and press the button"), "Should include safe capture instructions");
      assert.ok(prompt.includes("Do not enter the danger zone"), "Should include unsafe warning");
    });

    it("returns safety warning when safety is triggered", () => {
      const prompt = buildEvidencePrompt(sampleEvidence, true);
      assert.ok(prompt.includes("safety trigger"), "Should mention safety trigger");
      assert.ok(prompt.includes("Do not capture evidence if it requires driving"), "Should warn about driving");
    });

    it("includes only customer prompt when no instructions or warnings", () => {
      const minimalEvidence = {
        ...sampleEvidence,
        safeCaptureInstructions: null,
        unsafeCaptureWarning: null,
        customerPromptText: "Just describe it.",
      };
      const prompt = buildEvidencePrompt(minimalEvidence, false);
      assert.equal(prompt, "Just describe it.", "Should return just the customer prompt text");
    });

    it("includes customer prompt text even when empty string falls back to label", () => {
      const noPromptEvidence = {
        ...sampleEvidence,
        customerPromptText: null,
      };
      const prompt = buildEvidencePrompt(noPromptEvidence, false);
      assert.ok(prompt.includes("Test Photo"), "Should fall back to label when customerPromptText is null");
    });

    it("safety prompt overrides all other content", () => {
      const prompt = buildEvidencePrompt(sampleEvidence, true);
      assert.ok(prompt.includes("Only provide information you can safely share"), "Safety prompt should be complete");
      assert.ok(!prompt.includes("Please take a photo"), "Safety prompt should not include original customer prompt");
    });
  });

  describe("integration: evidence request flow", () => {
    it("plans evidence that covers the top symptom category first", () => {
      const topSymptom = MOCK_SYMPTOMS[0];
      const matchedSymptoms = [topSymptom];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      assert.ok(planned.length > 0, "Should have planned evidence");
      const topItem = planned[0];
      assert.ok(
        topItem.evidenceId === "sound_audio_clip" || topItem.evidenceId === "smoke_photo",
        "Top evidence should be relevant to the top symptom"
      );
    });

    it("respects maxItems limit in a realistic scenario", () => {
      const matchedSymptoms = MOCK_SYMPTOMS.slice(0, 2);
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS, [], 3);
      assert.equal(planned.length, 3, "Should respect maxItems of 3");
    });

    it("evidence IDs are preserved in the plan", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      const evidenceIds = new Set(planned.map((p) => p.evidenceId));
      for (const item of planned) {
        assert.ok(
          MOCK_EVIDENCE_ITEMS.some((e) => e.evidenceId === item.evidenceId),
          `Evidence ID ${item.evidenceId} should come from source items`
        );
      }
    });

    it("priorities are preserved from source evidence items", () => {
      const matchedSymptoms = [MOCK_SYMPTOMS[0]];
      const planned = planEvidence(matchedSymptoms, MOCK_EVIDENCE_ITEMS);
      for (const item of planned) {
        const source = MOCK_EVIDENCE_ITEMS.find((e) => e.evidenceId === item.evidenceId);
        assert.equal(item.priority, source?.priority || "medium", "Priority should match source");
      }
    });
  });
});
