import assert from "node:assert/strict";
import test from "node:test";
import { isDurablyPersistedDiagnosisResponse, requiresCustomerReauthentication } from "./diagnosisSubmission";

test("only a successful 2xx response with persisted:true confirms a diagnosis submission", () => {
  assert.equal(isDurablyPersistedDiagnosisResponse(200, { persisted: true }), true);
  assert.equal(isDurablyPersistedDiagnosisResponse(202, { persisted: false }), false);
  assert.equal(isDurablyPersistedDiagnosisResponse(200, { persisted: false }), false);
  assert.equal(isDurablyPersistedDiagnosisResponse(200, { id: "case-1" }), false);
  assert.equal(isDurablyPersistedDiagnosisResponse(503, { persisted: true }), false);
  assert.equal(isDurablyPersistedDiagnosisResponse(200, null), false);
});

test("only the customer-auth 401 response requests reauthentication", () => {
  assert.equal(requiresCustomerReauthentication(401, { code: "CUSTOMER_AUTH_REQUIRED" }), true);
  assert.equal(requiresCustomerReauthentication(401, { code: "OTHER_ERROR" }), false);
  assert.equal(requiresCustomerReauthentication(403, { code: "CUSTOMER_AUTH_REQUIRED" }), false);
  assert.equal(requiresCustomerReauthentication(503, { code: "CUSTOMER_AUTH_REQUIRED" }), false);
  assert.equal(requiresCustomerReauthentication(401, null), false);
});
