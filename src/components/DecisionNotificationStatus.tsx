import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "../convex/reactBindings";
import { checkDecisionNotificationRef, retryDecisionNotificationRef, type ApplicationDetail } from "../convex/adminApi";
import { formatMutationError } from "../lib/formatMutationError";
import { reviewSecondaryButtonClass } from "../lib/reviewButtonClasses";
import { ReviewPanelSection } from "./ReviewPanelSection";

const statusCopy = {
  scheduled: "Decision saved. Email is scheduled.",
  sending: "Decision saved. Contacting the email service.",
  queued: "Email queued by the service. Sending has not yet been confirmed.",
  sent: "The email service reports that the notification was sent.",
  failed: "The notification could not be sent. The decision is still saved.",
  unknown: "The email service response was unsuccessful. The message may still have been queued.",
  unavailable: "The notification was not sent because the applicant has no email address.",
};

export function DecisionNotificationStatus({ detail, sessionToken }: { detail: ApplicationDetail; sessionToken: string }) {
  const retry = useMutation(retryDecisionNotificationRef);
  const check = useAction(checkDecisionNotificationRef);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const resendRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const notification = detail.notification;
  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try { await action(); setConfirming(false); requestAnimationFrame(() => statusRef.current?.focus()); }
    catch (caught) { setError(formatMutationError(caught, "Unable to update notification status.")); }
    finally { setPending(false); }
  }

  const canRetry = !notification || ["failed", "unknown", "unavailable"].includes(notification.status);
  return (
    <ReviewPanelSection aria-label="Applicant notification" title="Applicant notification">
      <p ref={statusRef} tabIndex={-1} role="status" className="text-sm text-ocean">
        {notification ? statusCopy[notification.status] : "This earlier decision has no tracked email status. Sending cannot be verified here."}
      </p>
      <p className="break-words text-sm">Recipient: {notification?.recipient || detail.application.email || "Not provided"}</p>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {notification?.serviceId && (
        <button type="button" disabled={pending} className={reviewSecondaryButtonClass}
          onClick={() => void run(() => check({ sessionToken, applicationId: detail.application._id }))}>
          {pending ? "Updating…" : "Check email status"}
        </button>
      )}
      {canRetry && detail.application.email?.trim() && !confirming && (
        <button ref={resendRef} type="button" disabled={pending} className={reviewSecondaryButtonClass} onClick={() => { setError(null); setConfirming(true); }}>
          Resend decision email
        </button>
      )}
      {confirming && (
        <div className="space-y-3 rounded-md border border-sand p-4">
          <p className="text-sm">Send the current decision to {detail.application.email}? If an earlier attempt succeeded, the applicant may receive a duplicate email. This does not change their decision.</p>
          <div className="flex flex-wrap gap-2">
            <button ref={confirmRef} type="button" disabled={pending} className={reviewSecondaryButtonClass}
              onClick={() => void run(() => retry({ sessionToken, applicationId: detail.application._id }))}>
              {pending ? "Scheduling…" : "Confirm resend"}
            </button>
            <button type="button" disabled={pending} className={reviewSecondaryButtonClass}
              onClick={() => { setConfirming(false); requestAnimationFrame(() => resendRef.current?.focus()); }}>Cancel resend</button>
          </div>
        </div>
      )}
    </ReviewPanelSection>
  );
}
