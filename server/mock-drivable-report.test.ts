import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDrivableAiPayloadFields,
  buildMockDrivableReport,
  hasCriticalDrivableRiskSignals,
  MOCK_CUSTOMER_WARNING,
} from "./mock-drivable-report.js";

// --- hasCriticalDrivableRiskSignals: positive detection ---

const CRITICAL_KEYWORDS = [
  ["brake failure", { symptomSummary: "complete brake failure at highway speed" }],
  ["braking loss", { vehicleSummary: "sudden braking loss on the highway" }],
  ["no brakes", { symptomSummary: "no brakes after fluid leak" }],
  ["steering loss", { symptomSummary: "experienced steering loss" }],
  ["cannot steer", { symptomSummary: "driver cannot steer the wheel" }],
  ["overheat", { symptomSummary: "engine overheat warning triggered" }],
  ["overheating", { symptomSummary: "continuous overheating on highway" }],
  ["fuel leak", { symptomSummary: "fuel leak detected under vehicle" }],
  ["gasoline leak", { vehicleSummary: "gasoline leak from fuel line" }],
  ["smoke", { symptomSummary: "smoke coming from under the hood" }],
  ["fire", { symptomSummary: "fire under the dashboard" }],
  ["burning smell", { symptomSummary: "burning smell from engine bay" }],
  ["oil pressure", { symptomSummary: "oil pressure warning light flashing" }],
  ["wheel loose", { symptomSummary: "front wheel loose at hub" }],
  ["wheel separation", { symptomSummary: "wheel separation risk at speed" }],
  ["tire separation", { symptomSummary: "tire separation on rear axle" }],
  ["shaking violently", { symptomSummary: "vehicle shaking violently at 60mph" }],
  ["unsafe to drive", { vehicleSummary: "vehicle unsafe to drive on highway" }],
  ["loss of control", { symptomSummary: "experienced loss of control" }],
];

for (const [keyword, input] of CRITICAL_KEYWORDS) {
  test(`detects critical signal: ${keyword}`, () => {
    assert.equal(hasCriticalDrivableRiskSignals(input as any), true);
  });
}

// --- hasCriticalDrivableRiskSignals: boundary / word-boundary checks ---

test("does not match partial substring 'brake' without boundary", () => {
  assert.equal(
    hasCriticalDrivableRiskSignals({ symptomSummary: "brakepads worn" }),
    false,
  );
});

test("does not match 'smoky' as 'smoke'", () => {
  assert.equal(
    hasCriticalDrivableRiskSignals({ symptomSummary: "exhaust is smoky" }),
    false,
  );
});

test("does not match 'firing' as 'fire'", () => {
  assert.equal(
    hasCriticalDrivableRiskSignals({ symptomSummary: "engine is firing normally" }),
    false,
  );
});

// --- hasCriticalDrivableRiskSignals: negative / benign inputs ---

test("returns false for empty input", () => {
  assert.equal(hasCriticalDrivableRiskSignals({}), false);
});

test("returns false for benign symptoms", () => {
  assert.equal(
    hasCriticalDrivableRiskSignals({
      vehicleSummary: "2019 Honda Civic",
      symptomSummary: "needs new brake pads and oil change",
    }),
    false,
  );
});

test("returns false for routine maintenance language", () => {
  assert.equal(
    hasCriticalDrivableRiskSignals({
      symptomSummary: "routine oil change, tires rotated, brakes inspected",
    }),
    false,
  );
});

// --- hasCriticalDrivableRiskSignals: combined fields ---

test("detects critical signal in vehicleSummary", () => {
  assert.equal(
    hasCriticalDrivableRiskSignals({
      vehicleSummary: "Fuel leak from fuel rail",
      symptomSummary: "",
    }),
    true,
  );
});

test("detects critical signal across concatenated fields", () => {
  assert.equal(
    hasCriticalDrivableRiskSignals({
      vehicleSummary: "engine",
      symptomSummary: "oil pressure drop",
    }),
    true,
  );
});

// --- hasCriticalDrivableRiskSignals: case insensitivity ---

test("detects case-insensitive match", () => {
  assert.equal(
    hasCriticalDrivableRiskSignals({ symptomSummary: "STEERING LOSS reported" }),
    true,
  );
});

// --- buildMockDrivableReport: shape and defaults ---

test("buildMockDrivableReport returns a complete report with default values", () => {
  const report = buildMockDrivableReport({});
  assert.equal(report.aiMode, "mock");
  assert.equal(report.reviewStatus, "mock_test_only");
  assert.equal(report.riskLevel, "low");
  assert.equal(report.confidenceLevel, "low");
  assert.ok(report.possibleCauses.length > 0);
  assert.ok(report.missingInformation.length > 0);
  assert.ok(report.recommendedNextSteps.length > 0);
  assert.equal(report.customerFacingWarning, MOCK_CUSTOMER_WARNING);
  assert.match(report.internalNote, /mock/i);
});

test("buildMockDrivableReport uses defaults when fields are empty", () => {
  const report = buildMockDrivableReport({});
  assert.equal(report.scenario, "current_problem");
  assert.equal(report.reportType, "first_look_report");
  assert.equal(report.vehicleSummary, "Vehicle details not provided");
  assert.equal(report.symptomSummary, "No detailed symptom summary was provided.");
});

test("buildMockDrivableReport uses provided values", () => {
  const report = buildMockDrivableReport({
    scenario: "selling_vehicle",
    reportType: "condition_report",
    vehicleSummary: "2020 Toyota Camry",
    symptomSummary: "engine knock",
  });
  assert.equal(report.scenario, "selling_vehicle");
  assert.equal(report.reportType, "condition_report");
  assert.equal(report.vehicleSummary, "2020 Toyota Camry");
  assert.equal(report.symptomSummary, "engine knock");
});

// --- buildMockDrivableReport: scenario-specific causes ---

test("selling_vehicle scenario returns selling-specific causes", () => {
  const report = buildMockDrivableReport({ scenario: "selling_vehicle" });
  assert.ok(report.possibleCauses.some((c) => c.includes("disclosure gap")));
});

test("buying_vehicle scenario returns buying-specific causes", () => {
  const report = buildMockDrivableReport({ scenario: "buying_vehicle" });
  assert.ok(report.possibleCauses.some((c) => c.includes("seller-claim gap")));
});

test("default scenario returns default causes", () => {
  const report = buildMockDrivableReport({});
  assert.ok(report.possibleCauses.some((c) => c.includes("maintenance or wear")));
});

// --- buildDrivableAiPayloadFields: safety gate ---

test("blocks mock report when critical risk signals are present", () => {
  const original = process.env.DRIVABLE_AI_MODE;
  process.env.DRIVABLE_AI_MODE = "mock";
  try {
    const result = buildDrivableAiPayloadFields({
      symptomSummary: "brake failure at highway speed",
    });
    assert.equal(result.aiMode, "mock");
    assert.equal(result.mockReport, null);
    assert.equal(result.needsHumanReview, true);
    assert.ok(result.mockReportBlockedReason);
    assert.match(result.mockReportBlockedReason!, /Critical risk/);
    assert.equal(result.customerFacingWarning, MOCK_CUSTOMER_WARNING);
  } finally {
    if (original === undefined) {
      delete process.env.DRIVABLE_AI_MODE;
    } else {
      process.env.DRIVABLE_AI_MODE = original;
    }
  }
});

test("returns non-critical mock report when no safety signals present", () => {
  const original = process.env.DRIVABLE_AI_MODE;
  process.env.DRIVABLE_AI_MODE = "mock";
  try {
    const result = buildDrivableAiPayloadFields({
      vehicleSummary: "2019 Honda Civic",
      symptomSummary: "slight vibration at idle",
    });
    assert.equal(result.aiMode, "mock");
    assert.ok(result.mockReport !== null);
    assert.equal(result.mockReportBlockedReason, undefined);
    assert.equal(result.needsHumanReview, true);
  } finally {
    if (original === undefined) {
      delete process.env.DRIVABLE_AI_MODE;
    } else {
      process.env.DRIVABLE_AI_MODE = original;
    }
  }
});

test("returns empty object when AI mode is not mock", () => {
  const originalMode = process.env.DRIVABLE_AI_MODE;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.DRIVABLE_AI_MODE = "live";
  process.env.OPENAI_API_KEY = "sk-fake-key-for-test";
  try {
    const result = buildDrivableAiPayloadFields({
      symptomSummary: "brake failure",
    });
    assert.deepEqual(result, {});
  } finally {
    if (originalMode === undefined) {
      delete process.env.DRIVABLE_AI_MODE;
    } else {
      process.env.DRIVABLE_AI_MODE = originalMode;
    }
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }
});
