import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { ApplicationsList } from "../../components/ApplicationsList";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { listSubmittedApplicationsRef } from "../../convex/adminApi";
import { useQuery } from "../../convex/reactBindings";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { applicationsInQueue, queueControls, queueDefaults, reviewStatusFilters, reviewerFilters } from "../../lib/applicationQueue";
import { reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";
import { needsApplicationReview } from "../../../shared/admin/reviewQueue";
import { useNow } from "../../hooks/useNow";

const controlClass = "admin-field__control";

function ApplicationsQueue({ sessionToken }: { sessionToken: string }) {
  const now = useNow();
  const { staff } = useAdminAuth();
  const applications = useQuery(listSubmittedApplicationsRef, { sessionToken });
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, sortOrder, reviewer } = queueControls(searchParams);
  const initialSearch = searchParams.get("search") ?? queueDefaults.search;
  const latestSearchRef = useRef(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const searchText = searchInput.trim().toLowerCase();
  const skipUrlSearchSync = useRef(false);

  useEffect(() => {
    if (skipUrlSearchSync.current) {
      skipUrlSearchSync.current = false;
      return;
    }
    const urlSearch = searchParams.get("search") ?? queueDefaults.search;
    latestSearchRef.current = urlSearch;
    setSearchInput(urlSearch);
  }, [searchParams]);

  function updateSearch(value: string) {
    latestSearchRef.current = value;
    skipUrlSearchSync.current = true;
    flushSync(() => {
      setSearchInput(value);
      setSearchParams((previous) => {
        const term = latestSearchRef.current;
        const next = new URLSearchParams(previous);
        if (term === "" || term === queueDefaults.search) {
          next.delete("search");
        } else {
          next.set("search", term);
        }
        return next;
      }, { replace: true });
    });
  }

  function updateControl(key: keyof typeof queueDefaults, value: string) {
    if (key === "search") {
      updateSearch(value);
      return;
    }
    flushSync(() => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        if (value === "" || value === queueDefaults[key]) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        return next;
      }, { replace: true });
    });
  }

  const queueParams = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    if (searchInput === "" || searchInput === queueDefaults.search) {
      next.delete("search");
    } else {
      next.set("search", searchInput);
    }
    return next;
  }, [searchParams, searchInput]);

  const visibleApplications = applicationsInQueue(applications ?? [], queueParams, staff?.adminId ?? "", now);

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

  const hasCustomControls =
    searchInput !== queueDefaults.search || status !== queueDefaults.status ||
    sortOrder !== queueDefaults.sort || reviewer !== queueDefaults.reviewer;
  const queueIsClear =
    status === queueDefaults.status && searchText === "" &&
    reviewer === queueDefaults.reviewer && visibleApplications.length === 0;
  const needsReviewCount = applications.filter(needsApplicationReview).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <p className="admin-stat">
          <strong>{needsReviewCount}</strong> need review
        </p>
        <p className="admin-stat">
          <strong>{applications.length}</strong> total applications
        </p>
      </div>

      <div className="admin-card admin-card__body grid gap-4 min-[360px]:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_11rem_10rem_12rem]">
        <label className="admin-field min-[360px]:col-span-2 xl:col-span-1">
          Search applications
          <input
            type="search"
            value={searchInput}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Name, email, or school"
            className={controlClass}
          />
        </label>
        <label className="admin-field">
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
        <label className="admin-field">
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
        <label className="admin-field">
          Review assignment
          <select value={reviewer} onChange={(event) => updateControl("reviewer", event.target.value)} className={controlClass}>
            {Object.entries(reviewerFilters).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-ocean">
          Showing {visibleApplications.length} of {applications.length} applications
          <span className="sr-only">. Filter: {reviewStatusFilters[status]}. Assignment: {reviewerFilters[reviewer]}</span>
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
        <div className="admin-card admin-card__body p-6 text-center sm:p-10">
          <h3 className="text-lg font-semibold text-night">
            {queueIsClear ? "No applications need review" : "No matching applications"}
          </h3>
          <p className="mt-2 text-sm text-ocean">
            {queueIsClear
              ? "You're up to date. Past decisions are available under All applications."
              : "Try another search or change the review status or assignment filter."}
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
        <ApplicationsList applications={visibleApplications} applicationsSearch={searchParams.toString()} now={now} staffAdminId={staff?.adminId} />
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
            <div role="alert" className="admin-card admin-card__body admin-callout--alert">
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
