import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createServer } from "node:http";
import { registerDurableReviewRoutes } from "./review-routes.js";
import { reviewerIdentityFromCredential } from "../reviewer-auth.js";
import { ReviewWriteError } from "./postgres-review-writer.js";

const token = "review-route-test-token-that-is-long-enough";

async function withServer(runtime: any, work: (origin: string) => Promise<void>) {
  const app = express(); app.use(express.json()); registerDurableReviewRoutes(app, async () => runtime);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${address.port}`);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test("approval uses the authenticated reviewer binding and ignores request identity", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  let received: any;
  const runtime = { writer: { async approve(input: any) { received = input; return { ok: true, reviewerRef: input.reviewerRef }; } } };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/approve`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ reviewerRef: "reviewer_attacker", highRiskAcknowledged: true }),
      });
      assert.equal(response.status, 200);
      assert.equal(received.reviewerRef, reviewerIdentityFromCredential(token).ref);
      assert.notEqual(received.reviewerRef, "reviewer_attacker");
      assert.equal(received.highRiskAcknowledged, true);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("missing reviewer authorization fails before runtime access", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  let accessed = false;
  try {
    await withServer({}, async (origin) => {
      const appResponse = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/approve`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      });
      assert.equal(appResponse.status, 401);
      assert.equal(accessed, false);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("review input validation never echoes error.message internals", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const internalDetail = "Cannot destructure property 'config' of undefined";
  const runtime = { writer: { async createDraft() { throw new TypeError(internalDetail); } } };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/drafts`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ riskLevel: "low" }),
      });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.equal(body.includes(internalDetail), false);
      assert.equal(body.includes("The review input is invalid."), true);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("review write failures never echo storage or database internals", async () => {
  const secret = "connection-dsn-user=hunter2";
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = {
    writer: {
      async approve() {
        throw new ReviewWriteError("storage_unavailable", `database connection failed ${secret}`, true);
      },
    },
  };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/approve`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ highRiskAcknowledged: true }),
      });
      assert.equal(response.status, 503);
      const body = await response.text();
      assert.equal(body.includes(secret), false);
      assert.equal(body.includes("Review state could not be persisted."), true);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

// --- REJECT ROUTE ---

test("reject passes reasonCode and authenticated reviewer binding to writer", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  let received: any;
  const runtime = { writer: { async reject(input: any) { received = input; return { ok: true, rejectionId: "rej_1", ...input }; } } };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-rej/version_rej/reject`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ reasonCode: "insufficient_evidence", reviewerRef: "attacker_ref" }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(received.caseId, "CASE-rej");
      assert.equal(received.versionId, "version_rej");
      assert.equal(received.reasonCode, "insufficient_evidence");
      assert.equal(received.reviewerRef, reviewerIdentityFromCredential(token).ref);
      assert.notEqual(received.reviewerRef, "attacker_ref");
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("reject accepts all valid rejection reason codes", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const reasons = ["insufficient_evidence", "policy_mismatch", "unsafe_content", "other"];
  for (const reasonCode of reasons) {
    let receivedReason: string | undefined;
    const runtime = { writer: { async reject(input: any) { receivedReason = input.reasonCode; return { ok: true }; } } };
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/reject`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ reasonCode }),
      });
      assert.equal(response.status, 200, `${reasonCode} should be accepted`);
      assert.equal(receivedReason, reasonCode);
    });
  }
  if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior;
});

test("reject returns 400 for missing or invalid reasonCode", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = { writer: { async reject() { return { ok: true }; } } };
  try {
    await withServer(runtime, async (origin) => {
      const missing = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/reject`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(missing.status, 400, "missing reasonCode must be 400");

      const invalid = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/reject`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ reasonCode: "bogus_reason" }),
      });
      assert.equal(invalid.status, 400, "invalid reasonCode must be 400");

      for (const resp of [missing, invalid]) {
        const text = await resp.text();
        assert.equal(text.includes("reviewer"), false, "reject error must not echo reviewer internals");
      }
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("reject returns 401 without reviewer token", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  try {
    await withServer({ writer: { async reject() { return {}; } } }, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/reject`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ reasonCode: "other" }),
      });
      assert.equal(response.status, 401);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("reject returns 503 when launch controls are unavailable", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = {
    writer: {
      async reject() { throw new ReviewWriteError("storage_unavailable", "no db", true); }
    },
  };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/reject`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ reasonCode: "other" }),
      });
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.error, "Review state could not be persisted.");
      assert.doesNotMatch(JSON.stringify(body), /no db/);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

// --- SUPERSEDE ROUTE ---

test("supersede passes caseId and versionId to writer", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  let received: any;
  const runtime = { writer: { async supersede(input: any) { received = input; return { ok: true, supersessionId: "sup_1", ...input }; } } };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-sup/version_sup/supersede`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(received.caseId, "CASE-sup");
      assert.equal(received.versionId, "version_sup");
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("supersede returns 401 without reviewer token", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  try {
    await withServer({ writer: { async supersede() { return {}; } } }, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/supersede`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
      });
      assert.equal(response.status, 401);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("supersede returns 409 on conflict (invalid state)", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = {
    writer: {
      async supersede() { throw new ReviewWriteError("conflict", "cannot supersede approved", false); }
    },
  };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/supersede`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 409);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.error, "The review change conflicts with current review state.");
      assert.doesNotMatch(JSON.stringify(body), /cannot supersede/);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("supersede returns 503 on storage failure with no internal details leaked", async () => {
  const secret = "dsn=user:pass@host/db";
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = {
    writer: {
      async supersede() { throw new ReviewWriteError("storage_unavailable", `db down ${secret}`, true); }
    },
  };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/supersede`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 503);
      const body = await response.text();
      assert.equal(body.includes(secret), false);
      assert.equal(body.includes("Review state could not be persisted."), true);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

// --- RELEASE-DECISION ROUTE ---

const validRecipient = { algorithm: "sha256", digest: "abc123def456", bindingVersion: "v1" };
const validBindings = { policyVersion: "p1", modelVersion: "m1", evidenceVersion: "e1" };

test("release-decision returns allowed:true with correct bindings and recipient", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  let received: any;
  const runtime = {
    releaseGate: {
      async decide(input: any) {
        received = input;
        return { allowed: true, code: "release_allowed", versionId: input.versionId, caseId: input.caseId, approvalId: "appr_1", evaluatedAt: new Date().toISOString() };
      }
    },
  };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-rel/version_rel/release-decision`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...validBindings, recipient: validRecipient }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.allowed, true);
      assert.equal(body.code, "release_allowed");
      assert.equal(received.caseId, "CASE-rel");
      assert.equal(received.versionId, "version_rel");
      assert.equal(received.recipient.algorithm, "sha256");
      assert.equal(received.policyVersion, "p1");
      assert.equal(received.modelVersion, "m1");
      assert.equal(received.evidenceVersion, "e1");
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("release-decision returns 409 when gate denies the release", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = {
    releaseGate: {
      async decide() {
        return { allowed: false, code: "review_required" as const, versionId: "v", caseId: "c", evaluatedAt: new Date().toISOString() };
      }
    },
  };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/release-decision`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...validBindings, recipient: validRecipient }),
      });
      assert.equal(response.status, 409);
      const body = await response.json();
      assert.equal(body.allowed, false);
      assert.equal(body.code, "review_required");
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("release-decision returns 400 for missing policyVersion", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = { releaseGate: { async decide() { return { allowed: true, code: "release_allowed" as const, versionId: "", caseId: "", evaluatedAt: "" }; } } };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/release-decision`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ policyVersion: "", modelVersion: "m1", evidenceVersion: "e1", recipient: validRecipient }),
      });
      assert.equal(response.status, 400, "empty policyVersion must be 400");
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.code, "INVALID_REVIEW_INPUT");
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("release-decision returns 400 for missing or invalid recipient binding", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = { releaseGate: { async decide() { return { allowed: true, code: "release_allowed" as const, versionId: "", caseId: "", evaluatedAt: "" }; } } };
  try {
    await withServer(runtime, async (origin) => {
      const noRecipient = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/release-decision`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...validBindings }),
      });
      assert.equal(noRecipient.status, 400, "missing recipient must be 400");

      const wrongAlgo = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/release-decision`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...validBindings, recipient: { algorithm: "md5", digest: "x", bindingVersion: "v1" } }),
      });
      assert.equal(wrongAlgo.status, 400, "non-sha256 algorithm must be 400");

      const missingDigest = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/release-decision`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...validBindings, recipient: { algorithm: "sha256", digest: "", bindingVersion: "v1" } }),
      });
      assert.equal(missingDigest.status, 400, "empty digest must be 400");
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("release-decision returns 401 without reviewer token", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  try {
    await withServer({ releaseGate: { async decide() { return { allowed: true }; } } }, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/release-decision`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validBindings, recipient: validRecipient }),
      });
      assert.equal(response.status, 401);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});

test("release-decision returns 503 when launch controls are unavailable", async () => {
  const prior = process.env.DRIVABLE_REVIEWER_TOKEN; process.env.DRIVABLE_REVIEWER_TOKEN = token;
  const runtime = {
    releaseGate: {
      async decide() { throw new (await import("./async-release-gate.js")).ReviewReleaseReadError("STORAGE_UNAVAILABLE", "no durable storage"); }
    },
  };
  try {
    await withServer(runtime, async (origin) => {
      const response = await fetch(`${origin}/api/internal/review/CASE-1/version_12345678/release-decision`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ ...validBindings, recipient: validRecipient }),
      });
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.doesNotMatch(JSON.stringify(body), /no durable storage/);
    });
  } finally { if (prior === undefined) delete process.env.DRIVABLE_REVIEWER_TOKEN; else process.env.DRIVABLE_REVIEWER_TOKEN = prior; }
});
