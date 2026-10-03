import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { mutation, query } from "../_generated/server";

// Tables are defined in hackuta-2026-register/convex/schema.ts; this repo has no local schema.
type Ctx = GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>;
type AdminRole = "admin" | "reviewer";

const logAction = v.union(
  v.literal("viewed"),
  v.literal("started_review"),
  v.literal("review_ended"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("waitlisted"),
);

async function requireStaff(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!admin) throw new Error("Not authorized");
  return { _id: admin._id, role: admin.role as AdminRole };
}

/** Appends one event. adminId and createdAt are always server-derived. */
export const logApplicationReviewAction = mutation({
  args: { applicationId: v.id("profiles"), action: logAction },
  handler: async (ctx, { applicationId, action }) => {
    const admin = await requireStaff(ctx);
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
  args: { applicationId: v.id("profiles") },
  handler: async (ctx, { applicationId }) => {
    const admin = await requireStaff(ctx);
    if (admin.role !== "admin") throw new Error("Not authorized");
    return await ctx.db
      .query("applicationReviewLogs")
      .withIndex("by_application_createdAt", (q) => q.eq("applicationId", applicationId))
      .order("desc")
      .collect();
  },
});
