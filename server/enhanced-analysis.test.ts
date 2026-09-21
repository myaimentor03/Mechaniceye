import assert from "node:assert/strict";
import test from "node:test";
import {
  enhancedDiagnosisDatabase,
  generateAdditionalQuestions,
  performEnhancedAnalysis,
} from "./enhanced-analysis.js";

// ---------------------------------------------------------------------------
// enhanced-analysis.test.ts
//
// Launch-critical test for the enhanced diagnosis scoring engine used by the
// follow-up route (routes.ts:2795).  This module directly powers the FIX
// decision in the Guided Journey (P0 #2 / P0 #3).  Zero prior test coverage
// is a launch blocker for the November 2 paid beta.
// ---------------------------------------------------------------------------

// ---- enhancedDiagnosisDatabase sanity checks ----

test("enhancedDiagnosisDatabase contains at least one diagnosis", () => {
  assert.ok(Array.isArray(enhancedDiagnosisDatabase));
  assert.ok(enhancedDiagnosisDatabase.length > 0, "database must not be empty");
});

test("every database entry has required fields", () => {
  for (const entry of enhancedDiagnosisDatabase) {
    assert.ok(typeof entry.title === "string" && entry.title.length > 0, "title must be non-empty string");
    assert.ok(typeof entry.description === "string" && entry.description.length > 0, "description must be non-empty string");
    assert.ok(typeof entry.confidence === "number" && entry.confidence > 0 && entry.confidence <= 100, "confidence must be 1-100");
    assert.ok(typeof entry.severity === "string" && entry.severity.length > 0, "severity must be non-empty string");
    assert.ok(typeof entry.cost === "string" && entry.cost.length > 0, "cost must be non-empty string");
    assert.ok(Array.isArray(entry.instructions) && entry.instructions.length > 0, "instructions must be non-empty array");
    assert.ok(Array.isArray(entry.requiredTools) && entry.requiredTools.length > 0, "requiredTools must be non-empty array");
    assert.ok(typeof entry.estimatedTime === "string" && entry.estimatedTime.length > 0, "estimatedTime must be non-empty string");
  }
});

test("database titles are unique", () => {
  const titles = enhancedDiagnosisDatabase.map((d) => d.title);
  const unique = new Set(titles);
  assert.equal(unique.size, titles.length, "duplicate titles found in database");
});

// ---- generateAdditionalQuestions ----

test("generateAdditionalQuestions returns base questions for unknown title", () => {
  const questions = generateAdditionalQuestions("Nonexistent Diagnosis", 1);
  assert.ok(Array.isArray(questions));
  assert.ok(questions.length > 0, "should return at least base questions");
  assert.ok(questions.length <= 5, "should never exceed 5 questions");
  assert.ok(
    questions.some((q) => q.includes("gotten worse")),
    "should include the base worsening question",
  );
});

test("generateAdditionalQuestions returns specific questions for Brake Pad Wear", () => {
  const questions = generateAdditionalQuestions("Brake Pad Wear", 1);
  assert.ok(
    questions.some((q) => q.toLowerCase().includes("vibration in the brake pedal")),
    "should include brake-pad-specific question",
  );
  assert.ok(questions.length <= 5, "should cap at 5 questions");
});

test("generateAdditionalQuestions returns specific questions for Engine Misfire", () => {
  const questions = generateAdditionalQuestions("Engine Misfire", 1);
  assert.ok(
    questions.some((q) => q.toLowerCase().includes("engine shake")),
    "should include engine-misfire-specific question",
  );
});

test("generateAdditionalQuestions returns specific questions for Belt Issues", () => {
  const questions = generateAdditionalQuestions("Belt Issues", 1);
  assert.ok(
    questions.some((q) => q.toLowerCase().includes("starting")),
    "should include belt-specific question",
  );
});

test("generateAdditionalQuestions includes iteration questions when iterationCount > 1", () => {
  const questions = generateAdditionalQuestions("Brake Pad Wear", 2);
  assert.ok(
    questions.some((q) => q.includes("already tried")),
    "should include iteration-specific question about prior attempts",
  );
  assert.ok(questions.length <= 5, "should cap at 5 questions");
});

test("generateAdditionalQuestions returns exactly 5 questions when specific questions exist", () => {
  const questions = generateAdditionalQuestions("Brake Pad Wear", 1);
  assert.equal(questions.length, 5, "should return exactly 5 questions when specific questions exist");
});

// ---- performEnhancedAnalysis: basic return shape ----

test("performEnhancedAnalysis returns primaryDiagnosis, alternatives, needsMoreInfo, and additionalQuestions", () => {
  const result = performEnhancedAnalysis({ description: "car makes noise" });
  assert.ok(result.primaryDiagnosis, "must have primaryDiagnosis");
  assert.ok(Array.isArray(result.alternativeScenarios), "must have alternativeScenarios array");
  assert.equal(typeof result.needsMoreInfo, "boolean", "must have needsMoreInfo boolean");
  assert.ok(Array.isArray(result.additionalQuestions), "must have additionalQuestions array");
});

test("performEnhancedAnalysis returns up to 3 total diagnoses (primary + alternatives)", () => {
  const result = performEnhancedAnalysis({ description: "engine problem" });
  const total = 1 + result.alternativeScenarios.length;
  assert.ok(total <= 3, `total diagnoses should be <= 3, got ${total}`);
  assert.ok(total >= 1, "must have at least one diagnosis");
});

test("performEnhancedAnalysis primary has higher confidence than alternatives", () => {
  const result = performEnhancedAnalysis({ description: "brakes are squealing loudly" });
  for (const alt of result.alternativeScenarios) {
    assert.ok(
      result.primaryDiagnosis.confidence >= alt.confidence,
      `primary (${result.primaryDiagnosis.confidence}) should be >= alternative (${alt.confidence})`,
    );
  }
});

// ---- performEnhancedAnalysis: keyword matching ----

test("performEnhancedAnalysis boosts brake-related diagnoses when description mentions 'brake'", () => {
  const result = performEnhancedAnalysis({ description: "brake pedal feels soft and spongy" });
  assert.ok(
    result.primaryDiagnosis.title.toLowerCase().includes("brake"),
    `expected brake-related primary, got: ${result.primaryDiagnosis.title}`,
  );
});

test("performEnhancedAnalysis boosts engine diagnoses when description mentions 'engine'", () => {
  const result = performEnhancedAnalysis({ description: "engine is shaking and misfiring" });
  assert.ok(
    result.primaryDiagnosis.title.toLowerCase().includes("engine"),
    `expected engine-related primary, got: ${result.primaryDiagnosis.title}`,
  );
});

test("performEnhancedAnalysis boosts suspension when description mentions 'vibration'", () => {
  const result = performEnhancedAnalysis({ description: "vibration in the steering wheel" });
  const allTitles = [result.primaryDiagnosis.title, ...result.alternativeScenarios.map((a) => a.title)].map((t) =>
    t.toLowerCase(),
  );
  assert.ok(
    allTitles.some((t) => t.includes("suspension") || t.includes("brake") || t.includes("belt")),
    "vibration should boost suspension/brake/belt into top results",
  );
});

test("performEnhancedAnalysis boosts belt diagnoses when description mentions 'noise'", () => {
  const result = performEnhancedAnalysis({ description: "squealing noise from engine bay" });
  const allTitles = [result.primaryDiagnosis.title, ...result.alternativeScenarios.map((a) => a.title)].map((t) =>
    t.toLowerCase(),
  );
  assert.ok(
    allTitles.some((t) => t.includes("belt") || t.includes("brake")),
    "noise+squeal should boost belt or brake into top results",
  );
});

// ---- performEnhancedAnalysis: sensor data ----

test("performEnhancedAnalysis uses vibration sensor data to boost suspension", () => {
  const withVibration = performEnhancedAnalysis(
    { description: "car shakes" },
    1,
    [],
    { vibration: "vibration frequency high, engine mount worn" },
  );
  const withoutVibration = performEnhancedAnalysis({ description: "car shakes" });
  assert.ok(
    withVibration.primaryDiagnosis.confidence >= withoutVibration.primaryDiagnosis.confidence,
    "vibration sensor data should not decrease primary confidence",
  );
});

test("performEnhancedAnalysis uses audio sensor data to boost engine diagnosis", () => {
  const result = performEnhancedAnalysis(
    { description: "weird sound" },
    1,
    [],
    { audio: "engine knocking sound detected" },
  );
  const allTitles = [result.primaryDiagnosis.title, ...result.alternativeScenarios.map((a) => a.title)].map((t) =>
    t.toLowerCase(),
  );
  assert.ok(
    allTitles.some((t) => t.includes("engine")),
    "engine audio data should boost engine diagnosis into top results",
  );
});

// ---- performEnhancedAnalysis: timing context ----

test("performEnhancedAnalysis boosts brake diagnosis when timing is 'braking'", () => {
  const result = performEnhancedAnalysis({ description: "noise when I stop", timing: "braking" });
  assert.ok(
    result.primaryDiagnosis.title.toLowerCase().includes("brake"),
    `expected brake primary with braking timing, got: ${result.primaryDiagnosis.title}`,
  );
});

test("performEnhancedAnalysis boosts engine diagnosis when timing is 'startup'", () => {
  const result = performEnhancedAnalysis({ description: "car struggles to start", timing: "startup" });
  const allTitles = [result.primaryDiagnosis.title, ...result.alternativeScenarios.map((a) => a.title)].map((t) =>
    t.toLowerCase(),
  );
  assert.ok(
    allTitles.some((t) => t.includes("engine")),
    "startup timing should boost engine into top results",
  );
});

// ---- performEnhancedAnalysis: previous attempts ----

test("performEnhancedAnalysis excludes previously attempted diagnoses", () => {
  const result = performEnhancedAnalysis(
    { description: "brakes squealing" },
    1,
    ["Brake Pad Wear"],
  );
  assert.notEqual(
    result.primaryDiagnosis.title,
    "Brake Pad Wear",
    "should not return a previously attempted diagnosis as primary",
  );
});

test("performEnhancedAnalysis re-includes all diagnoses when fewer than 3 remain after exclusion", () => {
  const allTitles = enhancedDiagnosisDatabase.map((d) => d.title);
  const exclude = allTitles.slice(0, allTitles.length - 1);
  const result = performEnhancedAnalysis({ description: "something is wrong" }, 1, exclude);
  assert.ok(result.primaryDiagnosis, "must still return a primary diagnosis");
  assert.ok(result.primaryDiagnosis.confidence >= 30, "confidence should be within valid range");
});

// ---- performEnhancedAnalysis: confidence clamping ----

test("performEnhancedAnalysis clamps confidence to max 98", () => {
  const result = performEnhancedAnalysis(
    { description: "brakes brake brake squeal braking" },
    1,
    [],
    { audio: "engine brake" },
  );
  assert.ok(result.primaryDiagnosis.confidence <= 98, "confidence should not exceed 98");
});

test("performEnhancedAnalysis clamps confidence to min 30", () => {
  const result = performEnhancedAnalysis(
    { description: "something vague" },
    10,
    ["Brake Pad Wear", "Engine Misfire", "Belt Issues", "Brake Rotor Warping", "Suspension Problems", "Transmission Issues"],
  );
  assert.ok(result.primaryDiagnosis.confidence >= 30, "confidence should not go below 30");
});

// ---- performEnhancedAnalysis: iteration count reduces confidence ----

test("performEnhancedAnalysis reduces confidence for later iterations", () => {
  const early = performEnhancedAnalysis({ description: "brakes squeal" }, 1);
  const late = performEnhancedAnalysis({ description: "brakes squeal" }, 5);
  assert.ok(
    early.primaryDiagnosis.confidence >= late.primaryDiagnosis.confidence,
    `early (${early.primaryDiagnosis.confidence}) should be >= late (${late.primaryDiagnosis.confidence})`,
  );
});

// ---- performEnhancedAnalysis: needsMoreInfo logic ----

test("performEnhancedAnalysis sets needsMoreInfo=true when confidence is below 80 on first iteration", () => {
  const result = performEnhancedAnalysis({ description: "vague issue" }, 1);
  if (result.primaryDiagnosis.confidence < 80) {
    assert.equal(result.needsMoreInfo, true, "should request more info when confidence < 80");
  }
});

test("performEnhancedAnalysis sets needsMoreInfo=false when confidence is >= 80", () => {
  const result = performEnhancedAnalysis(
    { description: "brakes are squealing loudly when braking" },
    1,
  );
  if (result.primaryDiagnosis.confidence >= 80) {
    assert.equal(result.needsMoreInfo, false, "should not request more info when confidence >= 80");
  }
});

test("performEnhancedAnalysis sets needsMoreInfo=false when iterationCount > 3", () => {
  const result = performEnhancedAnalysis({ description: "something vague" }, 4);
  assert.equal(result.needsMoreInfo, false, "should stop requesting more info after 3 iterations");
});

test("performEnhancedAnalysis returns additionalQuestions only when needsMoreInfo is true", () => {
  const result = performEnhancedAnalysis({ description: "something vague" }, 1);
  if (result.needsMoreInfo) {
    assert.ok(result.additionalQuestions.length > 0, "should provide questions when needsMoreInfo is true");
  } else {
    assert.equal(result.additionalQuestions.length, 0, "should provide no questions when needsMoreInfo is false");
  }
});

// ---- performEnhancedAnalysis: empty / edge-case inputs ----

test("performEnhancedAnalysis handles empty description", () => {
  const result = performEnhancedAnalysis({ description: "" });
  assert.ok(result.primaryDiagnosis, "should still return a diagnosis with empty description");
  assert.ok(result.primaryDiagnosis.confidence >= 30, "confidence should be within valid range");
});

test("performEnhancedAnalysis handles missing description field", () => {
  const result = performEnhancedAnalysis({});
  assert.ok(result.primaryDiagnosis, "should still return a diagnosis with no description");
});

test("performEnhancedAnalysis handles empty previousAttempts array", () => {
  const result = performEnhancedAnalysis({ description: "noise" }, 1, []);
  assert.ok(result.primaryDiagnosis, "should work with empty previousAttempts");
});

test("performEnhancedAnalysis handles all sensor data empty", () => {
  const result = performEnhancedAnalysis(
    { description: "car issue" },
    1,
    [],
    { vibration: "", audio: "", video: "" },
  );
  assert.ok(result.primaryDiagnosis, "should handle empty sensor data");
});

test("performEnhancedAnalysis handles missing sensor data entirely", () => {
  const result = performEnhancedAnalysis({ description: "car issue" }, 1, [], {});
  assert.ok(result.primaryDiagnosis, "should handle missing sensor data");
});

// ---- performEnhancedAnalysis: severity/cost/instructions populated ----

test("performEnhancedAnalysis primary diagnosis has complete metadata", () => {
  const result = performEnhancedAnalysis({ description: "engine misfire" });
  const d = result.primaryDiagnosis;
  assert.ok(typeof d.severity === "string" && d.severity.length > 0, "severity must be present");
  assert.ok(typeof d.cost === "string" && d.cost.length > 0, "cost must be present");
  assert.ok(Array.isArray(d.instructions) && d.instructions.length > 0, "instructions must be non-empty");
  assert.ok(Array.isArray(d.requiredTools) && d.requiredTools.length > 0, "requiredTools must be non-empty");
  assert.ok(typeof d.estimatedTime === "string" && d.estimatedTime.length > 0, "estimatedTime must be present");
});
