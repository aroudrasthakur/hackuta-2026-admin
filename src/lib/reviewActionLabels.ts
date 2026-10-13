import type { ReviewHistoryEvent } from "../convex/adminApi";

/** Human-readable labels for `applicationReviewLogs.action` values in admin UI. */
export const reviewActionLabels: Record<ReviewHistoryEvent["action"], string> = {
  viewed: "Viewed application",
  started_review: "Started review",
  review_ended: "Ended review",
  accepted: "Accepted applicant",
  rejected: "Rejected applicant",
  waitlisted: "Waitlisted applicant",
};
