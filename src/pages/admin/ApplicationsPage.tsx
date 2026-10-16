import { useQuery } from "../../convex/reactBindings";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import {
  listSubmittedApplicationsRef,
  type SubmittedApplicationSummary,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import {
  dashboardReviewStatusLabel,
  formatApplicationDate,
} from "../../lib/applicationDisplay";
import { ADMIN_ROUTES } from "../../types/routes";

const decisionPresentations = {
  accepted: {
    label: "Accepted",
    className: "border-green-200 bg-green-50 text-green-800",
  },
  rejected: {
    label: "Rejected",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  waitlisted: {
    label: "Waitlisted",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
} as const;

type FinalDecisionStatus = keyof typeof decisionPresentations;

const DECISION_BADGE_BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-4 py-2 text-sm font-semibold";

function decisionPresentationForStatus(
  status: SubmittedApplicationSummary["reviewStatus"],
) {
  if (status === null || status === undefined || !(status in decisionPresentations)) {
    return null;
  }
  return decisionPresentations[status as FinalDecisionStatus];
}

function ApplicationDecisionBadge({
  status,
}: {
  status: SubmittedApplicationSummary["reviewStatus"];
}) {
  const decision = decisionPresentationForStatus(status);

  if (!decision) return null;

  return (
    <span
      aria-label={`Decision: ${decision.label}`}
      className={`${DECISION_BADGE_BASE_CLASS} ${decision.className}`}
    >
      {decision.label}
    </span>
  );
}

function ApplicationsQueue({ sessionToken }: { sessionToken: string }) {
  const applications = useQuery(listSubmittedApplicationsRef, { sessionToken });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");

  const searchText = search.trim().toLowerCase();

  const visibleApplications = (applications ?? [])
    .filter((application) => {
      const matchesSearch =
        searchText === "" ||
        [
          application.applicantName,
          application.email,
          application.school,
        ].some((value) =>
          (value ?? "").toLowerCase().includes(searchText),
        );

      const matchesStatus =
        status === "all" ||
        (application.reviewStatus ?? "unreviewed") === status;

      return matchesSearch && matchesStatus;
    })
    .sort((left, right) => {
      const difference =
        (left.submittedAt ?? 0) - (right.submittedAt ?? 0);

      return sortOrder === "oldest" ? difference : -difference;
    });

  if (applications === undefined) {
    return <LoadingState message="Loading applications…" />;
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        title="No submitted applications"
        description="New submissions will appear here automatically."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm font-medium text-night">
          Search applications
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email, or school"
            className="mt-1 w-full rounded-md border border-sand bg-white px-3 py-2 text-night"
          />
        </label>

        <label className="block text-sm font-medium text-night">
          Review status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="mt-1 w-full rounded-md border border-sand bg-white px-3 py-2 text-night"
          >
            <option value="all">All</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="under_review">Under Review</option>
            <option value="accepted">Accepted</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-night">
          Submission time
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            className="mt-1 w-full rounded-md border border-sand bg-white px-3 py-2 text-night"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-mist">
          Showing {visibleApplications.length} of {applications.length} applications
        </p>

        {(search !== "" || status !== "all" || sortOrder !== "newest") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatus("all");
              setSortOrder("newest");
            }}
            className="rounded-md border border-ocean px-3 py-2 text-sm font-medium text-ocean"
          >
            Reset controls
          </button>
        )}
      </div>

      {visibleApplications.length === 0 ? (
        <EmptyState
          title="No matching applications"
          description="Try another search or change the status filter."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleApplications.map((application: SubmittedApplicationSummary) => (
            <li key={application.applicationId}>
              <article className="flex h-full flex-col rounded-lg border border-sand bg-white/60 p-5 shadow-sm">
                <header className="space-y-1">
                  <h3 className="font-display text-lg text-night">
                    {application.applicantName}
                  </h3>
                  <p className="text-sm text-ocean">{application.school}</p>
                </header>

                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-mist">Submitted</dt>
                    <dd>{formatApplicationDate(application.submittedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-mist">Status</dt>
                    <dd>
                      {dashboardReviewStatusLabel(application.reviewStatus)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-mist">Current reviewer</dt>
                    <dd>{application.currentReviewerName ?? "—"}</dd>
                  </div>
                </dl>

                <div className="mt-auto pt-5">
                  <div className="flex min-w-0 flex-wrap items-stretch gap-2">
                    <Link
                      className="inline-flex min-w-[8.5rem] flex-1 items-center justify-center rounded-md border border-ocean bg-ocean px-4 py-2 text-sm font-medium text-light transition hover:bg-ink"
                      to={ADMIN_ROUTES.applicationReview(application.applicationId)}
                    >
                      Review Application
                    </Link>
                    <ApplicationDecisionBadge status={application.reviewStatus} />
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ApplicationsPage() {
  const { sessionToken } = useAdminAuth();

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="font-display text-xl text-night">Applications</h2>
        <p className="text-sm text-mist">
          Submitted applications and their current review state. Opening this page
          does not record review activity.
        </p>
      </header>

      {sessionToken ? (
        <ErrorBoundary
          fallback={
            <div
              role="alert"
              className="rounded-lg border border-sand bg-clay/30 p-5"
            >
              <h3 className="font-display text-lg text-night">
                Unable to load applications
              </h3>
              <p className="mt-2 text-sm">
                Refresh the page or try again in a moment.
              </p>
            </div>
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
