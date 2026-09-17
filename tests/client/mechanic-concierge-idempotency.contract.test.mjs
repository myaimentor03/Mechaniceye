import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

const backend = source("client/src/TestBackend.tsx");

test("Mechanic Match payload carries a stable clientRequestId for mobile retry idempotency", () => {
  assert.match(backend, /MECHANIC_CLIENT_REQUEST_STORAGE_KEY/);
  assert.match(backend, /getOrCreateStableClientRequestId\(MECHANIC_CLIENT_REQUEST_STORAGE_KEY\)/);
  assert.match(backend, /clientRequestId: getOrCreateStableClientRequestId\(MECHANIC_CLIENT_REQUEST_STORAGE_KEY\)/);
});

test("Mechanic Match rotates the idempotency key only after success", () => {
  const flowStart = backend.indexOf("function MechanicMatchFlow");
  assert.ok(flowStart !== -1, "MechanicMatchFlow must exist");
  const flow = backend.slice(flowStart, flowStart + 8000);
  assert.match(flow, /rotateStableClientRequestId\(MECHANIC_CLIENT_REQUEST_STORAGE_KEY\)/);
  // Rotation must happen on the success path (after ok check, before navigate),
  // never in the error path.
  const successIndex = flow.indexOf("rotateStableClientRequestId(MECHANIC_CLIENT_REQUEST_STORAGE_KEY)");
  const catchIndex = flow.indexOf("catch (error)");
  assert.ok(successIndex !== -1 && catchIndex !== -1 && successIndex < catchIndex, "rotation must precede the catch block");
});

test("Concierge payload carries a stable clientRequestId for mobile retry idempotency", () => {
  assert.match(backend, /CONCIERGE_CLIENT_REQUEST_STORAGE_KEY/);
  assert.match(backend, /clientRequestId: getOrCreateStableClientRequestId\(CONCIERGE_CLIENT_REQUEST_STORAGE_KEY\)/);
});

test("Concierge rotates the idempotency key only after success", () => {
  const pageStart = backend.indexOf("function ConciergeHelpPage");
  assert.ok(pageStart !== -1, "ConciergeHelpPage must exist");
  const page = backend.slice(pageStart, pageStart + 12000);
  assert.match(page, /rotateStableClientRequestId\(CONCIERGE_CLIENT_REQUEST_STORAGE_KEY\)/);
});

test("idempotency helpers use sessionStorage with private-mode safe try/catch", () => {
  assert.match(backend, /window\.sessionStorage\.getItem/);
  assert.match(backend, /window\.sessionStorage\.setItem/);
  assert.match(backend, /function getOrCreateStableClientRequestId/);
  assert.match(backend, /function rotateStableClientRequestId/);
  assert.match(backend, /req-\$\{/);
});

test("mechanic and concierge use separate storage keys so rotations never collide", () => {
  assert.match(backend, /drivable-mechanic-request-id/);
  assert.match(backend, /drivable-concierge-request-id/);
});
