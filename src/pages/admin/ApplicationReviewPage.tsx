import { useMutation, useQuery } from "../../convex/reactBindings";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApplicationDetail } from "../../components/ApplicationDetail";
import { ApplicationDecisionControls } from "../../components/ApplicationDecisionControls";
import { ApplicationReviewControls } from "../../components/ApplicationReviewControls";
import { ApplicationReviewHistory } from "../../components/ApplicationReviewHistory";
import { NextApplicationLink } from "../../components/NextApplicationLink";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { getApplicationRef, logApplicationReviewActionRef } from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { ADMIN_ROUTES } from "../../types/routes";
import { useNow } from "../../hooks/useNow";

export function ApplicationReviewContent({
  applicationId,
  sessionToken,
  staffAdminId,
  isAdmin,
  applicationsSearch = "",
}: {
  applicationId: string;
  sessionToken: string;
  staffAdminId: string;
  isAdmin: boolean;
  applicationsSearch?: string;
}) {
  const loadedDetail = useQuery(getApplicationRef, { sessionToken, applicationId });
  const now = useNow();
  const detail = loadedDetail ? {
    ...loadedDetail,
    reviewActivity: {
      ...loadedDetail.reviewActivity,
      isStale: loadedDetail.reviewActivity.expiresAt !== undefined
        ? now > loadedDetail.reviewActivity.expiresAt : loadedDetail.reviewActivity.isStale,
    },
  } : loadedDetail;
  const recordView = useMutation(logApplicationReviewActionRef);
  const viewRequest = useRef<{
    applicationId: string;
    promise: Promise<unknown>;
  } | null>(null);
  const [loggingFailed, setLoggingFailed] = useState(false);
  const loadedId = detail?.application._id;

  useEffect(() => {
    if (!loadedId) return;
    let active = true;
    // One in-flight view log per loaded application; reuse only for Strict Mode replays of the same id.
    if (viewRequest.current?.applicationId !== loadedId) {
      viewRequest.current = {
        applicationId: loadedId,
        promise: recordView({ sessionToken, applicationId: loadedId, action: "viewed" }),
      };
      setLoggingFailed(false);
    }
    const promise = viewRequest.current?.promise;
    if (!promise) return;
    void promise.catch(() => {
      if (active) setLoggingFailed(true);
    });
    return () => { active = false; };
  }, [loadedId, sessionToken, recordView]);

  if (detail === undefined) return <LoadingState message="Loading application…" />;
  if (detail === null) {
    return <EmptyState title="Application not found" description="This link does not identify a submitted application." />;
  }

  const activity = detail.reviewActivity;
  const blockedByOther =
    activity.reviewedBy !== null &&
    activity.reviewedBy !== staffAdminId &&
    !activity.isStale &&
    !activity.isFinal &&
    detail.reviewStatus === "under_review";

  return (
    <>
      {loggingFailed && (
        <p role="alert" className="rounded-lg border border-sand bg-clay/30 p-3 text-sm">
          We couldn’t record this application view. Please reopen the application to try again.
        </p>
      )}
      <ApplicationDetail detail={detail}>
        <ApplicationReviewControls
          detail={detail}
          sessionToken={sessionToken}
          staffAdminId={staffAdminId}
        />
        <ApplicationDecisionControls
          detail={detail}
          sessionToken={sessionToken}
          blockedByOther={blockedByOther}
        />
        <ErrorBoundary fallback={<p className="text-sm text-ocean">Next application is unavailable. Return to Applications to continue.</p>}>
          <NextApplicationLink applicationId={applicationId} sessionToken={sessionToken} staffAdminId={staffAdminId} applicationsSearch={applicationsSearch} />
        </ErrorBoundary>
      </ApplicationDetail>
      {isAdmin && (
        <ApplicationReviewHistory applicationId={detail.application._id} sessionToken={sessionToken} />
      )}
    </>
  );
}

export function ApplicationReviewPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const location = useLocation();
  const { sessionToken, staff } = useAdminAuth();
  const applicationsSearch = typeof location.state?.applicationsSearch === "string"
    ? location.state.applicationsSearch : "";

  return (
    <div className="space-y-5">
      <Link className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-ocean underline underline-offset-4" to={`${ADMIN_ROUTES.applications}${applicationsSearch ? `?${applicationsSearch}` : ""}`}>Back to Applications</Link>
      {sessionToken && applicationId && staff ? (
        <ErrorBoundary
          key={`${location.key}:${applicationId}:${staff.adminId}`}
          fallback={
            <div role="alert" className="rounded-lg border border-sand bg-clay/30 p-5">
              <h2 className="font-display text-lg text-night">Unable to load application</h2>
              <p className="mt-2 text-sm">Return to Applications and try again.</p>
            </div>
          }
        >
          <ApplicationReviewContent
            applicationId={applicationId}
            sessionToken={sessionToken}
            staffAdminId={staff.adminId}
            isAdmin={staff.role === "admin"}
            applicationsSearch={applicationsSearch}
          />
        </ErrorBoundary>
      ) : <LoadingState message="Verifying organizer session…" />}
    </div>
  );
}
