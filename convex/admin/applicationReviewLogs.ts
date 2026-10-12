import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "../_generated/server";
import { applicationFormWasSubmitted } from "../lib/applications";
import { applyAcceptedApplicationDecision } from "./acceptanceDecision";
import { requireAdminRole, requireReviewerAccess, sessionTokenArgs } from "./staffAuth";
import {
  applicationReviewLogActivityAction,
  applicationReviewLogDecisionAction,
} from "./fields";

/** Appends a non-decision event; decisions are recorded with their state update below. */
export const logApplicationReviewAction = mutation({
  args: {
    ...sessionTokenArgs,
    applicationId: v.id("applications"),
    action: applicationReviewLogActivityAction,
  },
  handler: async (ctx, { sessionToken, applicationId, action }) => {
    const admin = await requireReviewerAccess(ctx, sessionToken);
    if (!(await ctx.db.get(applicationId))) throw new Error("Application not found");
    return await ctx.db.insert("applicationReviewLogs", {
      applicationId,
      adminId: admin._id,
      action,
      createdAt: Date.now(),
    });
  },
});

/** Changes the current decision and appends its event atomically. */
export const setApplicationDecision = mutation({
  args: {
    ...sessionTokenArgs,
    applicationId: v.id("applications"),
    decision: applicationReviewLogDecisionAction,
  },
  handler: async (ctx, { sessionToken, applicationId, decision }) => {
    const admin = await requireReviewerAccess(ctx, sessionToken);
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error("Application not found");
    if (!applicationFormWasSubmitted(application)) throw new Error("Application has not been submitted.");

    const review = await ctx.db
      .query("applicationReviews")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .unique();
    if (!review) throw new Error("Application review not found");

    if (decision === "accepted") {
      const result = await applyAcceptedApplicationDecision(ctx, {
        application,
        review,
        admin,
      });
      return result.logId;
    }

    const now = Date.now();
    await ctx.db.patch(review._id, {
      status: decision,
      reviewedAt: now,
      reviewedByAdmin: admin._id,
      updatedAt: now,
    });
    return await ctx.db.insert("applicationReviewLogs", {
      applicationId,
      adminId: admin._id,
      action: decision,
      createdAt: now,
    });
  },
});

/** Returns one page of history; full history is restricted to `admin` role. */
export const listApplicationReviewLogs = query({
  args: {
    ...sessionTokenArgs,
    applicationId: v.id("applications"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { sessionToken, applicationId, paginationOpts }) => {
    await requireAdminRole(ctx, sessionToken);
    return await ctx.db
      .query("applicationReviewLogs")
      .withIndex("by_application_createdAt", (q) => q.eq("applicationId", applicationId))
      .order("desc")
      .paginate(paginationOpts);
  },
});
