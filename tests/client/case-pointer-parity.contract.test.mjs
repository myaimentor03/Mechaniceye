import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");
const marketplace = source("client/src/marketplace/Marketplace.tsx");
const followUp = source("client/src/pages/follow-up.tsx");

// Launch blocker (Nov 2 paid beta): the "drivable-last-case-id" sessionStorage
// pointer is shared by the Drivable Check, ClearSale seller-intake,
// buyer-interest, and diagnosis follow-up flows, and each flow fails closed on
// a flow-origin tag. The origin KEY itself is declared as an independent
// string literal in TestBackend.tsx, Marketplace.tsx, AND pages/follow-up.tsx.
// If any literal drifts, writers stamp one key while readers check another:
// restores silently stop working (lost customer resume/status) or, worse, the
// origin guard stops isolating flows.
// This file pins the cross-file parity so a one-character drift fails loudly.

const POINTER_KEY_LITERAL = "drivable-last-case-id";
const ORIGIN_KEY_LITERAL = "drivable-last-case-origin";

const EXPECTED_ORIGINS = [
  "diagnosis-intake",
  "marketplace-seller-intake",
  "marketplace-buyer-interest",
  "diagnosis-follow-up",
];

function originKeyLiteral(text, file) {
  const match = text.match(/const \w+_ORIGIN_KEY = "([^"]+)"/);
  assert.ok(match, `${file} must declare an origin key constant`);
  return match[1];
}

test("both flows declare the same shared origin key literal (no drift)", () => {
  assert.equal(originKeyLiteral(backend, "TestBackend.tsx"), ORIGIN_KEY_LITERAL);
  assert.equal(originKeyLiteral(marketplace, "Marketplace.tsx"), ORIGIN_KEY_LITERAL);
  assert.equal(originKeyLiteral(followUp, "pages/follow-up.tsx"), ORIGIN_KEY_LITERAL);
});

test("origin key literal appears exactly once per file (single declaration)", () => {
  for (const [name, text] of [["TestBackend.tsx", backend], ["Marketplace.tsx", marketplace], ["pages/follow-up.tsx", followUp]]) {
    const occurrences = text.split(`"${ORIGIN_KEY_LITERAL}"`).length - 1;
    assert.equal(occurrences, 1, `${name} must declare the origin key literal exactly once`);
  }
});

test("follow-up flow references the origin key only through its named constant (no raw literal drift)", () => {
  // The declaration above is the single allowed raw literal. Every use site
  // must go through FOLLOW_UP_ORIGIN_KEY so a key change cannot desync one
  // read/write while the others move.
  const uses = followUp.split("FOLLOW_UP_ORIGIN_KEY").length - 1;
  assert.ok(uses >= 4, `follow-up must use FOLLOW_UP_ORIGIN_KEY at declaration + read + 404 cleanup + success stamp (found ${uses})`);
});

test("flow origin vocabulary is exactly the four known flows (intake x3 + follow-up)", () => {
  const origins = new Set();
  for (const text of [backend, marketplace, followUp]) {
    for (const match of text.matchAll(/const \w+_ORIGIN = "([^"]+)"/g)) {
      origins.add(match[1]);
    }
  }
  assert.deepEqual(
    [...origins].sort(),
    [...EXPECTED_ORIGINS].sort(),
    "a new flow origin must be added to this parity test deliberately, with its own restore guard",
  );
});

test("follow-up origin has its own origin-scoped restore guard (never restores foreign flows)", () => {
  // The 4th origin is only safe because follow-up restores exclusively when
  // the stamped origin matches, verifies server-side, drops the pointer on
  // 404, and preserves it on offline/timeout for retry.
  assert.match(followUp, /savedOrigin !== FOLLOW_UP_ORIGIN/);
  assert.match(followUp, /fetch\(`\/api\/my-cases\/\$\{encodeURIComponent\(savedCaseId\)\}`/);
  assert.match(followUp, /if \(res\.status === 404\)/);
  assert.match(followUp, /setError\("Couldn't verify your saved case \(timeout\)/);
});

function pointerReadCount(text) {
  return text.split(`getItem("${POINTER_KEY_LITERAL}")`).length - 1;
}

function originKeyReadCount(text) {
  return text.split("getItem(DRIVABLE_LAST_CASE_ORIGIN_KEY)").length - 1
    + text.split("getItem(MARKETPLACE_CASE_ORIGIN_KEY)").length - 1;
}

test("every shared-pointer read is paired with an origin-key read (no bare restore)", () => {
  // TestBackend: server-verified restore + IntakePage reference (2 readers).
  assert.equal(pointerReadCount(backend), 2);
  assert.equal(originKeyReadCount(backend), 2);
  // Marketplace: seller intake + buyer interest + submitted page (3 readers).
  assert.equal(pointerReadCount(marketplace), 3);
  assert.equal(originKeyReadCount(marketplace), 3);
  // Follow-up: origin-scoped case recovery effect (1 reader, via named constant).
  const followUpPointerReads = followUp.split(`getItem("${POINTER_KEY_LITERAL}")`).length - 1;
  const followUpOriginReads = followUp.split("getItem(FOLLOW_UP_ORIGIN_KEY)").length - 1;
  assert.equal(followUpPointerReads, 1);
  assert.equal(followUpOriginReads, 1);
});

test("every shared-pointer write stamps the flow origin (no unstamped pointer)", () => {
  for (const [name, text] of [["TestBackend.tsx", backend], ["Marketplace.tsx", marketplace]]) {
    const writes = text.split(`setItem("${POINTER_KEY_LITERAL}"`).length - 1;
    assert.ok(writes > 0, `${name} must persist the shared pointer`);
    const originStamps =
      text.split("setItem(DRIVABLE_LAST_CASE_ORIGIN_KEY").length - 1
      + text.split("setItem(MARKETPLACE_CASE_ORIGIN_KEY").length - 1;
    assert.ok(
      originStamps >= writes,
      `${name}: ${writes} pointer write(s) but only ${originStamps} origin stamp(s)`,
    );
  }
  // Follow-up: success path stamps FOLLOW_UP_ORIGIN alongside the pointer.
  const followUpWrites = followUp.split(`setItem("${POINTER_KEY_LITERAL}"`).length - 1;
  assert.equal(followUpWrites, 1, "follow-up must persist the shared pointer exactly once (success path)");
  const followUpStamps = followUp.split("setItem(FOLLOW_UP_ORIGIN_KEY").length - 1;
  assert.ok(followUpStamps >= followUpWrites, `follow-up: ${followUpWrites} pointer write(s) but only ${followUpStamps} origin stamp(s)`);
});

test("follow-up 404 cleanup drops the origin alongside the case id (no orphaned stamp)", () => {
  // An orphaned origin stamp without its pointer (or vice versa) would let a
  // later flow misread the next pointer. The 404 path must clear both.
  const cleanupAt = followUp.indexOf("if (res.status === 404)");
  assert.ok(cleanupAt !== -1, "follow-up 404 cleanup must exist");
  const cleanupBlock = followUp.slice(cleanupAt, cleanupAt + 300);
  assert.match(cleanupBlock, /removeItem\("drivable-last-case-id"\)/);
  assert.match(cleanupBlock, /removeItem\(FOLLOW_UP_ORIGIN_KEY\)/);
});

test("pointer and origin keys stay in sessionStorage (never localStorage) in all flows", () => {
  for (const [name, text] of [["TestBackend.tsx", backend], ["Marketplace.tsx", marketplace], ["pages/follow-up.tsx", followUp]]) {
    assert.doesNotMatch(text, new RegExp(`localStorage[^;]*${POINTER_KEY_LITERAL}`), `${name} pointer must not touch localStorage`);
    assert.doesNotMatch(text, new RegExp(`localStorage[^;]*${ORIGIN_KEY_LITERAL}`), `${name} origin key must not touch localStorage`);
    assert.doesNotMatch(text, /localStorage\.getItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/, `${name} origin must not be read from localStorage`);
    assert.doesNotMatch(text, /localStorage\.getItem\(MARKETPLACE_CASE_ORIGIN_KEY\)/, `${name} origin must not be read from localStorage`);
  }
});
