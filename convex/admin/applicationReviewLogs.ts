import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { internal } from "../_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import {
  applicationReviewLogActivityAction,
  applicationReviewLogDecisionAction,
} from "./fields";
import { normalizeEmail } from "../lib/normalizeEmail";

async function requireActiveStaff(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const email = normalizeEmail(identity?.email);
  if (!email) throw new Error("Not authenticated");

  const admin = await ctx.db
    .query("admins")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (!admin || !admin.active) throw new Error("Not authorized");
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return { admin, userId };
}

/** Appends a non-decision event; decisions are recorded with their state update below. */
export const logApplicationReviewAction = mutation({
  args: {
    applicationId: v.id("applications"),
    action: applicationReviewLogActivityAction,
  },
  handler: async (ctx, { applicationId, action }) => {
    const { admin } = await requireActiveStaff(ctx);
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
    applicationId: v.id("applications"),
    decision: applicationReviewLogDecisionAction,
  },
  handler: async (ctx, { applicationId, decision }) => {
    const { admin, userId } = await requireActiveStaff(ctx);
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error("Application not found");

    const review = await ctx.db
      .query("applicationReviews")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .unique();
    if (!review) throw new Error("Application review not found");

    const now = Date.now();
    await ctx.db.patch(review._id, {
      status: decision,
      reviewedAt: now,
      reviewedBy: userId,
      updatedAt: now,
    });
    const logId = await ctx.db.insert("applicationReviewLogs", {
      applicationId,
      adminId: admin._id,
      action: decision,
      createdAt: now,
    });

    if (decision === "accepted") {
      await ctx.runMutation(
        internal.admin.participants.createParticipantFromAcceptance,
        { applicationId, acceptedBy: admin._id },
      );
    }

    return logId;
  },
});

/** Returns one page of history; full history is restricted to `admin` role. */
export const listApplicationReviewLogs = query({
  args: {
    applicationId: v.id("applications"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { applicationId, paginationOpts }) => {
    const { admin } = await requireActiveStaff(ctx);
    if (admin.role !== "admin") throw new Error("Not authorized");
    return await ctx.db
      .query("applicationReviewLogs")
      .withIndex("by_application_createdAt", (q) => q.eq("applicationId", applicationId))
      .order("desc")
      .paginate(paginationOpts);
  },
});
