import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const routes = source("./routes.ts");
const publicCaseDb = source("./public-case-db.ts");

test("duplicate guard uses customer-scoped clientRequestId before any persistence", () => {
  // Must check existing case by (customerId, clientRequestId) before touching
  // evidence storage or DB insert so a mobile retry does not create duplicate
  // evidence objects. Now checks in-memory store first, then DB.
  const guardStart = routes.indexOf("// Idempotency: check process-local in-memory store first");
  assert.ok(guardStart !== -1, "idempotency guard comment must exist");
  const guard = routes.slice(guardStart, guardStart + 2500);
  // New normalization: raw -> normalizeIdempotencyKey -> normalized clientRequestId
  assert.match(guard, /normalizeIdempotencyKey/);
  assert.match(guard, /rawClientRequestId/);
  assert.match(guard, /const clientRequestId = normalizeIdempotencyKey\(rawClientRequestId\)/);
  assert.match(guard, /const customerId = req\.drivableCustomer!.id/);
  assert.match(guard, /if \(clientRequestId\) \{/);
  // In-memory store check — must be customer-scoped to prevent cross-customer collision
  assert.match(guard, /marketplaceIdempotencyStore\.get\("diagnosis-intake"/);
  assert.match(guard, /customerScopedKey/);
  assert.match(guard, /\$\{customerId\}:\$\{clientRequestId\}/);
  // DB fallback check
  assert.match(guard, /findExistingCaseByClientRequestId\(customerId, clientRequestId\)/);
  assert.match(guard, /duplicate_prevented/);
  assert.match(guard, /persisted: true/);
  assert.match(guard, /duplicate: true/);
});

test("duplicate path cleans uploaded temp files and returns early without persisting new evidence", () => {
  const guardStart = routes.indexOf("// Idempotency: check process-local in-memory store first");
  const guard = routes.slice(guardStart, guardStart + 2500);
  assert.match(guard, /await removeIntakeTempFiles\(uploadedFiles\)/);
  assert.match(guard, /return res\.json\(/);
  // Ensure the guard appears before photo/r2 persistence branching
  const photoGuardAt = routes.indexOf("if (photoFiles.length && (process.env.DRIVABLE_PHOTO_UPLOAD_ENABLED");
  assert.ok(guardStart < photoGuardAt, "duplicate check must run before photo persistence");
});

test("findExistingCaseByClientRequestId is customer-isolated via and(eq(userId), sql clientRequestId)", () => {
  assert.match(publicCaseDb, /function findExistingCaseByClientRequestId/);
  assert.match(publicCaseDb, /eq\(diagnoses\.userId, userId\)/);
  assert.match(publicCaseDb, /clientRequestId/);
  // Query uses JSON property on vibrationData (where intake stores the marker)
  assert.match(publicCaseDb, /vibrationData.*clientRequestId/);
});

test("findExistingCaseByClientRequestId fails closed without DB or on error (returns null, never throws)", () => {
  assert.match(publicCaseDb, /if \(!databaseUrl\) return null/);
  assert.match(publicCaseDb, /catch \{\s*return null/);
  assert.match(publicCaseDb, /if \(!clientRequestId \|\| !userId\) return null/);
});

test("client preserves the same marker for retry but rotates after success — both are present in TestBackend", () => {
  const backend = source("../client/src/TestBackend.tsx");
  // Preserve path
  assert.match(backend, /function getStableClientRequestId\(\)/);
  assert.match(backend, /const existing = window\.sessionStorage\.getItem/);
  assert.match(backend, /if \(existing && existing\.trim\(\)\) \{\s*setClientRequestId\(existing\);\s*return existing/);
  // Rotate after success
  assert.match(backend, /sessionStorage\.removeItem\(storageKey\)/);
  assert.match(backend, /const nextId = `req-/);
  assert.match(backend, /setClientRequestId\(nextId\)/);
});

test("diagnosis guard normalizes clientRequestId and never persists malformed keys", () => {
  const guardStart = routes.indexOf("// Idempotency: check process-local in-memory store first");
  const guard = routes.slice(guardStart, guardStart + 2500);
  // Malformed keys become absent so fix-and-retry delivers exactly once
  assert.match(guard, /input\.clientRequestId = clientRequestId \?\? ""/);
  // Must import/use the shared normalizer so pattern stays in sync with marketplace
  assert.match(routes, /from ".\/marketplace-idempotency"/);
});

test("diagnosis in-memory record is customer-scoped and only after webhook success", () => {
  // Recording must use customerScopedKey and only when webhookForwarded
  const recordIdx = routes.indexOf('marketplaceIdempotencyStore.record("diagnosis-intake"');
  assert.ok(recordIdx !== -1, "diagnosis intake must record to idempotency store");
  const snippet = routes.slice(recordIdx - 500, recordIdx + 500);
  assert.match(snippet, /customerId/);
  assert.match(snippet, /clientRequestId/);
  assert.match(snippet, /webhookForwarded/);
  assert.match(snippet, /\$\{customerId\}:\$\{clientRequestId\}/);
});

test("findExistingCaseByClientRequestId validates normalized shape before DB lookup (160 char cap + token pattern)", () => {
  const fnStart = publicCaseDb.indexOf("export async function findExistingCaseByClientRequestId");
  assert.ok(fnStart !== -1, "finder must exist");
  const fn = publicCaseDb.slice(fnStart, fnStart + 1200);
  assert.match(fn, /trimmed\.length > 160/);
  assert.match(fn, /A-Za-z0-9.*\._:-/);
  assert.match(fn, /normalizedId/);
  assert.match(fn, /sql`.*->>'clientRequestId' = \$\{normalizedId\}/);
});

test("buildVibrationData only persists normalized clientRequestId (no traversal / oversized bloat)", () => {
  const fnStart = publicCaseDb.indexOf("function buildVibrationData");
  assert.ok(fnStart !== -1, "buildVibrationData must exist");
  const fn = publicCaseDb.slice(fnStart, fnStart + 1500);
  assert.match(fn, /clientRequestId/);
  assert.match(fn, /pattern\.test\(normalized\)/);
  assert.match(fn, /normalized\.length <= 160/);
  // Must not unconditionally assign raw input.clientRequestId
  assert.ok(!/vibrationData\.clientRequestId = input\.clientRequestId/.test(fn), "should not directly assign raw input");
});
