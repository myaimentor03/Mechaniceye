import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, hashPassword, inviteMatches, readSessionToken, verifyPassword } from "./customer-auth.js";

process.env.DRIVABLE_SESSION_SECRET = "test-only-session-secret-with-more-than-32-characters";

test("password hashes are salted and verifiable", async () => {
  const first = await hashPassword("a sufficiently long password");
  const second = await hashPassword("a sufficiently long password");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a sufficiently long password", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
  assert.equal(await verifyPassword("anything", "plaintext"), false);
});

test("signed sessions reject tampering and expiration", () => {
  const now = 1_700_000_000_000;
  const token = createSessionToken({ id: "user-1", email: "person@example.com" }, now);
  assert.deepEqual(readSessionToken(token, now + 1_000), { id: "user-1", email: "person@example.com" });
  assert.equal(readSessionToken(`${token}tampered`, now + 1_000), null);
  assert.equal(readSessionToken(token, now + 13 * 60 * 60 * 1_000), null);
});

test("beta invitations require a configured exact code", () => {
  assert.equal(inviteMatches("pilot-123", "pilot-123"), true);
  assert.equal(inviteMatches("wrong", "pilot-123"), false);
  assert.equal(inviteMatches("", ""), false);
  assert.equal(inviteMatches(undefined, "pilot-123"), false);
});
