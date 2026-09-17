import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDrivableAiPayloadFields,
  hasCriticalDrivableRiskSignals,
  MOCK_CUSTOMER_WARNING,
} from "./mock-drivable-report.js";
import { SAFETY_STOP_DRIVING_TRIGGERS } from "../shared/drivableDecisionEngine.js";

// ---------------------------------------------------------------------------
// Safety gate parity test
//
// The product defines SAFETY_STOP_DRIVING_TRIGGERS that represent conditions
// where a vehicle should not be driven.  The server's CRITICAL_RISK_PATTERN
// (used by hasCriticalDrivableRiskSignals) must catch all such conditions so
// that buildDrivableAiPayloadFields blocks mock reports and forces human
// review.
//
// If a new trigger is added to SAFETY_STOP_DRIVING_TRIGGERS but the server
// pattern is not updated, this test will fail — preventing a safety-critical
// regression from reaching the November 2 paid beta.
// ---------------------------------------------------------------------------

// Representative symptom phrases for each SAFETY_STOP_DRIVING_TRIGGER.
// At least one phrase per trigger must be caught by hasCriticalDrivableRiskSignals.
const TRIGGER_SYMPTOM_SAMPLES: Array<{
  triggerId: string;
  triggerLabel: string;
  phrases: string[];
}> = [
  {
    triggerId: "brakes",
    triggerLabel: "Brake Safety Risk",
    phrases: [
      "complete brake failure at highway speed",
      "severe braking loss on the interstate",
      "brakes not responding, vehicle unsafe to control",
    ],
  },
  {
    triggerId: "steering",
    triggerLabel: "Steering Safety Risk",
    phrases: [
      "steering loss at highway speed",
      "driver cannot steer the vehicle",
      "steering wheel separated from column",
    ],
  },
  {
    triggerId: "overheating",
    triggerLabel: "Overheating",
    phrases: [
      "engine overheating rapidly",
      "temperature gauge in the red, steam from hood",
      "overheat warning persists after coolant refill",
    ],
  },
  {
    triggerId: "fuel_leak",
    triggerLabel: "Fuel Leak or Fire Risk",
    phrases: [
      "fuel leak visible under the vehicle",
      "gasoline leak from fuel rail",
      "strong fuel odor inside cabin",
    ],
  },
  {
    triggerId: "smoke_fire",
    triggerLabel: "Smoke or Fire",
    phrases: [
      "smoke coming from engine bay",
      "fire under the dashboard",
      "burning smell from electrical components",
    ],
  },
  {
    triggerId: "severe_electrical",
    triggerLabel: "Severe Electrical Risk",
    phrases: [
      "burning smell from battery area",
      "electrical wires melting under dash",
      "sparks visible from fuse box",
    ],
  },
  {
    triggerId: "wheel_tire_separation",
    triggerLabel: "Wheel or Tire Separation Risk",
    phrases: [
      "wheel separation risk at speed",
      "tire separation on rear axle",
      "front wheel loose at hub",
    ],
  },
  {
    triggerId: "unsafe_drivability",
    triggerLabel: "Unsafe Drivability",
    phrases: [
      "vehicle unsafe to drive on highway",
      "loss of control at intersection",
      "vehicle shaking violently at 60mph",
    ],
  },
];

// Verify every SAFETY_STOP_DRIVING_TRIGGER is represented in our test data
test("test data covers all SAFETY_STOP_DRIVING_TRIGGERS", () => {
  const triggerIds = new Set(SAFETY_STOP_DRIVING_TRIGGERS.map((t) => t.id));
  const testedIds = new Set(TRIGGER_SYMPTOM_SAMPLES.map((t) => t.triggerId));
  for (const id of triggerIds) {
    assert.ok(
      testedIds.has(id),
      `SAFETY_STOP_DRIVING_TRIGGER "${id}" has no representative symptom test`,
    );
  }
});

// For each trigger, verify that at least one representative phrase is caught
for (const { triggerId, triggerLabel, phrases } of TRIGGER_SYMPTOM_SAMPLES) {
  test(`${triggerLabel} (${triggerId}): hasCriticalDrivableRiskSignals catches representative phrases`, () => {
    let anyCaught = false;
    for (const phrase of phrases) {
      const caught = hasCriticalDrivableRiskSignals({ symptomSummary: phrase });
      if (caught) anyCaught = true;
    }
    assert.ok(
      anyCaught,
      `No representative phrase for trigger "${triggerId}" (${triggerLabel}) was caught by hasCriticalDrivableRiskSignals. ` +
        `The CRITICAL_RISK_PATTERN may need updating to cover this safety trigger.`,
    );
  });
}

// Verify the full buildDrivableAiPayloadFields blocks mock reports for each trigger
for (const { triggerId, triggerLabel, phrases } of TRIGGER_SYMPTOM_SAMPLES) {
  test(`buildDrivableAiPayloadFields blocks mock report for ${triggerLabel} (${triggerId})`, () => {
    const original = process.env.DRIVABLE_AI_MODE;
    process.env.DRIVABLE_AI_MODE = "mock";
    try {
      // Use the first phrase that is caught
      let blockedPhrase: string | null = null;
      for (const phrase of phrases) {
        if (hasCriticalDrivableRiskSignals({ symptomSummary: phrase })) {
          blockedPhrase = phrase;
          break;
        }
      }
      if (!blockedPhrase) {
        // Skip if no phrase is caught (the previous test should have failed)
        return;
      }

      const result = buildDrivableAiPayloadFields({
        symptomSummary: blockedPhrase,
      });
      assert.equal(result.mockReport, null, `Mock report should be null for trigger "${triggerId}"`);
      assert.equal(result.needsHumanReview, true, `needsHumanReview should be true for trigger "${triggerId}"`);
      assert.ok(result.mockReportBlockedReason, `mockReportBlockedReason should be set for trigger "${triggerId}"`);
      assert.equal(result.customerFacingWarning, MOCK_CUSTOMER_WARNING);
    } finally {
      if (original === undefined) {
        delete process.env.DRIVABLE_AI_MODE;
      } else {
        process.env.DRIVABLE_AI_MODE = original;
      }
    }
  });
}

// Verify that benign symptoms do NOT trigger the safety gate
// (prevents false positives that would unnecessarily block legitimate reports)
test("benign maintenance symptoms do not trigger the safety gate", () => {
  const original = process.env.DRIVABLE_AI_MODE;
  process.env.DRIVABLE_AI_MODE = "mock";
  try {
    const benignSymptoms = [
      "needs new brake pads",
      "oil change due",
      "tires need rotation",
      "slight vibration at idle",
      "check engine light on, no urgent symptoms",
      "AC not cooling properly",
      "windshield wiper needs replacement",
      "minor cosmetic dent on bumper",
    ];
    for (const symptom of benignSymptoms) {
      const result = buildDrivableAiPayloadFields({ symptomSummary: symptom });
      assert.ok(
        result.mockReport !== null || result.mockReport === undefined,
        `Benign symptom "${symptom}" should not block mock report`,
      );
    }
  } finally {
    if (original === undefined) {
      delete process.env.DRIVABLE_AI_MODE;
    } else {
      process.env.DRIVABLE_AI_MODE = original;
    }
  }
});
