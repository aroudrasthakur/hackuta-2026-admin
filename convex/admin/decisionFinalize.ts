import type { GenericId } from "convex/values";
import type { DocumentByName } from "convex/server";
import type { ApplicationDoc, DataModel, MutationCtx } from "../lib/dataModel";
import { scheduleDecisionNotification } from "./decisionNotifications";
import { applyAcceptedApplicationDecision } from "./acceptanceDecision";
import { isActiveReviewClaimHeldByOther, isFinalReviewStatus, REVIEW_ALREADY_CLAIMED } from "./reviewClaim";
import { decisionPatch } from "./reviewState";

type ApplicationReviewDoc = DocumentByName<DataModel, "applicationReviews">;
type AdminDoc = DocumentByName<DataModel, "admins">;
type ReviewDecision = "accepted" | "rejected" | "waitlisted";

async function findLatestDecisionLog(
  ctx: MutationCtx,
  applicationId: GenericId<"applications">,
  decision: ReviewDecision,
) {
  const logs = await ctx.db
    .query("applicationReviewLogs")
    .withIndex("by_application_createdAt", (q) => q.eq("applicationId", applicationId))
    .order("desc")
    .collect();
  return logs.find((log) => log.action === decision) ?? null;
}

/** Applies a confirmed final decision once; repeats return the existing log without re-emailing. */
export async function finalizeApplicationDecision(
  ctx: MutationCtx,
  args: {
    application: ApplicationDoc;
    review: ApplicationReviewDoc;
    admin: AdminDoc;
    decision: ReviewDecision;
  },
) {
  const promotingWaitlist = args.review.status === "waitlisted" && args.decision === "accepted";
  if (isFinalReviewStatus(args.review.status) && !promotingWaitlist) {
    if (args.review.status !== args.decision) {
      throw new Error("Application already has a final decision.");
    }
    const existingLog = await findLatestDecisionLog(
      ctx,
      args.application._id,
      args.decision,
    );
    if (existingLog) {
      return { logId: existingLog._id, duplicate: true as const };
    }
    throw new Error("Application already has a final decision.");
  }

  const now = Date.now();
  if (isActiveReviewClaimHeldByOther(args.review, args.admin._id, now)) {
    throw new Error(REVIEW_ALREADY_CLAIMED);
  }

  let logId: GenericId<"applicationReviewLogs">;
  if (args.decision === "accepted") {
    const result = await applyAcceptedApplicationDecision(ctx, {
      application: args.application,
      review: args.review,
      admin: args.admin,
    });
    logId = result.logId;
  } else {
    const now = Date.now();
    await ctx.db.patch(
      args.review._id,
      decisionPatch(args.review, args.admin._id, args.decision, now),
    );
    logId = await ctx.db.insert("applicationReviewLogs", {
      applicationId: args.application._id,
      adminId: args.admin._id,
      action: args.decision,
      createdAt: now,
    });
  }

  await scheduleDecisionNotification(ctx, {
    application: args.application, decision: args.decision, logId, requestedBy: args.admin._id,
  });
  return { logId, duplicate: false as const };
}
