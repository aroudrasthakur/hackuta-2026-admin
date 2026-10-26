import { useMutation } from "../convex/reactBindings";
import { useEffect, useRef, useState } from "react";
import type { GenericId } from "convex/values";
import { setApplicationDecisionRef, type ApplicationDetail } from "../convex/adminApi";
import { reportUserFacingError } from "../lib/userFacingError";
import {
  reviewDangerButtonClass,
  reviewPrimaryButtonClass,
  reviewSecondaryButtonClass,
  reviewSuccessButtonClass,
  reviewWaitlistButtonClass,
} from "../lib/reviewButtonClasses";
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
    body: "This saves an acceptance in the decision queue. The applicant will not see it, and no participant record is created, until an admin sends the email.",
    success: "Acceptance queued. The applicant will not see this decision until an admin sends the email.",
  },
  rejected: {
    label: "Reject",
    title: "Confirm rejection",
    body: "This saves a rejection in the decision queue. The applicant will not see it until an admin sends the email.",
    success: "Rejection queued. The applicant will not see this decision until an admin sends the email.",
  },
  waitlisted: {
    label: "Waitlist",
    title: "Confirm waitlist",
    body: "This saves a waitlist choice in the decision queue. The applicant will not see it until an admin sends the email. You can change it to an acceptance before the email goes out.",
    success: "Waitlist choice queued. The applicant will not see this decision until an admin sends the email.",
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
  const [choosing, setChoosing] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const completionRef = useRef<HTMLParagraphElement>(null);
  const choiceRefs = useRef<Partial<Record<PendingDecision, HTMLButtonElement | null>>>({});
  const lastChoice = useRef<PendingDecision>("accepted");
  const restoreChoice = useRef(false);
  const focusOpenedChoices = useRef(false);

  useEffect(() => {
    if (pendingDecision) confirmRef.current?.focus();
    else if (success) completionRef.current?.focus();
    else if (restoreChoice.current) {
      choiceRefs.current[lastChoice.current]?.focus();
      restoreChoice.current = false;
      focusOpenedChoices.current = false;
    } else if (focusOpenedChoices.current) {
      choiceRefs.current.accepted?.focus();
      focusOpenedChoices.current = false;
    }
  }, [pendingDecision, success, choosing, detail.reviewStatus, detail.reviewActivity.isFinal]);

  const applicationId = detail.application._id as GenericId<"applications">;
  const isFinal = detail.reviewActivity.isFinal;

  function openChoices() {
    setError(null);
    setSuccess(null);
    focusOpenedChoices.current = true;
    setChoosing(true);
  }

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
      setSuccess(decisionCopy[pendingDecision].success);
      setPendingDecision(null);
      setChoosing(false);
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
    <p ref={completionRef} tabIndex={-1} role="status" className="admin-callout admin-callout--success">{success}</p>
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
  const queued = detail.pendingDecision;
  const queuedLabel = queued
    ? `${queued.decision.charAt(0).toUpperCase()}${queued.decision.slice(1)}`
    : null;

  return (
    <ReviewPanelSection
      aria-label="Application decision"
      title="Decision"
      description={promotingWaitlist
        ? "A spot opened up? Accept this applicant from the waitlist. Nothing is saved until you confirm."
        : "Change the queued decision. Nothing is saved until you confirm."}
    >
      {queued && queuedLabel ? (
        <p className="text-sm text-ocean" role="status">
          Queued: {queuedLabel}
          {queued.status === "held" ? " — held" : queued.status === "sending" ? " — sending" : " — not released"}
        </p>
      ) : null}
      {error && (
        <p role="alert" className="admin-callout admin-callout--alert">
          {error}
        </p>
      )}
      {completion}

      {!pendingDecision && !promotingWaitlist && !choosing && (
        <button type="button" className={`${reviewPrimaryButtonClass} w-full`} onClick={openChoices}>
          Change Decision
        </button>
      )}

      {!pendingDecision && (promotingWaitlist || choosing) && (
        <div className={`grid gap-2 ${choices.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
          {choices.map((decision) => (
            <button
              key={decision}
              ref={(element) => { choiceRefs.current[decision] = element; }}
              type="button"
              className={
                decision === "accepted"
                  ? reviewSuccessButtonClass
                  : decision === "rejected"
                    ? reviewDangerButtonClass
                    : reviewWaitlistButtonClass
              }
              onClick={() => selectDecision(decision)}
            >
              {promotingWaitlist ? "Accept from waitlist" : decisionCopy[decision].label}
            </button>
          ))}
        </div>
      )}

      {pendingCopy && (
        <div className="space-y-3 rounded-xl border border-sand bg-clay/30 p-4">
          <h3 className="font-semibold text-night">{pendingCopy.title}</h3>
          <p className="break-words text-sm text-night">
            Applicant: <strong>{[detail.application.firstName, detail.application.lastName].filter(Boolean).join(" ") || "Applicant"}</strong>
            {detail.application.email ? ` (${detail.application.email})` : ""}
          </p>
          <p className="text-sm text-ocean">{pendingCopy.body}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              ref={confirmRef}
              type="button"
              disabled={confirming}
              className={pendingDecision === "accepted" ? reviewSuccessButtonClass : pendingDecision === "rejected" ? reviewDangerButtonClass : reviewPrimaryButtonClass}
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
