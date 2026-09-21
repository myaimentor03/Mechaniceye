import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");
const marketplace = source("client/src/marketplace/Marketplace.tsx");

// Launch blocker (Nov 2 paid beta): the "drivable-last-case-id" sessionStorage
// pointer is shared by the Drivable Check, ClearSale seller-intake, and
// buyer-interest flows, and each flow fails closed on a flow-origin tag. The
// origin KEY itself is declared as an independent string literal in both
// TestBackend.tsx and Marketplace.tsx. If either literal drifts, writers stamp
// one key while readers check another: restores silently stop working (lost
// customer resume/status) or, worse, the origin guard stops isolating flows.
// This file pins the cross-file parity so a one-character drift fails loudly.

const POINTER_KEY_LITERAL = "drivable-last-case-id";
const ORIGIN_KEY_LITERAL = "drivable-last-case-origin";

const EXPECTED_ORIGINS = [
  "diagnosis-intake",
  "marketplace-seller-intake",
  "marketplace-buyer-interest",
];

function originKeyLiteral(text, file) {
  const match = text.match(/const \w+_ORIGIN_KEY = "([^"]+)"/);
  assert.ok(match, `${file} must declare an origin key constant`);
  return match[1];
}

test("both flows declare the same shared origin key literal (no drift)", () => {
  assert.equal(originKeyLiteral(backend, "TestBackend.tsx"), ORIGIN_KEY_LITERAL);
  assert.equal(originKeyLiteral(marketplace, "Marketplace.tsx"), ORIGIN_KEY_LITERAL);
});

test("origin key literal appears exactly once per file (single declaration)", () => {
  for (const [name, text] of [["TestBackend.tsx", backend], ["Marketplace.tsx", marketplace]]) {
    const occurrences = text.split(`"${ORIGIN_KEY_LITERAL}"`).length - 1;
    assert.equal(occurrences, 1, `${name} must declare the origin key literal exactly once`);
  }
});

test("flow origin vocabulary is exactly the three known intake flows", () => {
  const origins = new Set();
  for (const text of [backend, marketplace]) {
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
});

test("pointer and origin keys stay in sessionStorage (never localStorage) in both flows", () => {
  for (const [name, text] of [["TestBackend.tsx", backend], ["Marketplace.tsx", marketplace]]) {
    assert.doesNotMatch(text, new RegExp(`localStorage[^;]*${POINTER_KEY_LITERAL}`), `${name} pointer must not touch localStorage`);
    assert.doesNotMatch(text, new RegExp(`localStorage[^;]*${ORIGIN_KEY_LITERAL}`), `${name} origin key must not touch localStorage`);
    assert.doesNotMatch(text, /localStorage\.getItem\(DRIVABLE_LAST_CASE_ORIGIN_KEY\)/, `${name} origin must not be read from localStorage`);
    assert.doesNotMatch(text, /localStorage\.getItem\(MARKETPLACE_CASE_ORIGIN_KEY\)/, `${name} origin must not be read from localStorage`);
  }
});
