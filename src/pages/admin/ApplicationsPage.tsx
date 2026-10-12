import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { listSubmittedApplicationsRef } from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import {
  dashboardReviewStatusLabel,
  formatApplicationDate,
} from "../../lib/applicationDisplay";
import { ADMIN_ROUTES } from "../../types/routes";

function ApplicationsQueue({ sessionToken }: { sessionToken: string }) {
  const applications = useQuery(listSubmittedApplicationsRef, { sessionToken });

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
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {applications.map((application) => (
        <li key={application.applicationId}>
          <article className="flex h-full flex-col rounded-lg border border-sand bg-white/60 p-5 shadow-sm">
            <header className="space-y-1">
              <h3 className="font-display text-lg text-night">{application.applicantName}</h3>
              <p className="text-sm text-ocean">{application.school}</p>
            </header>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-mist">Submitted</dt>
                <dd>{formatApplicationDate(application.submittedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mist">Status</dt>
                <dd>{dashboardReviewStatusLabel(application.reviewStatus)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mist">Current reviewer</dt>
                <dd>{application.currentReviewerName ?? "—"}</dd>
              </div>
            </dl>
            <div className="mt-auto pt-5">
              <Link
                className="inline-flex w-full items-center justify-center rounded-md border border-ocean bg-ocean px-4 py-2 text-sm font-medium text-light transition hover:bg-ink"
                to={ADMIN_ROUTES.applicationReview(application.applicationId)}
              >
                Review Application
              </Link>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

export function ApplicationsPage() {
  const { sessionToken } = useAdminAuth();

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="font-display text-xl text-night">Applications</h2>
        <p className="text-sm text-mist">
          Submitted applications and their current review state. Opening this page does not record
          review activity.
        </p>
      </header>
      {sessionToken ? (
        <ErrorBoundary
          fallback={
            <div role="alert" className="rounded-lg border border-sand bg-clay/30 p-5">
              <h3 className="font-display text-lg text-night">Unable to load applications</h3>
              <p className="mt-2 text-sm">Refresh the page or try again in a moment.</p>
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
