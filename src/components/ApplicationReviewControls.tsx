import { useMutation } from "convex/react";
import { useState } from "react";
import type { GenericId } from "convex/values";
import { logApplicationReviewActionRef, type ApplicationDetail } from "../convex/adminApi";

type ApplicationReviewControlsProps = {
  detail: ApplicationDetail;
  sessionToken: string;
  staffAdminId: string;
};

export function ApplicationReviewControls({
  detail,
  sessionToken,
  staffAdminId,
}: ApplicationReviewControlsProps) {
  const startReview = useMutation(logApplicationReviewActionRef);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const activity = detail.reviewActivity;
  const applicationId = detail.application._id as GenericId<"applications">;
  const ownsActiveReview =
    activity.reviewedBy === staffAdminId &&
    !activity.isStale &&
    !activity.isFinal &&
    detail.reviewStatus === "under_review";
  const blockedByOther =
    activity.reviewedBy !== null &&
    activity.reviewedBy !== staffAdminId &&
    !activity.isStale &&
    !activity.isFinal &&
    detail.reviewStatus === "under_review";
  const canStart =
    !activity.isFinal &&
    (activity.reviewedBy === null || activity.isStale || ownsActiveReview);

  async function handleStartReview() {
    setError(null);
    setPending(true);
    try {
      await startReview({ sessionToken, applicationId, action: "started_review" });
      setConfirmed(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start review.");
    } finally {
      setPending(false);
    }
  }

  if (activity.isFinal) {
    return (
      <p className="rounded-lg border border-sand bg-white/60 p-4 text-sm text-mist">
        This application has a final decision and cannot be returned to active review.
      </p>
    );
  }

  return (
    <section
      aria-label="Review claim"
      className="rounded-lg border border-sand bg-white/60 p-4 space-y-3"
    >
      <div className="space-y-1">
        <h3 className="font-display text-lg text-night">Active review</h3>
        <p className="text-sm text-mist">
          Opening this page records a view only. Start review when you are ready to claim this
          application.
        </p>
      </div>
      {activity.currentReviewerName && !activity.isStale && (
        <p className="text-sm">
          Current reviewer:{" "}
          <span className="font-medium text-night">{activity.currentReviewerName}</span>
        </p>
      )}
      {activity.isStale && activity.currentReviewerName && (
        <p className="text-sm text-ocean">
          The previous review session for {activity.currentReviewerName} is stale and may be
          reclaimed.
        </p>
      )}
      {blockedByOther && (
        <p role="status" className="text-sm text-ocean">
          {activity.currentReviewerName} is currently reviewing this application.
        </p>
      )}
      {ownsActiveReview && (
        <p role="status" className="text-sm text-ocean">
          You are the current reviewer. Starting review again only refreshes your activity time.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      )}
      {confirmed && !error && (
        <p role="status" className="text-sm text-ocean">
          {ownsActiveReview ? "Review activity refreshed." : "Review started."}
        </p>
      )}
      {canStart && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void handleStartReview()}
          className="inline-flex items-center justify-center rounded-md border border-ocean bg-ocean px-4 py-2 text-sm font-medium text-light transition hover:bg-ink disabled:opacity-60"
        >
          {pending ? "Starting…" : ownsActiveReview ? "Refresh review activity" : "Start review"}
        </button>
      )}
    </section>
  );
}
