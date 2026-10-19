import { describe, expect, it } from "vitest";
import {
  APPLICATIONS_QUEUE_PAGE_SIZE,
  applicationsInQueue,
  nextApplicationInQueue,
  paginateQueue,
  queueControls,
  queuePage,
  queuePageRange,
} from "../../src/lib/applicationQueue";
import type { SubmittedApplicationSummary } from "../../src/convex/adminApi";

function application(id: string, submittedAt: number, overrides: Partial<SubmittedApplicationSummary> = {}): SubmittedApplicationSummary {
  return { applicationId: id as SubmittedApplicationSummary["applicationId"], applicantName: `Applicant ${id}`, email: `${id}@example.com`, school: "Example School", submittedAt, reviewStatus: null, currentReviewerName: null, ...overrides };
}
const ownClaim = { reviewedBy: "me" as NonNullable<SubmittedApplicationSummary["reviewClaim"]>["reviewedBy"], expiresAt: 100 };
const applications = [
  application("a", 1),
  application("b", 2, { reviewStatus: "under_review", currentReviewerName: "Me", reviewClaim: ownClaim }),
  application("c", 3, { reviewStatus: "under_review", currentReviewerName: "Other", reviewClaim: { ...ownClaim, reviewedBy: "other" as typeof ownClaim.reviewedBy } }),
  application("d", 4, { reviewStatus: "accepted" }),
  application("e", 5, { reviewStatus: "under_review", currentReviewerName: "Other", reviewClaim: { ...ownClaim, expiresAt: 0 } }),
];
const ids = (items: SubmittedApplicationSummary[]) => items.map((item) => item.applicationId);

describe("application queue navigation", () => {
  it("treats need review separately from in review", () => {
    expect(ids(applicationsInQueue(applications, new URLSearchParams("status=needs_review"), "me", 1))).toEqual(["a", "e"]);
    expect(ids(applicationsInQueue(applications, new URLSearchParams("status=under_review"), "me", 1))).toEqual(["b", "c"]);
  });

  it("filters active assignments separately from review status", () => {
    expect(ids(applicationsInQueue(applications, new URLSearchParams("reviewer=mine"), "me", 1))).toEqual(["b"]);
    expect(ids(applicationsInQueue(applications, new URLSearchParams("reviewer=available"), "me", 1))).toEqual(["a", "b", "e"]);
    expect(ids(applicationsInQueue(applications, new URLSearchParams("reviewer=mine"), "me", 101))).toEqual([]);
  });
  it("respects search, ordering, and statuses and skips other active claims", () => {
    expect(nextApplicationInQueue(applications, "b", new URLSearchParams(), "me", 1)?.applicationId).toBe("e");
    expect(nextApplicationInQueue(applications, "e", new URLSearchParams(), "me", 1)?.applicationId).toBe("a");
    expect(nextApplicationInQueue(applications, "e", new URLSearchParams("sort=newest"), "me", 1)?.applicationId).toBe("b");
    expect(nextApplicationInQueue(applications, "a", new URLSearchParams("search=no-match"), "me", 1)).toBeNull();
    expect(nextApplicationInQueue(applications, "a", new URLSearchParams("status=accepted"), "me", 1)).toBeNull();
  });
  it("continues from a just-finalized application that has left the filtered queue", () => {
    expect(nextApplicationInQueue(applications, "d", new URLSearchParams(), "me", 1)?.applicationId).toBe("e");
    expect(nextApplicationInQueue(applications, "missing", new URLSearchParams(), "me", 1)?.applicationId).toBe("a");
  });
  it("handles empty queues and validates query parameters", () => {
    expect(nextApplicationInQueue([], "a", new URLSearchParams(), "me", 1)).toBeNull();
    expect(queueControls(new URLSearchParams("status=bad&reviewer=bad&sort=bad"))).toEqual({ search: "", status: "all", reviewer: "all", sortOrder: "oldest" });
    expect(ids(applicationsInQueue(applications, new URLSearchParams("status=all&search=EXAMPLE.COM&sort=newest"), "me", 1))).toEqual(["e", "d", "c", "b", "a"]);
  });
  it("sorts equal and missing submission dates consistently", () => {
    const tied = [application("b", 1), application("a", 1), application("c", 2, { submittedAt: null })];
    expect(ids(applicationsInQueue(tied, new URLSearchParams(), "me", 1))).toEqual(["c", "a", "b"]);
  });

  it("pages the queue ten at a time and clamps invalid page numbers", () => {
    const many = Array.from({ length: 23 }, (_, index) => application(`app-${index}`, index + 1));
    expect(paginateQueue(many, 1)).toHaveLength(APPLICATIONS_QUEUE_PAGE_SIZE);
    expect(paginateQueue(many, 2)).toHaveLength(APPLICATIONS_QUEUE_PAGE_SIZE);
    expect(paginateQueue(many, 3)).toHaveLength(3);
    expect(queuePage(new URLSearchParams(), many.length)).toBe(1);
    expect(queuePage(new URLSearchParams("page=2"), many.length)).toBe(2);
    expect(queuePage(new URLSearchParams("page=99"), many.length)).toBe(3);
    expect(queuePage(new URLSearchParams("page=0"), many.length)).toBe(1);
    expect(queuePageRange(2, many.length)).toEqual({ start: 11, end: 20, totalPages: 3 });
  });
});
