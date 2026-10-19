import type { SubmittedApplicationSummary } from "../convex/adminApi";
import { availableToReview, queueReviewStatus } from "../../shared/admin/reviewQueue";

export const reviewStatusFilterOptions = [
  ["all", "All applications"],
  ["needs_review", "Need review"],
  ["under_review", "In review"],
  ["accepted", "Accepted"],
  ["waitlisted", "Waitlisted"],
  ["rejected", "Rejected"],
] as const;

export const reviewStatusFilters = Object.fromEntries(reviewStatusFilterOptions) as Record<
  (typeof reviewStatusFilterOptions)[number][0],
  string
>;

export const reviewerFilters = { all: "All reviewers", mine: "My active reviews", available: "Available to review" };
export const APPLICATIONS_QUEUE_PAGE_SIZE = 10;

export const queueDefaults = { search: "", status: "all", sort: "oldest", reviewer: "all", page: 1 } as const;

export function queuePage(params: URLSearchParams, totalMatching: number): number {
  const raw = params.get("page");
  const parsed = raw ? Number.parseInt(raw, 10) : queueDefaults.page;
  if (!Number.isFinite(parsed) || parsed < 1) return queueDefaults.page;
  const totalPages = Math.max(1, Math.ceil(totalMatching / APPLICATIONS_QUEUE_PAGE_SIZE));
  return Math.min(parsed, totalPages);
}

export function paginateQueue<T>(items: readonly T[], page: number): T[] {
  const start = (page - 1) * APPLICATIONS_QUEUE_PAGE_SIZE;
  return items.slice(start, start + APPLICATIONS_QUEUE_PAGE_SIZE);
}

export function queuePageRange(page: number, totalMatching: number) {
  if (totalMatching === 0) {
    return { start: 0, end: 0, totalPages: 1 };
  }
  const totalPages = Math.max(1, Math.ceil(totalMatching / APPLICATIONS_QUEUE_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * APPLICATIONS_QUEUE_PAGE_SIZE + 1;
  const end = Math.min(safePage * APPLICATIONS_QUEUE_PAGE_SIZE, totalMatching);
  return { start, end, totalPages };
}

function matchesReviewStatusFilter(
  application: SubmittedApplicationSummary,
  status: keyof typeof reviewStatusFilters,
  now: number,
) {
  if (status === "all") return true;
  const current = queueReviewStatus(application, now);
  if (status === "needs_review") return current === "unreviewed" || current === "stale";
  return current === status;
}

export function queueControls(params: URLSearchParams) {
  const requestedStatus = params.get("status") ?? queueDefaults.status;
  const requestedReviewer = params.get("reviewer") ?? queueDefaults.reviewer;
  return {
    search: params.get("search") ?? queueDefaults.search,
    status: Object.hasOwn(reviewStatusFilters, requestedStatus) ? requestedStatus as keyof typeof reviewStatusFilters : queueDefaults.status,
    reviewer: Object.hasOwn(reviewerFilters, requestedReviewer) ? requestedReviewer as keyof typeof reviewerFilters : queueDefaults.reviewer,
    sortOrder: params.get("sort") === "newest" ? "newest" as const : queueDefaults.sort,
  };
}

function compareApplications(left: SubmittedApplicationSummary, right: SubmittedApplicationSummary, sort: "oldest" | "newest") {
  const order = (left.submittedAt ?? 0) - (right.submittedAt ?? 0) || left.applicationId.localeCompare(right.applicationId);
  return sort === "oldest" ? order : -order;
}

export function applicationsInQueue(applications: SubmittedApplicationSummary[], params: URLSearchParams, staffAdminId: string, now: number) {
  const { search, status, reviewer, sortOrder } = queueControls(params);
  const term = search.trim().toLowerCase();
  return applications.filter((application) => {
    const matchesSearch = !term || [application.applicantName, application.email, application.school].some((value) => (value ?? "").toLowerCase().includes(term));
    const matchesStatus = matchesReviewStatusFilter(application, status, now);
    const matchesReviewer = reviewer === "all" || (reviewer === "available"
      ? availableToReview(application, staffAdminId, now)
      : queueReviewStatus(application, now) === "under_review" && application.reviewClaim?.reviewedBy === staffAdminId);
    return matchesSearch && matchesStatus && matchesReviewer;
  }).sort((left, right) => compareApplications(left, right, sortOrder));
}

/** Continue after the current applicant, wrapping to the beginning when needed. */
export function nextApplicationInQueue(applications: SubmittedApplicationSummary[], currentId: string, params: URLSearchParams, staffAdminId: string, now: number) {
  const candidates = applicationsInQueue(applications, params, staffAdminId, now)
    .filter((application) => application.applicationId !== currentId && availableToReview(application, staffAdminId, now));
  const current = applications.find((application) => application.applicationId === currentId);
  const { sortOrder } = queueControls(params);
  return (current && candidates.find((application) => compareApplications(application, current, sortOrder) > 0)) || candidates[0] || null;
}
