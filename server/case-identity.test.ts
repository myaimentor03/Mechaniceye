import assert from "node:assert/strict";
import test from "node:test";
import { applyAuthenticatedCaseIdentity, authenticatedCaseOwnerId } from "./case-identity.js";

test("authenticated identity overrides request-body identity everywhere", () => {
  const result = applyAuthenticatedCaseIdentity({
    email: "attacker@example.com",
    customerEmail: "attacker@example.com",
    description: "Vehicle: 2014 Honda Accord\nCustomer Email: attacker@example.com\nSymptoms: rough idle",
  }, " Owner@Example.com ");
  assert.equal(result.email, "owner@example.com");
  assert.equal(result.customerEmail, "owner@example.com");
  assert.match(result.description, /Customer Email: owner@example\.com/);
  assert.doesNotMatch(result.description, /attacker@example\.com/);
});

test("case ownership and delivery email fail closed", () => {
  assert.equal(authenticatedCaseOwnerId(" user-123 "), "user-123");
  assert.throws(() => authenticatedCaseOwnerId(""));
  assert.throws(() => applyAuthenticatedCaseIdentity({ description: "Symptoms" }, ""));
});
