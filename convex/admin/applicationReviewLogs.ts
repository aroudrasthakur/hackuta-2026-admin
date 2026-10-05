import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { normalizeEmail } from "../lib/normalizeEmail";

const activityAction = v.union(
  v.literal("viewed"),
  v.literal("started_review"),
  v.literal("review_ended"),
);

const decisionAction = v.union(
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("waitlisted"),
);

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
  args: { applicationId: v.id("applications"), action: activityAction },
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
    decision: decisionAction,
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
