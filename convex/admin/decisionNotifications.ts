import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "../_generated/server";
import type { ApplicationDoc, MutationCtx } from "../lib/dataModel";
import { getApplicationReview, formatApplicantFullName } from "../lib/applications";
import { getHackathonName } from "../lib/eventConfig";
import { decisionNotificationStatus } from "./fields";
import { requireReviewerAccess, sessionTokenArgs } from "./staffAuth";
import type { GenericId } from "convex/values";

type Decision = "accepted" | "rejected" | "waitlisted";

/** Persist the attempt in the same transaction as scheduling its email. */
export async function scheduleDecisionNotification(
  ctx: MutationCtx,
  args: { application: ApplicationDoc; decision: Decision; logId: GenericId<"applicationReviewLogs">; requestedBy: GenericId<"admins">; attempt?: number },
) {
  const review = await getApplicationReview(ctx, args.application._id);
  if (!review) throw new Error("Application review not found.");
  const recipient = args.application.email?.trim() ?? "";
  const attempt = args.attempt ?? 1;
  await ctx.db.patch(review._id, { notification: {
    logId: args.logId, attempt, requestedBy: args.requestedBy, recipient,
    status: recipient ? "scheduled" : "unavailable", updatedAt: Date.now(),
  } });
  if (!recipient) return;
  await ctx.scheduler.runAfter(0, makeFunctionReference<"action">("admin/sendDecisionEmails:sendDecisionEmail"), {
    applicationId: args.application._id, logId: args.logId, attempt,
    decision: args.decision, email: recipient,
    applicantName: formatApplicantFullName(args.application) ?? recipient,
    hackathonName: await getHackathonName(ctx),
  });
}

export const retryDecisionNotification = mutation({
  args: { ...sessionTokenArgs, applicationId: v.id("applications") },
  handler: async (ctx, { sessionToken, applicationId }) => {
    const admin = await requireReviewerAccess(ctx, sessionToken);
    const application = await ctx.db.get(applicationId);
    const review = await getApplicationReview(ctx, applicationId);
    if (!application || !review || !["accepted", "rejected", "waitlisted"].includes(review.status)) {
      throw new Error("A decision is required before sending a notification.");
    }
    const previous = review.notification;
    if (previous && !["failed", "unknown", "unavailable"].includes(previous.status)) {
      throw new Error("This notification is already in progress or has been sent.");
    }
    // Legacy decisions have no delivery record; require a real decision log to resend.
    const logs = await ctx.db.query("applicationReviewLogs")
      .withIndex("by_application_createdAt", (q) => q.eq("applicationId", applicationId)).order("desc").collect();
    const logId = logs.find((log) => log.action === review.status)?._id;
    if (!logId) throw new Error("No recorded decision is available to notify.");
    if (!application.email?.trim()) throw new Error("This applicant has no email address.");
    await scheduleDecisionNotification(ctx, {
      application, decision: review.status as Decision, logId,
      requestedBy: admin._id, attempt: (previous?.attempt ?? 0) + 1,
    });
  },
});

const attemptArgs = { applicationId: v.id("applications"), logId: v.id("applicationReviewLogs"), attempt: v.number() };

/** Claim an attempt before making HTTP calls; duplicate jobs and superseded decisions do nothing. */
export const beginNotification = internalMutation({
  args: attemptArgs,
  handler: async (ctx, args) => {
    const review = await getApplicationReview(ctx, args.applicationId);
    const current = review?.notification;
    if (!review || !current || current.logId !== args.logId || current.attempt !== args.attempt || current.status !== "scheduled") return false;
    await ctx.db.patch(review._id, { notification: { ...current, status: "sending", updatedAt: Date.now() } });
    return true;
  },
});

export const recordNotification = internalMutation({
  args: { ...attemptArgs, status: decisionNotificationStatus, serviceId: v.optional(v.string()), serviceStatus: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const review = await getApplicationReview(ctx, args.applicationId);
    const current = review?.notification;
    if (!review || !current || current.logId !== args.logId || current.attempt !== args.attempt) return;
    await ctx.db.patch(review._id, { notification: {
      ...current, status: args.status,
      ...(args.serviceId ? { serviceId: args.serviceId } : {}),
      ...(args.serviceStatus ? { serviceStatus: args.serviceStatus } : {}), updatedAt: Date.now(),
    } });
  },
});

export const getNotificationForStaff = internalQuery({
  args: { ...sessionTokenArgs, applicationId: v.id("applications") },
  handler: async (ctx, { sessionToken, applicationId }) => {
    await requireReviewerAccess(ctx, sessionToken);
    return (await getApplicationReview(ctx, applicationId))?.notification ?? null;
  },
});
