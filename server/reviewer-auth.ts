import { createHash, timingSafeEqual } from "crypto";
import type { RequestHandler } from "express";

export const REVIEWER_TOKEN_ENV = "DRIVABLE_REVIEWER_TOKEN";

export type ReviewerIdentity = Readonly<{ ref: string }>;

declare global {
  namespace Express {
    interface Request {
      drivableReviewer?: ReviewerIdentity;
    }
  }
}

function normalizedToken(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function bearerToken(authorization: unknown): string {
  if (typeof authorization !== "string") return "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return normalizedToken(match?.[1]);
}

export function tokenMatches(candidate: unknown, configured: unknown): boolean {
  const left = Buffer.from(normalizedToken(candidate));
  const right = Buffer.from(normalizedToken(configured));
  if (!left.length || !right.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type ReviewerAuthorization = "authorized" | "not_configured" | "unauthorized";

export function reviewerAuthorization(authorization: unknown, configured: unknown): ReviewerAuthorization {
  const expected = normalizedToken(configured);
  if (expected.length < 32) return "not_configured";
  return tokenMatches(bearerToken(authorization), expected) ? "authorized" : "unauthorized";
}

/** Stable opaque audit identity. The credential itself is never stored in review records. */
export function reviewerIdentityFromCredential(configured: unknown): ReviewerIdentity {
  const token = normalizedToken(configured);
  if (token.length < 32) throw new TypeError("Reviewer credential is not configured securely");
  const digest = createHash("sha256").update(token, "utf8").digest("hex").slice(0, 32);
  return Object.freeze({ ref: `reviewer_${digest}` });
}

export const requireReviewer: RequestHandler = (req, res, next) => {
  const configured = normalizedToken(process.env[REVIEWER_TOKEN_ENV]);

  const authorization = reviewerAuthorization(req.headers.authorization, configured);

  if (authorization === "not_configured") {
    res.status(503).json({
      ok: false,
      error: "Internal review access is not configured.",
      code: "REVIEWER_ACCESS_NOT_CONFIGURED",
    });
    return;
  }

  if (authorization === "unauthorized") {
    res.setHeader("WWW-Authenticate", 'Bearer realm="drivable-review"');
    res.status(401).json({
      ok: false,
      error: "Reviewer authorization is required.",
      code: "REVIEWER_AUTH_REQUIRED",
    });
    return;
  }

  req.drivableReviewer = reviewerIdentityFromCredential(configured);
  res.setHeader("Cache-Control", "no-store");
  next();
};
