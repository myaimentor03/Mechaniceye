import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const queryClient = source("client/src/lib/queryClient.ts");

function apiRequestBlock() {
  const start = queryClient.indexOf("export async function apiRequest");
  assert.ok(start !== -1, "apiRequest must exist");
  return queryClient.slice(start, start + 1500);
}

function getQueryFnBlock() {
  const start = queryClient.indexOf("export const getQueryFn");
  assert.ok(start !== -1, "getQueryFn must exist");
  return queryClient.slice(start, start + 1500);
}

test("query client defines timeout budgets for mobile resilience", () => {
  assert.match(queryClient, /const QUERY_TIMEOUT_MS = 15000/);
  assert.match(queryClient, /const MUTATION_TIMEOUT_MS = 20000/);
});

test("apiRequest uses AbortController with timeout and clears it", () => {
  const block = apiRequestBlock();
  assert.match(block, /const controller = new AbortController\(\)/);
  assert.match(block, /setTimeout\(\(\) => controller\.abort\(\), MUTATION_TIMEOUT_MS\)/);
  assert.match(block, /signal: controller\.signal/);
  assert.match(block, /clearTimeout\(timeoutId\)/);
});

test("getQueryFn uses AbortController with timeout and clears it", () => {
  const block = getQueryFnBlock();
  assert.match(block, /const controller = new AbortController\(\)/);
  assert.match(block, /setTimeout\(\(\) => controller\.abort\(\), QUERY_TIMEOUT_MS\)/);
  assert.match(block, /signal: controller\.signal/);
  assert.match(block, /clearTimeout\(timeoutId\)/);
});

test("timeouts always clear via finally so timers never leak", () => {
  const apiBlock = apiRequestBlock();
  assert.match(apiBlock, /finally \{\s*clearTimeout\(timeoutId\);\s*\}/);
  const queryBlock = getQueryFnBlock();
  assert.match(queryBlock, /finally \{\s*clearTimeout\(timeoutId\);\s*\}/);
});

test("query client still fails closed on 401/!ok instead of fabricating data", () => {
  const block = getQueryFnBlock();
  assert.match(block, /throwIfResNotOk\(res\)/);
  assert.match(block, /returnNull/);
  // Timeout must surface as AbortError, never as fabricated JSON.
  assert.doesNotMatch(block, /return \{\}/);
  assert.doesNotMatch(block, /return null;\s*\n\s*await throwIfResNotOk/);
});
