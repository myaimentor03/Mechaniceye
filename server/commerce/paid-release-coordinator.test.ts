import test from "node:test";
import assert from "node:assert/strict";
import type { CommerceOrder } from "./order-contract.js";
import { verifyPaidApproval } from "./paid-release-coordinator.js";
import { createJourneyCase } from "../journey-state-machine.js";
import { caseArtifactDigest, recipientBinding, JOURNEY_REVIEW_BINDINGS } from "../journey-review-bridge.js";

const order = { caseId: "case-test-123" } as CommerceOrder;

test("paid approval verification propagates strict case-storage failures", async () => {
  const statements: string[] = [];
  const tx = {
    async query(text: string) {
      statements.push(text);
      if (text.startsWith("select * from journey_cases")) throw new Error("synthetic database read failure");
      return { rows: [] };
    },
  };

  await assert.rejects(() => verifyPaidApproval(tx, order), /synthetic database read failure/);
  assert.ok(statements.some((statement) => statement.startsWith("select * from journey_cases")));
});

test("paid approval verification accepts the canonical full artifact binding", async () => {
  const caseData = createJourneyCase({ vehicleInfo: "2018 Honda Civic", description: "Synthetic brake noise",
    customerId: "customer_test_01", customerEmail: "test@example.invalid" });
  const recipient = recipientBinding(caseData);
  const versionId = "review_version_test_01";
  const approvalId = "review_approval_test_01";
  const tx = {
    async query(text: string) {
      if (text.startsWith("select * from journey_cases")) return { rows: [{
        id: caseData.id, state: caseData.state, created_at: caseData.createdAt, updated_at: caseData.updatedAt,
        vehicle_info: caseData.vehicleInfo, description: caseData.description, timing: caseData.timing,
        urgency: caseData.urgency, can_drive: caseData.canDrive, customer_id: caseData.customerId,
        customer_email: caseData.customerEmail, evidence: caseData.evidence, safety_flags: caseData.safetyFlags,
        safety_triggered: caseData.safetyTriggered, confidence_score: caseData.confidenceScore,
        confidence_level: caseData.confidenceLevel, risk_level: caseData.riskLevel, outcome: caseData.outcome,
        decision_path: caseData.decisionPath, matched_symptom_categories: caseData.matchedSymptomCategories,
      }] };
      if (text.startsWith("select version_id from drivable_review_case_heads")) return { rows: [{ version_id: versionId }] };
      if (text.startsWith("select version_id, case_id, stage")) return { rows: [{
        version_id: versionId, case_id: caseData.id, stage: "final", initial_status: "review_required",
        artifact_digest: caseArtifactDigest(caseData), recipient_digest: recipient.digest,
        recipient_binding_version: recipient.bindingVersion, policy_version: JOURNEY_REVIEW_BINDINGS.policyVersion,
        model_version: JOURNEY_REVIEW_BINDINGS.modelVersion, evidence_version: JOURNEY_REVIEW_BINDINGS.evidenceVersion,
        risk_level: "moderate", mock: false, source_version_id: "review_draft_test_01", created_at: caseData.updatedAt,
      }] };
      if (text.startsWith("select a.approval_id")) return { rows: [{
        approval_id: approvalId, approval_reviewer_ref: "reviewer_test_12345678", approved_at: caseData.updatedAt,
        approval_policy_version: JOURNEY_REVIEW_BINDINGS.policyVersion,
        approval_model_version: JOURNEY_REVIEW_BINDINGS.modelVersion,
        approval_evidence_version: JOURNEY_REVIEW_BINDINGS.evidenceVersion,
        approval_recipient_digest: recipient.digest, approval_recipient_binding_version: recipient.bindingVersion,
        approval_risk_level: "moderate", high_risk_acknowledged: false,
      }] };
      return { rows: [] };
    },
  };

  const result = await verifyPaidApproval(tx, { caseId: caseData.id } as CommerceOrder);
  assert.deepEqual(result, { approvalId, versionId });
});
