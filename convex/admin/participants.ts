import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/** 256-bit random hex token used as the participant's QR identity. */
function createQrCodeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Create the participant row for a confirmed acceptance.
 * Idempotent: returns the existing participant if the application already has one.
 * Reuses the applicant's existing `users` account; profile data stays on `applications`.
 */
export const createParticipantFromAcceptance = internalMutation({
  args: {
    applicationId: v.id("applications"),
    acceptedBy: v.id("admins"),
  },
  handler: async (ctx, { applicationId, acceptedBy }) => {
    const existing = await ctx.db
      .query("participants")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .unique();
    if (existing) {
      return existing._id;
    }

    const application = await ctx.db.get(applicationId);
    if (!application) {
      throw new Error("Application not found.");
    }

    const review = await ctx.db
      .query("applicationReviews")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .unique();
    if (review?.status !== "accepted") {
      throw new Error("Application has not been accepted.");
    }

    const admin = await ctx.db.get(acceptedBy);
    if (!admin?.active) {
      throw new Error("Accepting admin not found or inactive.");
    }

    const user = await ctx.db.get(application.authUserId);
    if (!user) {
      throw new Error("Applicant user account not found.");
    }

    let qrCodeToken = createQrCodeToken();
    while (
      await ctx.db
        .query("participants")
        .withIndex("by_qr_token", (q) => q.eq("qrCodeToken", qrCodeToken))
        .first()
    ) {
      qrCodeToken = createQrCodeToken();
    }

    const now = Date.now();
    return await ctx.db.insert("participants", {
      applicationId,
      authUserId: application.authUserId,
      acceptedAt: review.reviewedAt ?? now,
      acceptedBy,
      qrCodeToken,
      createdAt: now,
      updatedAt: now,
    });
  },
});
