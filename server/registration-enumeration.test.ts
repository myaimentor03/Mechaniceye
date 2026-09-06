import assert from "node:assert/strict";
import test from "node:test";
import { registrationHttpResponse } from "./customer-auth.js";

test("registration responses are identical whether or not the account exists", () => {
  const existing = registrationHttpResponse({ kind: "existing" });
  const created = registrationHttpResponse({
    kind: "created",
    user: { id: "user_123", email: "casey.driver@example.com" },
  });

  assert.equal(existing.status, 200);
  assert.equal(created.status, 200);
  assert.deepEqual(existing.body, { ok: true });
  assert.deepEqual(created.body, { ok: true });
  assert.equal(JSON.stringify(existing.body), JSON.stringify(created.body));
});

test("a session is only minted for newly created accounts and never leaked in the body", () => {
  const existing = registrationHttpResponse({ kind: "existing" });
  const created = registrationHttpResponse({
    kind: "created",
    user: { id: "user_123", email: "casey.driver@example.com" },
  });

  assert.equal("sessionUser" in existing, false);
  assert.deepEqual(created.sessionUser, { id: "user_123", email: "casey.driver@example.com" });
  assert.equal("sessionUser" in created.body, false);
  assert.equal("email" in JSON.parse(JSON.stringify(created.body)), false);
});