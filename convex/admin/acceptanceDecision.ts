import type { DocumentByName } from "convex/server";
import type { GenericId } from "convex/values";
import type { ApplicationDoc, DataModel, MutationCtx } from "../lib/dataModel";
import {
  assertParticipantAcceptanceAllowed,
  ensureParticipantForAcceptance,
} from "./participantCreation";

type ApplicationReviewDoc = DocumentByName<DataModel, "applicationReviews">;
type AdminDoc = DocumentByName<DataModel, "admins">;

/**
 * Single transaction for acceptance: review update, audit log, and participant row.
 * Stable under re-acceptance, UI retries, and manual re-runs.
 */
export async function applyAcceptedApplicationDecision(
  ctx: MutationCtx,
  args: {
    application: ApplicationDoc;
    review: ApplicationReviewDoc;
    admin: AdminDoc;
    reviewerUserId: GenericId<"users">;
  },
) {
  const applicantUser = await ctx.db.get(args.application.authUserId);
  if (!applicantUser) {
    throw new Error("Applicant user account not found.");
  }

  await assertParticipantAcceptanceAllowed(ctx, {
    applicationId: args.application._id,
    authUserId: args.application.authUserId,
  });

  const now = Date.now();
  await ctx.db.patch(args.review._id, {
    status: "accepted",
    reviewedAt: now,
    reviewedBy: args.reviewerUserId,
    updatedAt: now,
  });

  const logId = await ctx.db.insert("applicationReviewLogs", {
    applicationId: args.application._id,
    adminId: args.admin._id,
    action: "accepted",
    createdAt: now,
  });

  const { participantId, created } = await ensureParticipantForAcceptance(ctx, {
    applicationId: args.application._id,
    authUserId: args.application.authUserId,
    acceptedBy: args.admin._id,
    acceptedAt: now,
  });

  return { logId, participantId, participantCreated: created };
}
