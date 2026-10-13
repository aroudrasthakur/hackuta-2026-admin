import { v } from "convex/values";
import { query } from "../_generated/server";
import { SCHOOL_OTHER_OPTION } from "../../shared/registration/constants";
import {
  applicationFormWasSubmitted,
  formatApplicantFullName,
  getApplicationReview,
} from "../lib/applications";
import type { ApplicationDoc } from "../lib/dataModel";
import { ACTIVE_REVIEW_STALE_MS, isFinalReviewStatus, isReviewStale } from "./reviewClaim";
import { requireReviewerAccess, sessionTokenArgs } from "./staffAuth";

function formatApplicantSchool(application: Pick<ApplicationDoc, "school" | "otherSchool">) {
  const school = application.school?.trim();
  const otherSchool = application.otherSchool?.trim();
  if (school === SCHOOL_OTHER_OPTION) {
    return otherSchool || school || "Not provided";
  }
  return school || otherSchool || "Not provided";
}

/** Read-only queue of submitted applications with current review state (no audit logs). */
export const listSubmittedApplications = query({
  args: sessionTokenArgs,
  handler: async (ctx, { sessionToken }) => {
    await requireReviewerAccess(ctx, sessionToken);

    const reviews = await ctx.db.query("applicationReviews").collect();
    const reviewByApplicationId = new Map(reviews.map((review) => [review.applicationId, review]));

    const reviewerIds = new Set(
      reviews.flatMap((review) => (review.reviewedBy ? [review.reviewedBy] : [])),
    );
    const reviewerNameById = new Map<string, string>();
    for (const adminId of reviewerIds) {
      const admin = await ctx.db.get(adminId);
      if (admin) reviewerNameById.set(adminId, admin.name);
    }

    const applications = await ctx.db.query("applications").collect();
    const items = applications
      .filter(applicationFormWasSubmitted)
      .map((application) => {
        const review = reviewByApplicationId.get(application._id);
        const reviewedBy = review?.reviewedBy;
        return {
          applicationId: application._id,
          email: application.email ?? "",
          applicantName:
            formatApplicantFullName(application) ?? application.email ?? "Unknown applicant",
          school: formatApplicantSchool(application),
          submittedAt: application.submittedAt ?? null,
          reviewStatus: review?.status ?? null,
          currentReviewerName: reviewedBy
            ? (reviewerNameById.get(reviewedBy) ?? "Unknown organizer")
            : null,
        };
      });

    items.sort((left, right) => (right.submittedAt ?? 0) - (left.submittedAt ?? 0));
    return items;
  },
});

/** Loads a submitted application without changing applicant or review state. */
export const getApplication = query({
  args: {
    ...sessionTokenArgs,
    applicationId: v.string(),
  },
  handler: async (ctx, { sessionToken, applicationId }) => {
    await requireReviewerAccess(ctx, sessionToken);
    const id = ctx.db.normalizeId("applications", applicationId);
    if (!id) return null;
    const application = await ctx.db.get(id);
    if (!application || !applicationFormWasSubmitted(application)) return null;

    const review = await getApplicationReview(ctx, id);
    const currentReviewer = review?.reviewedBy ? await ctx.db.get(review.reviewedBy) : null;
    const now = Date.now();
    const resumeUrl = application.resumeStorageId
      ? await ctx.storage.getUrl(application.resumeStorageId)
      : null;
    const resumeStatus: "none" | "available" | "missing" = !application.resumeStorageId
      ? "none"
      : resumeUrl ? "available" : "missing";

    return {
      application,
      reviewStatus: review?.status ?? null,
      reviewActivity: review
        ? {
            reviewedBy: review.reviewedBy ?? null,
            currentReviewerName: currentReviewer?.name ?? null,
            startedAt: review.startedAt ?? null,
            lastActiveAt: review.lastActiveAt ?? null,
            isFinal: isFinalReviewStatus(review.status),
            isStale: isReviewStale(review, now),
            activeReviewStaleMs: ACTIVE_REVIEW_STALE_MS,
          }
        : {
            reviewedBy: null,
            currentReviewerName: null,
            startedAt: null,
            lastActiveAt: null,
            isFinal: false,
            isStale: false,
            activeReviewStaleMs: ACTIVE_REVIEW_STALE_MS,
          },
      resume: {
        status: resumeStatus,
        url: resumeUrl,
        filename: application.resumeFilename ?? null,
      },
    };
  },
});
