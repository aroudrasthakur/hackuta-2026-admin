import { useMutation } from "convex/react";
import { useState } from "react";
import type { GenericId } from "convex/values";
import { setApplicationDecisionRef, type ApplicationDetail } from "../convex/adminApi";

type PendingDecision = "accepted" | "rejected" | "waitlisted";

type ApplicationDecisionControlsProps = {
  detail: ApplicationDetail;
  sessionToken: string;
};

const confirmCopy: Record<
  PendingDecision,
  { title: string; body: string; confirmLabel: string }
> = {
  accepted: {
    title: "Confirm acceptance",
    body: "This will finalize the acceptance decision and send the acceptance email to the applicant. This cannot be undone from this screen.",
    confirmLabel: "Confirm acceptance",
  },
  rejected: {
    title: "Confirm rejection",
    body: "This will finalize the rejection decision and send the rejection email to the applicant. This cannot be undone from this screen.",
    confirmLabel: "Confirm rejection",
  },
  waitlisted: {
    title: "Confirm waitlist",
    body: "This will finalize the waitlist decision and send the waitlist email to the applicant. This cannot be undone from this screen.",
    confirmLabel: "Confirm waitlist",
  },
};

export function ApplicationDecisionControls({
  detail,
  sessionToken,
}: ApplicationDecisionControlsProps) {
  const finalizeDecision = useMutation(setApplicationDecisionRef);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const applicationId = detail.application._id as GenericId<"applications">;
  const isFinal = detail.reviewActivity.isFinal;

  function selectDecision(decision: PendingDecision) {
    setError(null);
    setSuccess(null);
    setPendingDecision(decision);
  }

  function cancelPending() {
    if (confirming) return;
    setPendingDecision(null);
    setError(null);
  }

  async function confirmDecision() {
    if (!pendingDecision || confirming) return;
    setError(null);
    setSuccess(null);
    setConfirming(true);
    try {
      await finalizeDecision({
        sessionToken,
        applicationId,
        decision: pendingDecision,
      });
      setSuccess(
        pendingDecision === "accepted"
          ? "Application accepted. The applicant will receive an email shortly."
          : pendingDecision === "rejected"
            ? "Application rejected. The applicant will receive an email shortly."
            : "Application waitlisted. The applicant will receive an email shortly.",
      );
      setPendingDecision(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to finalize decision.");
    } finally {
      setConfirming(false);
    }
  }

  if (isFinal) {
    return null;
  }

  const pendingCopy = pendingDecision ? confirmCopy[pendingDecision] : null;

  return (
    <section
      aria-label="Application decision"
      className="rounded-lg border border-sand bg-white/60 p-4 space-y-3"
    >
      <div className="space-y-1">
        <h3 className="font-display text-lg text-night">Decision</h3>
        <p className="text-sm text-mist">
          Choose accept, reject, or waitlist. Nothing is saved until you confirm on the next step.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-ocean">
          {success}
        </p>
      )}

      {!pendingDecision && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-ocean bg-ocean px-4 py-2 text-sm font-medium text-light hover:bg-ink"
            onClick={() => selectDecision("accepted")}
          >
            Accept
          </button>
          <button
            type="button"
            className="rounded-md border border-sand bg-white px-4 py-2 text-sm font-medium text-night hover:bg-clay/40"
            onClick={() => selectDecision("rejected")}
          >
            Reject
          </button>
          <button
            type="button"
            className="rounded-md border border-sand bg-white px-4 py-2 text-sm font-medium text-night hover:bg-clay/40"
            onClick={() => selectDecision("waitlisted")}
          >
            Waitlist
          </button>
        </div>
      )}

      {pendingCopy && (
        <div className="space-y-3 rounded-md border border-sand bg-clay/20 p-4">
          <h4 className="font-medium text-night">{pendingCopy.title}</h4>
          <p className="text-sm text-mist">{pendingCopy.body}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={confirming}
              className="rounded-md border border-ocean bg-ocean px-4 py-2 text-sm font-medium text-light hover:bg-ink disabled:opacity-60"
              onClick={() => void confirmDecision()}
            >
              {confirming ? "Finalizing…" : pendingCopy.confirmLabel}
            </button>
            <button
              type="button"
              disabled={confirming}
              className="rounded-md border border-sand bg-white px-4 py-2 text-sm font-medium text-night hover:bg-clay/40 disabled:opacity-60"
              onClick={cancelPending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
