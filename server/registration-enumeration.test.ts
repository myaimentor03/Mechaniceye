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

test("registration never mints a session for either outcome", () => {
  // Registration does not authenticate. Minting a session only for a freshly
  // created account made `Set-Cookie` a reliable account-existence oracle, so
  // neither outcome may produce a session identity.
  const existing = registrationHttpResponse({ kind: "existing" });
  const created = registrationHttpResponse({
    kind: "created",
    user: { id: "user_123", email: "casey.driver@example.com" },
  });

  assert.deepEqual(Object.keys(existing).sort(), ["body", "status"]);
  assert.deepEqual(Object.keys(created).sort(), ["body", "status"]);
  assert.equal(JSON.stringify(existing), JSON.stringify(created));
});

test("registration response never carries account or session data", () => {
  const created = registrationHttpResponse({
    kind: "created",
    user: { id: "user_123", email: "casey.driver@example.com" },
  });
  const serialized = JSON.stringify(created.body);

  assert.equal("email" in JSON.parse(serialized), false);
  assert.equal("id" in JSON.parse(serialized), false);
  assert.equal("session" in JSON.parse(serialized), false);
  assert.equal(serialized.includes("casey.driver@example.com"), false);
  assert.equal(serialized.includes("user_123"), false);
});
