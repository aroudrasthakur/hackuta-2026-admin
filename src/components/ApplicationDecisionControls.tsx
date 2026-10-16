import { useMutation } from "../convex/reactBindings";
import { useEffect, useRef, useState } from "react";
import type { GenericId } from "convex/values";
import { setApplicationDecisionRef, type ApplicationDetail } from "../convex/adminApi";
import { reportUserFacingError } from "../lib/userFacingError";
import { reviewPrimaryButtonClass, reviewSecondaryButtonClass } from "../lib/reviewButtonClasses";
import { ReviewPanelSection } from "./ReviewPanelSection";

type PendingDecision = "accepted" | "rejected" | "waitlisted";

type ApplicationDecisionControlsProps = {
  detail: ApplicationDetail;
  sessionToken: string;
  blockedByOther?: boolean;
};

const decisionCopy: Record<
  PendingDecision,
  { label: string; title: string; body: string; success: string }
> = {
  accepted: {
    label: "Accept",
    title: "Confirm acceptance",
    body: "This will save the acceptance decision and schedule the acceptance email if an email address is available. This cannot be undone from this screen.",
    success: "Application accepted. Acceptance email scheduled.",
  },
  rejected: {
    label: "Reject",
    title: "Confirm rejection",
    body: "This will save the rejection decision and schedule the rejection email if an email address is available. This cannot be undone from this screen.",
    success: "Application rejected. Rejection email scheduled.",
  },
  waitlisted: {
    label: "Waitlist",
    title: "Confirm waitlist",
    body: "This will place the applicant on the waitlist and schedule their notification email if an email address is available. You can accept them later when a spot opens.",
    success: "Application waitlisted. Waitlist email scheduled.",
  },
};

export function ApplicationDecisionControls({
  detail,
  sessionToken,
  blockedByOther = false,
}: ApplicationDecisionControlsProps) {
  const finalizeDecision = useMutation(setApplicationDecisionRef);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const completionRef = useRef<HTMLParagraphElement>(null);
  const choiceRefs = useRef<Partial<Record<PendingDecision, HTMLButtonElement | null>>>({});
  const lastChoice = useRef<PendingDecision>("accepted");
  const restoreChoice = useRef(false);

  useEffect(() => {
    if (pendingDecision) confirmRef.current?.focus();
    else if (success) completionRef.current?.focus();
    else if (restoreChoice.current) {
      choiceRefs.current[lastChoice.current]?.focus();
      restoreChoice.current = false;
    }
  }, [pendingDecision, success, detail.reviewStatus, detail.reviewActivity.isFinal]);

  const applicationId = detail.application._id as GenericId<"applications">;
  const isFinal = detail.reviewActivity.isFinal;

  function selectDecision(decision: PendingDecision) {
    lastChoice.current = decision;
    setError(null);
    setSuccess(null);
    setPendingDecision(decision);
  }

  function cancelPending() {
    if (confirming) return;
    restoreChoice.current = true;
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
      setSuccess(detail.application.email?.trim()
        ? decisionCopy[pendingDecision].success
        : `Application ${pendingDecision}. No email scheduled: applicant email is missing.`);
      setPendingDecision(null);
    } catch (caught) {
      setError(
        reportUserFacingError(
          "Unable to finalize decision",
          caught,
          "We couldn't save this decision. Please try again.",
          { source: "ApplicationDecisionControls.handleConfirm" },
        ),
      );
    } finally {
      setConfirming(false);
    }
  }

  const promotingWaitlist = detail.reviewStatus === "waitlisted";
  const completion = success && (
    <p ref={completionRef} tabIndex={-1} role="status" className="rounded-md border border-sand bg-white p-4 text-sm text-ocean">{success}</p>
  );
  if (isFinal && !promotingWaitlist) {
    return completion;
  }

  if (blockedByOther) {
    return (
      <ReviewPanelSection
        aria-label="Application decision"
        title="Decision"
        description="Another organizer is actively reviewing this application. You cannot finalize a decision until their session is stale or they finish."
      >
        <p className="text-sm text-ocean">
          Decisions are unavailable while another organizer holds the active review claim.
        </p>
      </ReviewPanelSection>
    );
  }

  const choices: PendingDecision[] = promotingWaitlist ? ["accepted"] : ["accepted", "rejected", "waitlisted"];
  const pendingCopy = pendingDecision ? decisionCopy[pendingDecision] : null;

  return (
    <ReviewPanelSection
      aria-label="Application decision"
      title="Decision"
      description={promotingWaitlist
        ? "A spot opened up? Accept this applicant from the waitlist. Nothing is saved until you confirm."
        : "Choose accept, reject, or waitlist. Nothing is saved until you confirm on the next step."}
    >
      {error && (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      )}
      {completion}

      {!pendingDecision && (
        <div className="flex flex-wrap gap-2">
          {choices.map((decision) => (
            <button
              key={decision}
              ref={(element) => { choiceRefs.current[decision] = element; }}
              type="button"
              className={decision === "accepted" ? reviewPrimaryButtonClass : reviewSecondaryButtonClass}
              onClick={() => selectDecision(decision)}
            >
              {promotingWaitlist ? "Accept from waitlist" : decisionCopy[decision].label}
            </button>
          ))}
        </div>
      )}

      {pendingCopy && (
        <div className="space-y-3 rounded-md border border-sand bg-clay/20 p-4">
          <h4 className="font-medium text-night">{pendingCopy.title}</h4>
          <p className="break-words text-sm text-night">
            Applicant: <strong>{[detail.application.firstName, detail.application.lastName].filter(Boolean).join(" ") || "Applicant"}</strong>
            {detail.application.email ? ` (${detail.application.email})` : ""}
          </p>
          <p className="text-sm text-ocean">{pendingCopy.body}</p>
          <div className="flex flex-wrap gap-2">
            <button
              ref={confirmRef}
              type="button"
              disabled={confirming}
              className={reviewPrimaryButtonClass}
              onClick={() => void confirmDecision()}
            >
              {confirming ? "Finalizing…" : pendingCopy.title}
            </button>
            <button
              type="button"
              disabled={confirming}
              className={reviewSecondaryButtonClass}
              onClick={cancelPending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </ReviewPanelSection>
  );
}
