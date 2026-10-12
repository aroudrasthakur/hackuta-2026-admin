import type { DocumentByName } from "convex/server";
import type { GenericId } from "convex/values";
import type { DataModel } from "../lib/dataModel";

type ApplicationReviewDoc = DocumentByName<DataModel, "applicationReviews">;
type ReviewDecision = "accepted" | "rejected" | "waitlisted";

/**
 * `applicationReviews` patch for an admin actively starting a review.
 * Takeover is allowed: `reviewedBy` moves to the new admin; `startedAt` keeps the first start.
 */
export function startReviewPatch(
  review: ApplicationReviewDoc,
  adminId: GenericId<"admins">,
  now: number,
) {
  return {
    reviewedBy: adminId,
    startedAt: review.startedAt ?? now,
    lastActiveAt: now,
    updatedAt: now,
  };
}

/** `applicationReviews` patch for a final decision made by the session admin. */
export function decisionPatch(
  review: ApplicationReviewDoc,
  adminId: GenericId<"admins">,
  status: ReviewDecision,
  now: number,
) {
  return {
    status,
    reviewedBy: adminId,
    startedAt: review.startedAt ?? now,
    lastActiveAt: now,
    completedAt: now,
    updatedAt: now,
  };
}
