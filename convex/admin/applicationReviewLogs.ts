import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { normalizeEmail } from "../lib/normalizeEmail";

const logAction = v.union(
  v.literal("viewed"),
  v.literal("started_review"),
  v.literal("review_ended"),
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
  return admin;
}

/** Appends one event. adminId and createdAt are always server-derived. */
export const logApplicationReviewAction = mutation({
  args: { applicationId: v.id("applications"), action: logAction },
  handler: async (ctx, { applicationId, action }) => {
    const admin = await requireActiveStaff(ctx);
    if (!(await ctx.db.get(applicationId))) throw new Error("Application not found");
    return await ctx.db.insert("applicationReviewLogs", {
      applicationId,
      adminId: admin._id,
      action,
      createdAt: Date.now(),
    });
  },
});

/** Full history for an application; restricted to `admin` role. */
export const listApplicationReviewLogs = query({
  args: {
    applicationId: v.id("applications"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { applicationId, paginationOpts }) => {
    const admin = await requireActiveStaff(ctx);
    if (admin.role !== "admin") throw new Error("Not authorized");
    return await ctx.db
      .query("applicationReviewLogs")
      .withIndex("by_application_createdAt", (q) => q.eq("applicationId", applicationId))
      .order("desc")
      .paginate(paginationOpts);
  },
});
