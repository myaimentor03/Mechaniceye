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
  // evidence objects.
  const guardStart = routes.indexOf("// Idempotency: check for existing case");
  assert.ok(guardStart !== -1, "idempotency guard comment must exist");
  const guard = routes.slice(guardStart, guardStart + 2000);
  assert.match(guard, /const clientRequestId = input\.clientRequestId/);
  assert.match(guard, /const customerId = req\.drivableCustomer!.id/);
  assert.match(guard, /if \(clientRequestId\) \{/);
  assert.match(guard, /findExistingCaseByClientRequestId\(customerId, clientRequestId\)/);
  assert.match(guard, /duplicate_prevented/);
  assert.match(guard, /persisted: true/);
  assert.match(guard, /duplicate: true/);
});

test("duplicate path cleans uploaded temp files and returns early without persisting new evidence", () => {
  const guardStart = routes.indexOf("// Idempotency: check for existing case");
  const guard = routes.slice(guardStart, guardStart + 2000);
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
  assert.match(backend, /function generateClientRequestId\(\)/);
  assert.match(backend, /const existing = window\.sessionStorage\.getItem\(storageKey\)/);
  assert.match(backend, /if \(existing\) \{\s*setClientRequestId\(existing\);\s*return existing/);
  // Rotate after success
  assert.match(backend, /sessionStorage\.removeItem\(storageKey\)/);
  assert.match(backend, /const nextId = `req-/);
  assert.match(backend, /setClientRequestId\(nextId\)/);
});
