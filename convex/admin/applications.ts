import { v } from "convex/values";
import { query } from "../_generated/server";
import { applicationFormWasSubmitted } from "../lib/applications";
import { requireReviewerAccess, sessionTokenArgs } from "./staffAuth";

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

    const review = await ctx.db
      .query("applicationReviews")
      .withIndex("by_application", (q) => q.eq("applicationId", id))
      .unique();
    const resumeExists = application.resumeStorageId
      ? await ctx.db.system.get("_storage", application.resumeStorageId)
      : null;
    const resumeUrl = resumeExists && application.resumeStorageId
      ? await ctx.storage.getUrl(application.resumeStorageId)
      : null;
    const resumeStatus: "none" | "available" | "missing" = !application.resumeStorageId
      ? "none"
      : resumeUrl ? "available" : "missing";

    return {
      application,
      reviewStatus: review?.status ?? null,
      resume: {
        status: resumeStatus,
        url: resumeUrl,
        filename: application.resumeFilename ?? null,
      },
    };
  },
});
