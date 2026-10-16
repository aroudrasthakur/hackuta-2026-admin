import { describe, expect, it } from "vitest";
import { needsApplicationReview, queueReviewStatus, type QueueApplication } from "../../shared/admin/reviewQueue";

describe("review queue states", () => {
  const base: QueueApplication = { reviewStatus: "under_review", currentReviewerName: null };
  it("recognizes a fresh registration as awaiting review before an organizer claims it", () => {
    expect(queueReviewStatus(base, 1)).toBe("unreviewed");
    expect(needsApplicationReview(base)).toBe(true);
  });
  it("changes from in review to reclaimable after the claim expires", () => {
    const application = { ...base, currentReviewerName: "Riley", reviewClaim: { reviewedBy: "riley", expiresAt: 100 } };
    expect(queueReviewStatus(application, 100)).toBe("under_review");
    expect(queueReviewStatus(application, 101)).toBe("stale");
  });
  it.each(["accepted", "rejected", "waitlisted", "withdrawn"] as const)("keeps %s outside the review queue", (reviewStatus) => {
    const application = { ...base, reviewStatus };
    expect(queueReviewStatus(application, 1)).toBe(reviewStatus);
    expect(needsApplicationReview(application)).toBe(false);
  });
  it("supports legacy summaries", () => {
    expect(queueReviewStatus({ ...base, currentReviewerName: "Riley" }, 1)).toBe("under_review");
    expect(queueReviewStatus({ ...base, reviewStatus: null }, 1)).toBe("unreviewed");
    expect(needsApplicationReview({ ...base, reviewStatus: "unreviewed" })).toBe(true);
  });
});
