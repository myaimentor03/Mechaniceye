import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * QA launch-blocker lock for the November 2 paid beta (P0 #4 payment chain).
 *
 * Product rule (docs/product/DRIVABLE_FIRST_PAID_OFFERS_V1.md):
 * payment stays `Unverified`/`Pending` until separately confirmed, and an
 * intake submission must never mark a report `Paid`.
 *
 * These contract tests pin the intake-side invariants so a future edit
 * cannot silently promote an intake into a paid entitlement:
 * - intake types carry no client-assertable payment/entitlement fields
 * - the case tracker hardcodes PaymentStatus Unverified / PaymentTier Unknown
 * - launch readiness reports verifiedPaymentEntitlement: false
 */

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function typeBlock(text: string, typeName: string): string {
  const start = text.indexOf(`type ${typeName} = `);
  assert.ok(start >= 0, `${typeName} type block must exist`);
  const end = text.indexOf("};", start);
  assert.ok(end > start, `${typeName} type block must terminate`);
  return text.slice(start, end);
}

const caseStorage = source("./case-storage.ts");
const routes = source("./routes.ts");

const PAYMENT_KEY_PATTERN =
  /\b(payment|paid|entitlement|tier|price|amountMinor|stripe|checkout|refund)\b/i;

test("IncomingDiagnosisCase carries no client-assertable payment fields", () => {
  const block = typeBlock(caseStorage, "IncomingDiagnosisCase");
  assert.doesNotMatch(block, PAYMENT_KEY_PATTERN);
});

test("DiagnosisInput route type carries no payment or entitlement fields", () => {
  const block = typeBlock(routes, "DiagnosisInput");
  assert.doesNotMatch(block, PAYMENT_KEY_PATTERN);
});

test("buildDiagnosisInput constructs no payment or entitlement values", () => {
  const start = routes.indexOf("function buildDiagnosisInput(");
  assert.ok(start >= 0, "buildDiagnosisInput must exist");
  const rest = routes.slice(start);
  const nextFunction = rest.slice(1).search(/\n(?:function|const|class|export) /);
  const body = nextFunction > 0 ? rest.slice(0, nextFunction + 1) : rest;
  assert.doesNotMatch(body, PAYMENT_KEY_PATTERN);
});

test("case tracker defaults new intakes to PaymentStatus Unverified", () => {
  assert.match(caseStorage, /PaymentStatus:\s*"Unverified"/);
});

test("case tracker defaults new intakes to PaymentTier Unknown", () => {
  assert.match(caseStorage, /PaymentTier:\s*"Unknown"/);
});

test("case storage never marks an intake Paid/Pending/Comped/Refunded", () => {
  assert.doesNotMatch(caseStorage, /PaymentStatus:\s*"(Paid|Pending|Comped|Refunded)"/);
  assert.doesNotMatch(caseStorage, /PaymentTier:\s*"(Paid|First Look|Full Decision)"/);
});

test("new intake tracker rows stay NEW and never claim a paid tier", () => {
  assert.match(caseStorage, /CaseStatus:\s*"NEW"/);
  assert.doesNotMatch(caseStorage, /CaseStatus:\s*"PAID"/);
});

test("launch readiness grants no payment entitlement from intake", () => {
  assert.match(routes, /verifiedPaymentEntitlement:\s*false/);
  assert.doesNotMatch(routes, /verifiedPaymentEntitlement:\s*true/);
});
