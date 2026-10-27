import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { AdminListboxSelect } from "../../components/AdminListboxSelect";
import { ApplicationsList } from "../../components/ApplicationsList";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { QueryErrorState } from "../../components/states/QueryErrorState";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { listSubmittedApplicationsRef } from "../../convex/adminApi";
import { useQuery } from "../../convex/reactBindings";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { ApplicationsQueuePagination } from "../../components/ApplicationsQueuePagination";
import {
  applicationsInQueue,
  paginateQueue,
  queueControls,
  queueDefaults,
  queuePage,
  queuePageRange,
  reviewStatusFilterOptions,
  reviewStatusFilters,
  reviewerFilters,
} from "../../lib/applicationQueue";
import { reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";
import { needsApplicationReview } from "../../../shared/admin/reviewQueue";
import { useNow } from "../../hooks/useNow";

const controlClass = "admin-field__control";
const sortOptions = [
  { value: "oldest", label: "Oldest first" },
  { value: "newest", label: "Newest first" },
] as const;
const reviewerOptions = Object.entries(reviewerFilters).map(([value, label]) => ({ value, label }));

function ApplicationsQueue({ sessionToken }: { sessionToken: string }) {
  const now = useNow();
  const { staff } = useAdminAuth();
  const applications = useQuery(listSubmittedApplicationsRef, { sessionToken });
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, sortOrder, reviewer } = queueControls(searchParams);
  const initialSearch = searchParams.get("search") ?? queueDefaults.search;
  const [searchInput, setSearchInput] = useState(initialSearch);
  const searchText = searchInput.trim().toLowerCase();
  const skipUrlSearchSync = useRef(false);
  /**
   * The router commits URL changes in a transition, so `searchParams` can lag
   * behind a write made moments earlier. Rapid edits must build on the last
   * written params or they silently drop the previous filter change.
   */
  const writtenParamsRef = useRef({ routed: searchParams.toString(), params: new URLSearchParams(searchParams) });

  const writeParams = useCallback((mutate: (next: URLSearchParams) => void) => {
    const routed = searchParams.toString();
    const written = writtenParamsRef.current;
    const next = new URLSearchParams(routed === written.routed ? written.params : searchParams);
    mutate(next);
    writtenParamsRef.current = { routed, params: next };
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const routed = searchParams.toString();
    if (routed === writtenParamsRef.current.params.toString()) {
      writtenParamsRef.current = { routed, params: new URLSearchParams(searchParams) };
    }
  }, [searchParams]);

  useEffect(() => {
    if (skipUrlSearchSync.current) {
      skipUrlSearchSync.current = false;
      return;
    }
    setSearchInput(searchParams.get("search") ?? queueDefaults.search);
  }, [searchParams]);

  function updateSearch(value: string) {
    skipUrlSearchSync.current = true;
    flushSync(() => {
      setSearchInput(value);
      writeParams((next) => {
        if (value === "" || value === queueDefaults.search) {
          next.delete("search");
        } else {
          next.set("search", value);
        }
        next.delete("page");
      });
    });
  }

  function updateControl(key: keyof typeof queueDefaults, value: string) {
    if (key === "search") {
      updateSearch(value);
      return;
    }
    flushSync(() => {
      writeParams((next) => {
        if (value === "" || value === queueDefaults[key]) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        next.delete("page");
      });
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
  const filteredCount = visibleApplications.length;
  const page = queuePage(searchParams, filteredCount);
  const { start: rangeStart, end: rangeEnd, totalPages } = queuePageRange(page, filteredCount);
  const pagedApplications = paginateQueue(visibleApplications, page);

  useEffect(() => {
    const requestedRaw = searchParams.get("page");
    if (!requestedRaw) return;
    const requested = Number.parseInt(requestedRaw, 10);
    if (!Number.isFinite(requested) || requested < 1) return;
    if (requested === page) return;
    writeParams((next) => {
      if (page <= 1) {
        next.delete("page");
      } else {
        next.set("page", String(page));
      }
    });
  }, [page, searchParams, writeParams]);

  function goToPage(nextPage: number) {
    writeParams((next) => {
      if (nextPage <= 1) {
        next.delete("page");
      } else {
        next.set("page", String(nextPage));
      }
    });
  }

  if (applications === undefined) {
    return (
      <LoadingState layout="rows" message="Loading applications…" />
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

  const queueNeedsReviewEmpty =
    status === "needs_review" && searchText === "" &&
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
        <AdminListboxSelect
          id="applications-review-status"
          label="Review status"
          value={status}
          options={reviewStatusFilterOptions.map(([value, optionLabel]) => ({ value, label: optionLabel }))}
          onChange={(value) => updateControl("status", value)}
          controlClassName={controlClass}
        />
        <AdminListboxSelect
          id="applications-sort-order"
          label="Submission time"
          value={sortOrder}
          options={sortOptions}
          onChange={(value) => updateControl("sort", value)}
          controlClassName={controlClass}
        />
        <AdminListboxSelect
          id="applications-reviewer-filter"
          label="Review assignment"
          value={reviewer}
          options={reviewerOptions}
          onChange={(value) => updateControl("reviewer", value)}
          controlClassName={controlClass}
        />
      </div>

      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-ocean">
          {filteredCount === 0
            ? `Showing 0 of ${applications.length} applications`
            : filteredCount === applications.length
              ? `Showing ${rangeStart}–${rangeEnd} of ${applications.length} applications`
              : `Showing ${rangeStart}–${rangeEnd} of ${filteredCount} matching applications (${applications.length} total)`}
          <span className="sr-only">. Filter: {reviewStatusFilters[status]}. Assignment: {reviewerFilters[reviewer]}. Page {page} of {totalPages}.</span>
        </p>
        <ApplicationsQueuePagination page={page} totalPages={totalPages} onPageChange={goToPage} />
      </div>

      {visibleApplications.length === 0 ? (
        <div className="admin-card admin-card__body p-6 text-center sm:p-10">
          <h3 className="text-lg font-semibold text-night">
            {queueNeedsReviewEmpty ? "No applications need review" : "No matching applications"}
          </h3>
          <p className="mt-2 text-sm text-ocean">
            {queueNeedsReviewEmpty
              ? "You're up to date. Switch to All applications to see completed decisions."
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
        <ApplicationsList applications={pagedApplications} applicationsSearch={searchParams.toString()} now={now} staffAdminId={staff?.adminId} />
      )}
    </div>
  );
}

export function ApplicationsPage() {
  const { sessionToken } = useAdminAuth();
  const [retry, setRetry] = useState(0);

  return (
    <section aria-labelledby="applications-heading" className="space-y-5">
      <AdminPageHeader id="applications-heading" title="Applications" eyebrow="The Oracle · Application review" description="Review submitted applications and track participant decisions." />
      {sessionToken ? (
        <ErrorBoundary
          key={`${sessionToken}:${retry}`}
          fallback={
            <QueryErrorState title="Unable to load applications" onRetry={() => setRetry((value) => value + 1)} />
          }
        >
          <ApplicationsQueue sessionToken={sessionToken} />
        </ErrorBoundary>
      ) : (
        <LoadingState message="Verifying organizer session…" />
      )}
    </section>
  );
}
