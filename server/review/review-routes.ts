import type { Express, Response } from "express";
import { requireReviewer } from "../reviewer-auth.js";
import { ReviewReleaseReadError } from "./async-release-gate.js";
import { LaunchControlUnavailableError, requireVerifiedLaunchControlRuntime } from "./launch-control-runtime.js";
import type { ReviewRejectionReason, ReviewRiskLevel } from "./types.js";
import { ReviewWriteError } from "./postgres-review-writer.js";

const RISK_LEVELS: readonly ReviewRiskLevel[] = ["low", "moderate", "high", "critical", "unknown"];
const REJECTION_REASONS: readonly ReviewRejectionReason[] = ["insufficient_evidence", "policy_mismatch", "unsafe_content", "other"];

type RuntimeProvider = typeof requireVerifiedLaunchControlRuntime;

export function registerDurableReviewRoutes(app: Express, runtimeProvider: RuntimeProvider = requireVerifiedLaunchControlRuntime): void {
  app.post("/api/internal/review/drafts", requireReviewer, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const runtime = await runtimeProvider();
      const input = versionInput(req.body);
      res.status(201).json(await runtime.writer.createDraft(input));
    } catch (error) { reviewError(res, error); }
  });

  app.post("/api/internal/review/:caseId/:versionId/final", requireReviewer, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const caseId = assertSafePathId(req.params.caseId, "caseId");
      const versionId = assertSafePathId(req.params.versionId, "versionId");
      const runtime = await runtimeProvider();
      const input = versionInput({ ...req.body, caseId });
      res.status(201).json(await runtime.writer.createFinal({ ...input, sourceVersionId: versionId }));
    } catch (error) { reviewError(res, error); }
  });

  app.post("/api/internal/review/:caseId/:versionId/approve", requireReviewer, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const caseId = assertSafePathId(req.params.caseId, "caseId");
      const versionId = assertSafePathId(req.params.versionId, "versionId");
      const runtime = await runtimeProvider();
      res.json(await runtime.writer.approve({
        caseId, versionId,
        reviewerRef: req.drivableReviewer!.ref,
        highRiskAcknowledged: req.body?.highRiskAcknowledged === true,
      }));
    } catch (error) { reviewError(res, error); }
  });

  app.post("/api/internal/review/:caseId/:versionId/reject", requireReviewer, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const caseId = assertSafePathId(req.params.caseId, "caseId");
      const versionId = assertSafePathId(req.params.versionId, "versionId");
      const reasonCode = req.body?.reasonCode;
      if (!REJECTION_REASONS.includes(reasonCode)) throw new TypeError("A valid rejection reason is required");
      const runtime = await runtimeProvider();
      res.json(await runtime.writer.reject({
        caseId, versionId,
        reviewerRef: req.drivableReviewer!.ref, reasonCode,
      }));
    } catch (error) { reviewError(res, error); }
  });

  app.post("/api/internal/review/:caseId/:versionId/supersede", requireReviewer, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const caseId = assertSafePathId(req.params.caseId, "caseId");
      const versionId = assertSafePathId(req.params.versionId, "versionId");
      const runtime = await runtimeProvider();
      res.json(await runtime.writer.supersede({ caseId, versionId }));
    } catch (error) { reviewError(res, error); }
  });

  app.post("/api/internal/review/:caseId/:versionId/release-decision", requireReviewer, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const caseId = assertSafePathId(req.params.caseId, "caseId");
      const versionId = assertSafePathId(req.params.versionId, "versionId");
      const runtime = await runtimeProvider();
      const bindings = versionBindings(req.body);
      const recipient = recipientBinding(req.body?.recipient);
      const decision = await runtime.releaseGate.decide({
        caseId, versionId, recipient, ...bindings,
      });
      res.status(decision.allowed ? 200 : 409).json(decision);
    } catch (error) { reviewError(res, error); }
  });
}

function versionInput(body: any) {
  const bindings = versionBindings(body);
  const riskLevel = body?.riskLevel;
  if (!RISK_LEVELS.includes(riskLevel)) throw new TypeError("A valid risk level is required");
  return {
    caseId: requiredText(body?.caseId, "caseId"), artifactDigest: requiredText(body?.artifactDigest, "artifactDigest"),
    recipient: recipientBinding(body?.recipient), riskLevel, mock: body?.mock === true, ...bindings,
  };
}
function versionBindings(body: any) {
  return { policyVersion: requiredText(body?.policyVersion, "policyVersion"),
    modelVersion: requiredText(body?.modelVersion, "modelVersion"), evidenceVersion: requiredText(body?.evidenceVersion, "evidenceVersion") };
}
function recipientBinding(value: any) {
  if (value?.algorithm !== "sha256") throw new TypeError("Recipient binding must use sha256");
  return { algorithm: "sha256" as const, digest: requiredText(value?.digest, "recipient.digest"),
    bindingVersion: requiredText(value?.bindingVersion, "recipient.bindingVersion") };
}
function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  return value;
}
const CASE_ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
function assertSafePathId(value: unknown, field: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || !CASE_ID_RE.test(s)) throw new TypeError(`${field} contains invalid characters`);
  if (s.includes("..") || s.includes("/") || s.includes("\\")) throw new TypeError(`${field} path traversal is not allowed`);
  return s;
}
function reviewError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof LaunchControlUnavailableError) {
    res.status(503).json({ ok: false, code: error.code, error: "Durable review controls are not ready." }); return;
  }
  if (error instanceof ReviewWriteError) {
    // Never echo `error.message`: its text may later wrap storage/DB internals.
    // Only a fixed, code-mapped string reaches the reviewer.
    const message = error.code === "invalid_state"
      ? "The review state is invalid."
      : error.code === "conflict"
        ? "The review change conflicts with current review state."
        : "Review state could not be persisted.";
    res.status(error.code === "storage_unavailable" ? 503 : error.code === "conflict" ? 409 : 422)
      .json({ ok: false, code: error.code, error: message }); return;
  }
  if (error instanceof ReviewReleaseReadError) {
    res.status(503).json({ ok: false, code: error.code, error: "Review release state could not be verified." }); return;
  }
  if (error instanceof TypeError) {
    res.status(400).json({ ok: false, code: "INVALID_REVIEW_INPUT", error: "The review input is invalid." }); return;
  }
  res.status(503).json({ ok: false, code: "REVIEW_OPERATION_FAILED", error: "Review operation could not be completed." });
}
