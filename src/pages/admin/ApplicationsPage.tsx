import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import {
  listSubmittedApplicationsRef,
  type SubmittedApplication,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { ADMIN_ROUTES } from "../../types/routes";

const statusLabels: Record<Exclude<SubmittedApplication["status"], null>, string> = {
  under_review: "Under Review",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
};

function formatSubmissionTime(timestamp?: number) {
  if (timestamp === undefined) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function SubmittedApplicationsList() {
  const { sessionToken } = useAdminAuth();
  const applications = useQuery(
    listSubmittedApplicationsRef,
    sessionToken ? { sessionToken } : "skip",
  );

  if (!sessionToken || applications === undefined) {
    return <LoadingState message="Loading submitted applications…" />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl text-night">Applications</h2>
          <p className="text-sm text-mist">Submitted applications ready for review</p>
        </div>
        <p className="text-sm text-mist">
          {applications.length} {applications.length === 1 ? "application" : "applications"}
        </p>
      </div>

      {applications.length === 0 ? (
        <EmptyState
          title="No submitted applications"
          description="Submitted applications will appear here."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {applications.map((application) => {
            const fullName = [application.firstName, application.lastName]
              .filter((part) => part?.trim())
              .join(" ") || application.applicantName || "";
            const school =
              application.otherSchool?.trim() || application.school?.trim() || "Not provided";
            const status = application.status
              ? statusLabels[application.status]
              : "Unreviewed";

            return (
              <li
                key={application._id}
                className="flex flex-col justify-between gap-5 rounded-xl border border-sand bg-white/70 p-5 shadow-sm"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg text-night">
                        {fullName || "Unnamed applicant"}
                      </h3>
                      <p className="mt-1 text-sm text-mist">{school}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-clay px-3 py-1 text-xs font-medium text-ink">
                      {status}
                    </span>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-mist">Submitted</dt>
                      <dd className="text-right text-ink">
                        {formatSubmissionTime(application.submittedAt)}
                      </dd>
                    </div>
                    {application.reviewerName ? (
                      <div className="flex justify-between gap-4">
                        <dt className="text-mist">Current reviewer</dt>
                        <dd className="text-right text-ink">{application.reviewerName}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
                <Link
                  to={ADMIN_ROUTES.applicationReview(application._id)}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-ocean px-4 py-2 text-sm font-medium text-light transition-colors hover:bg-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean"
                >
                  Review Application
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ApplicationsPage() {
  return (
    <ErrorBoundary>
      <SubmittedApplicationsList />
    </ErrorBoundary>
  );
}
