import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApplicationDetail } from "../../components/ApplicationDetail";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { getApplicationRef, logApplicationReviewActionRef } from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { ADMIN_ROUTES } from "../../types/routes";

function ApplicationReviewContent({ applicationId, sessionToken }: { applicationId: string; sessionToken: string }) {
  const detail = useQuery(getApplicationRef, { sessionToken, applicationId });
  const recordView = useMutation(logApplicationReviewActionRef);
  const viewRequest = useRef<Promise<unknown> | null>(null);
  const [loggingFailed, setLoggingFailed] = useState(false);
  const loadedId = detail?.application._id;

  useEffect(() => {
    if (!loadedId) return;
    let active = true;
    // Share one request across Strict Mode effect replays; a new visit gets a fresh ref.
    viewRequest.current ??= recordView({ sessionToken, applicationId: loadedId, action: "viewed" });
    void viewRequest.current.catch(() => {
      if (active) setLoggingFailed(true);
    });
    return () => { active = false; };
  }, [loadedId, sessionToken, recordView]);

  if (detail === undefined) return <LoadingState message="Loading application…" />;
  if (detail === null) {
    return <EmptyState title="Application not found" description="This link does not identify a submitted application." />;
  }
  return (
    <>
      {loggingFailed && (
        <p role="alert" className="rounded-lg border border-sand bg-clay/30 p-3 text-sm">
          We couldn’t record this application view. Please reopen the application to try again.
        </p>
      )}
      <ApplicationDetail detail={detail} />
    </>
  );
}

export function ApplicationReviewPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const location = useLocation();
  const { sessionToken, staff, isAuthenticated, isLoading } = useAdminAuth();

  return (
    <div className="space-y-5">
      <Link className="inline-block text-sm underline" to={ADMIN_ROUTES.applications}>Back to Applications</Link>
      {!isLoading && isAuthenticated && sessionToken && applicationId ? (
        <ErrorBoundary
          key={`${location.key}:${applicationId}:${staff?.adminId}`}
          fallback={
            <div role="alert" className="rounded-lg border border-sand bg-clay/30 p-5">
              <h2 className="font-display text-lg text-night">Unable to load application</h2>
              <p className="mt-2 text-sm">Return to Applications and try again.</p>
            </div>
          }
        >
          <ApplicationReviewContent applicationId={applicationId} sessionToken={sessionToken} />
        </ErrorBoundary>
      ) : <LoadingState message="Verifying organizer session…" />}
    </div>
  );
}
