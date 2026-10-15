import { v, type Infer } from "convex/values";

export const decisionNotificationStatus = v.union(
  v.literal("scheduled"), v.literal("sending"), v.literal("queued"),
  v.literal("sent"), v.literal("failed"), v.literal("unknown"), v.literal("unavailable"),
);

export const decisionNotification = v.object({
  logId: v.id("applicationReviewLogs"),
  attempt: v.number(),
  requestedBy: v.id("admins"),
  recipient: v.string(),
  status: decisionNotificationStatus,
  serviceId: v.optional(v.string()),
  serviceStatus: v.optional(v.string()),
  updatedAt: v.number(),
});
export type DecisionNotification = Infer<typeof decisionNotification>;

/** Non-decision review activity recorded by `logApplicationReviewAction`. */
export const applicationReviewLogActivityAction = v.union(
  v.literal("viewed"),
  v.literal("started_review"),
  v.literal("review_ended"),
);

/** Decision events recorded by `setApplicationDecision`. */
export const applicationReviewLogDecisionAction = v.union(
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("waitlisted"),
);

/** Full append-only action union stored on `applicationReviewLogs.action`. */
export const applicationReviewLogAction = v.union(
  v.literal("viewed"),
  v.literal("started_review"),
  v.literal("review_ended"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("waitlisted"),
);
