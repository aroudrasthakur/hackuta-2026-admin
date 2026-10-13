import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  applicationFormWasSubmitted,
  formatApplicantFullName,
} from "../lib/applications";
import { requireAdminSession, sessionTokenArgs } from "./staffAuth";

/** Read-only review queue for authenticated admins and reviewers. */
export const listSubmittedApplications = query({
  args: sessionTokenArgs,
  handler: async (ctx, { sessionToken }) => {
    await requireAdminSession(ctx, sessionToken);

    const applications = await ctx.db.query("applications").collect();
    const submittedApplications = applications.filter(applicationFormWasSubmitted);

    const rows = await Promise.all(
      submittedApplications.map(async (application) => {
        const review = await ctx.db
          .query("applicationReviews")
          .withIndex("by_application", (q) =>
            q.eq("applicationId", application._id),
          )
          .unique();

        let reviewerName = review?.legacyReviewedBy;
        if (review?.reviewedByAdmin) {
          const reviewer = await ctx.db.get(review.reviewedByAdmin);
          reviewerName = reviewer?.name ?? reviewerName;
        } else if (review?.reviewedBy) {
          const reviewer = await ctx.db.get(review.reviewedBy);
          reviewerName = reviewer?.name ?? reviewer?.email ?? reviewerName;
        }

        const applicantName =
          formatApplicantFullName(application) ??
          (await ctx.db.get(application.authUserId))?.name ??
          null;

        return {
          _id: application._id,
          applicantName,
          firstName: application.firstName,
          lastName: application.lastName,
          school: application.school,
          otherSchool: application.otherSchool,
          submittedAt: application.submittedAt,
          status: review?.status ?? null,
          reviewerName: reviewerName ?? null,
        };
      }),
    );

    return rows
      .filter((row) => row.status !== "withdrawn")
      .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  },
});

/** Helper mutation to create sample submitted applications for testing the review dashboard. Restricted to admins. */
export const createSampleApplication = mutation({
  args: {
    ...sessionTokenArgs,
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    school: v.string(),
    status: v.optional(
      v.union(
        v.literal("unreviewed"),
        v.literal("under_review"),
        v.literal("accepted"),
        v.literal("waitlisted"),
        v.literal("rejected"),
      ),
    ),
    reviewerAdminId: v.optional(v.id("admins")),
  },
  handler: async (ctx, args) => {
    const { admin: caller } = await requireAdminSession(ctx, args.sessionToken);
    if (caller.role !== "admin") {
      throw new Error("Not authorized: admin role required.");
    }

    const now = Date.now();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    let authUserId = user?._id;
    if (!authUserId) {
      authUserId = await ctx.db.insert("users", {
        name: `${args.firstName} ${args.lastName}`,
        email: args.email,
        emailVerificationTime: now,
      });
    }

    const applicationId = await ctx.db.insert("applications", {
      authUserId,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      school: args.school,
      createdAt: now,
      applicantUpdatedAt: now,
      formSubmitted: true,
      submittedAt: now,
    });

    if (args.status && args.status !== "unreviewed") {
      await ctx.db.insert("applicationReviews", {
        applicationId,
        status: args.status,
        reviewedAt: now,
        reviewedByAdmin: args.reviewerAdminId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { applicationId, ok: true };
  },
});
