import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApplicationsList } from "../../components/ApplicationsList";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { listSubmittedApplicationsRef } from "../../convex/adminApi";
import { useQuery } from "../../convex/reactBindings";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { dashboardReviewStatusLabels } from "../../lib/applicationDisplay";
import { reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";

const controlClass = "mt-1.5 min-h-11 w-full rounded-md border border-ocean/70 bg-white px-3 py-2 text-sm text-night placeholder:text-ocean";
const reviewStatusFilters = {
  needs_review: "Needs review",
  all: "All applications",
  ...dashboardReviewStatusLabels,
};
type ReviewStatusFilter = keyof typeof reviewStatusFilters;

function ApplicationsQueue({ sessionToken }: { sessionToken: string }) {
  const applications = useQuery(listSubmittedApplicationsRef, { sessionToken });
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const requestedStatus = searchParams.get("status") ?? "needs_review";
  const status = Object.hasOwn(reviewStatusFilters, requestedStatus)
    ? requestedStatus as ReviewStatusFilter
    : "needs_review";
  const sortOrder = searchParams.get("sort") === "newest" ? "newest" : "oldest";
  const searchText = search.trim().toLowerCase();

  function updateControl(key: "search" | "status" | "sort", value: string) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (
        value === "" ||
        (key === "status" && value === "needs_review") ||
        (key === "sort" && value === "oldest")
      ) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  }

  const needsReview = (applicationStatus: string | null) =>
    applicationStatus === null || applicationStatus === "unreviewed" || applicationStatus === "under_review";
  const visibleApplications = (applications ?? [])
    .filter((application) => {
      const matchesSearch =
        searchText === "" ||
        [application.applicantName, application.email, application.school].some(
          (value) => (value ?? "").toLowerCase().includes(searchText),
        );
      const matchesStatus =
        status === "all" ||
        (status === "needs_review"
          ? needsReview(application.reviewStatus)
          : (application.reviewStatus ?? "unreviewed") === status);
      return matchesSearch && matchesStatus;
    })
    .sort((left, right) => {
      const difference = (left.submittedAt ?? 0) - (right.submittedAt ?? 0);
      return sortOrder === "oldest" ? difference : -difference;
    });

  if (applications === undefined) {
    return (
      <div role="status"><LoadingState message="Loading applications…" /></div>
    );
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        title="No submitted applications"
        description="New submissions will appear here automatically."
      />
    );
  }

  const hasCustomControls = search !== "" || status !== "needs_review" || sortOrder !== "oldest";
  const queueIsClear = status === "needs_review" && searchText === "" && visibleApplications.length === 0;
  const needsReviewCount = applications.filter((application) => needsReview(application.reviewStatus)).length;

  return (
    <div className="space-y-5">
      <p className="text-sm text-ocean">
        <span className="font-semibold text-night">{needsReviewCount} need review</span>
        <span aria-hidden="true"> · </span>
        <span>{applications.length} total applications</span>
      </p>

      <div className="grid gap-4 rounded-lg border border-sand bg-white p-4 min-[360px]:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
        <label className="block text-sm font-medium text-night min-[360px]:col-span-2 lg:col-span-1">
          Search applications
          <input
            type="search"
            value={search}
            onChange={(event) => updateControl("search", event.target.value)}
            placeholder="Name, email, or school"
            className={controlClass}
          />
        </label>
        <label className="block text-sm font-medium text-night">
          Review status
          <select
            value={status}
            onChange={(event) => updateControl("status", event.target.value)}
            className={controlClass}
          >
            {Object.entries(reviewStatusFilters).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-night">
          Submission time
          <select
            value={sortOrder}
            onChange={(event) => updateControl("sort", event.target.value)}
            className={controlClass}
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
      </div>

      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-ocean">
          Showing {visibleApplications.length} of {applications.length} applications
          <span className="sr-only">. Filter: {reviewStatusFilters[status]}</span>
        </p>
        {hasCustomControls && (
          <button
            type="button"
            className={reviewSecondaryButtonClass}
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Reset controls
          </button>
        )}
      </div>

      {visibleApplications.length === 0 ? (
        <div className="rounded-lg border border-sand bg-white p-6 text-center sm:p-10">
          <h3 className="text-lg font-semibold text-night">
            {queueIsClear ? "No applications need review" : "No matching applications"}
          </h3>
          <p className="mt-2 text-sm text-ocean">
            {queueIsClear
              ? "You're up to date. Past decisions are available under All applications."
              : "Try another search or change the review status filter."}
          </p>
          {status !== "all" && (
            <button
              type="button"
              className={`mt-5 ${reviewSecondaryButtonClass}`}
              onClick={() => updateControl("status", "all")}
            >
              {searchText ? "Search all applications" : "View all applications"}
            </button>
          )}
        </div>
      ) : (
        <ApplicationsList applications={visibleApplications} applicationsSearch={searchParams.toString()} />
      )}
    </div>
  );
}

export function ApplicationsPage() {
  const { sessionToken } = useAdminAuth();
  const [retry, setRetry] = useState(0);

  return (
    <section aria-labelledby="applications-heading" className="space-y-5">
      <header className="space-y-2">
        <h2 id="applications-heading" className="text-2xl font-semibold tracking-tight text-night">Applications</h2>
        <p className="text-sm text-ocean">Review submitted applications and track participant decisions.</p>
      </header>
      {sessionToken ? (
        <ErrorBoundary
          key={`${sessionToken}:${retry}`}
          fallback={
            <div role="alert" className="rounded-lg border border-red-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-night">Unable to load applications</h3>
              <p className="mt-2 text-sm text-ocean">Check your connection and try again.</p>
              <button
                type="button"
                className={`mt-4 ${reviewSecondaryButtonClass}`}
                onClick={() => setRetry((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          }
        >
          <ApplicationsQueue sessionToken={sessionToken} />
        </ErrorBoundary>
      ) : (
        <div role="status"><LoadingState message="Verifying organizer session…" /></div>
      )}
    </section>
  );
}
