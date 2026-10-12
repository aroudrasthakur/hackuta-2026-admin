import type { GenericId } from "convex/values";
import type { DocumentByName } from "convex/server";
import type { DataModel, MutationCtx } from "../lib/dataModel";
import { applicationFormWasSubmitted, getApplicationReview } from "../lib/applications";

type ApplicationReviewDoc = DocumentByName<DataModel, "applicationReviews">;
type AdminDoc = DocumentByName<DataModel, "admins">;

/** Shared inactivity window before another organizer may claim an active review. */
export const ACTIVE_REVIEW_STALE_MS = 30 * 60 * 1000;

export const REVIEW_ALREADY_CLAIMED =
  "Application is already being reviewed by another organizer.";
export const REVIEW_FINALIZED = "This application already has a final decision.";

export function isFinalReviewStatus(status: ApplicationReviewDoc["status"]) {
  return (
    status === "accepted" ||
    status === "rejected" ||
    status === "waitlisted" ||
    status === "withdrawn"
  );
}

function reviewActivityAt(review: ApplicationReviewDoc) {
  return review.lastActiveAt ?? review.startedAt ?? review.updatedAt;
}

export function isReviewStale(review: ApplicationReviewDoc, now: number) {
  if (!review.reviewedBy || review.status !== "under_review") {
    return false;
  }
  return now - reviewActivityAt(review) > ACTIVE_REVIEW_STALE_MS;
}

function isActiveReviewClaim(review: ApplicationReviewDoc, now: number) {
  return (
    review.status === "under_review" &&
    review.reviewedBy !== undefined &&
    !isReviewStale(review, now)
  );
}

export type StartReviewClaimResult =
  | { outcome: "logged" }
  | { outcome: "refreshed" };

/**
 * Claims or resumes an in-progress review. State updates and optional audit log
 * are returned to the caller so `started_review` stays atomic with patches.
 */
export async function startReviewClaim(
  ctx: MutationCtx,
  args: {
    applicationId: GenericId<"applications">;
    admin: AdminDoc;
    now: number;
  },
): Promise<StartReviewClaimResult> {
  const application = await ctx.db.get(args.applicationId);
  if (!application || !applicationFormWasSubmitted(application)) {
    throw new Error("Application not found");
  }

  const review = await getApplicationReview(ctx, args.applicationId);
  if (review && isFinalReviewStatus(review.status)) {
    throw new Error(REVIEW_FINALIZED);
  }

  if (review && isActiveReviewClaim(review, args.now)) {
    if (review.reviewedBy === args.admin._id) {
      await ctx.db.patch(review._id, {
        lastActiveAt: args.now,
        updatedAt: args.now,
      });
      return { outcome: "refreshed" };
    }
    throw new Error(REVIEW_ALREADY_CLAIMED);
  }

  const stale = review ? isReviewStale(review, args.now) : false;
  const switchingReviewer =
    review?.reviewedBy !== undefined && review.reviewedBy !== args.admin._id;
  const resetStartedAt = stale || switchingReviewer || !review?.startedAt;

  if (!review) {
    await ctx.db.insert("applicationReviews", {
      applicationId: args.applicationId,
      status: "under_review",
      reviewedBy: args.admin._id,
      startedAt: args.now,
      lastActiveAt: args.now,
      createdAt: args.now,
      updatedAt: args.now,
    });
    return { outcome: "logged" };
  }

  await ctx.db.patch(review._id, {
    status: "under_review",
    reviewedBy: args.admin._id,
    startedAt: resetStartedAt ? args.now : review.startedAt,
    lastActiveAt: args.now,
    updatedAt: args.now,
  });
  return { outcome: "logged" };
}
