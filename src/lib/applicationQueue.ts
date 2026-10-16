import type { SubmittedApplicationSummary } from "../convex/adminApi";
import { availableToReview, needsApplicationReview, queueReviewStatus } from "../../shared/admin/reviewQueue";
import { dashboardReviewStatusLabels } from "./applicationDisplay";

export const reviewStatusFilters = { needs_review: "Needs review", all: "All applications", ...dashboardReviewStatusLabels };
export const reviewerFilters = { all: "All reviewers", mine: "My active reviews", available: "Available to review" };
export const queueDefaults = { search: "", status: "needs_review", sort: "oldest", reviewer: "all" } as const;

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
    const matchesStatus = status === "all" || (status === "needs_review" ? needsApplicationReview(application) : queueReviewStatus(application, now) === status);
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
