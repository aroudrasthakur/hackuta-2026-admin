import { useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import { ApplicationDetail } from "../../components/ApplicationDetail";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { getApplicationRef } from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { ADMIN_ROUTES } from "../../types/routes";

function ApplicationReviewContent({ applicationId, sessionToken }: { applicationId: string; sessionToken: string }) {
  const detail = useQuery(getApplicationRef, { sessionToken, applicationId });
  if (detail === undefined) return <LoadingState message="Loading application…" />;
  if (detail === null) {
    return <EmptyState title="Application not found" description="This link does not identify a submitted application." />;
  }
  return <ApplicationDetail detail={detail} />;
}

export function ApplicationReviewPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { sessionToken, isAuthenticated, isLoading } = useAdminAuth();

  return (
    <div className="space-y-5">
      <Link className="inline-block text-sm underline" to={ADMIN_ROUTES.applications}>Back to Applications</Link>
      {!isLoading && isAuthenticated && sessionToken && applicationId ? (
        <ApplicationReviewContent applicationId={applicationId} sessionToken={sessionToken} />
      ) : <LoadingState message="Verifying organizer session…" />}
    </div>
  );
}
