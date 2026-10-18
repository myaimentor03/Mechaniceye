import type { RequestHandler } from "express";
import { optionalCustomer } from "./customer-auth.js";
import {
  REVIEWER_TOKEN_ENV,
  requireReviewer,
  reviewerAuthorization,
  reviewerIdentityFromCredential,
} from "./reviewer-auth.js";

/** Customer access is still constrained by the case-owner checks in each route. */
export const requireCustomerOrReviewer: RequestHandler = (req, res, next) => {
  const reviewerToken = process.env[REVIEWER_TOKEN_ENV];
  if (reviewerAuthorization(req.headers.authorization, reviewerToken) === "authorized") {
    req.drivableReviewer = reviewerIdentityFromCredential(reviewerToken);
    res.setHeader("Cache-Control", "no-store");
    next();
    return;
  }

  optionalCustomer(req, res, () => {
    if (req.drivableCustomer) {
      res.setHeader("Cache-Control", "no-store");
      next();
      return;
    }
    requireReviewer(req, res, next);
  });
};
