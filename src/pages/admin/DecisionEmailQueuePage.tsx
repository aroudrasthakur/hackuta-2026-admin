import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction, useMutation, useQuery } from "../../convex/reactBindings";
import {
  listDecisionEmailQueueRef,
  releaseDecisionEmailsRef,
  retryFailedDecisionEmailsRef,
  setDecisionEmailHoldRef,
  type DecisionEmailQueue,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { reportUserFacingError } from "../../lib/userFacingError";
import { reviewPrimaryButtonClass, reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";
import { ADMIN_ROUTES } from "../../types/routes";
import { ApplicationDecisionBadge } from "../../components/ApplicationDecisionBadge";
import { LoadingState } from "../../components/states/LoadingState";
import { formatApplicationDisplayDate } from "../../lib/dateFormat";

type QueueRow = DecisionEmailQueue["active"][number];
type SentRow = DecisionEmailQueue["sent"][number];

/** Maximum recently sent rows rendered on the decision emails page. */
const RECENTLY_SENT_DISPLAY_LIMIT = 5;

function decisionLabel(decision: QueueRow["decision"]) {
  if (decision === "accepted") return "Accepted";
  if (decision === "rejected") return "Rejected";
  return "Waitlisted";
}

const queueTableCellClass = "px-3 py-2 text-center align-middle";
const queueTableHeadClass = `${queueTableCellClass} font-semibold`;

function QueueTable({
  rows,
  isAdmin,
  selected,
  onToggle,
  onHold,
  busy,
}: {
  rows: QueueRow[];
  isAdmin: boolean;
  selected: Set<string>;
  onToggle: (itemId: QueueRow["itemId"]) => void;
  onHold: (itemId: QueueRow["itemId"], held: boolean) => void;
  busy: boolean;
}) {
  if (rows.length === 0) {
    return <p className="admin-page-lead">No decision emails are waiting.</p>;
  }

  return (
    <div className="admin-card overflow-x-auto">
      <table className="w-full text-base">
        <thead>
          <tr className="border-b border-sand text-ocean">
            {isAdmin ? <th className={`${queueTableHeadClass} w-12`}>Send</th> : null}
            <th className={queueTableHeadClass}>Applicant</th>
            <th className={queueTableHeadClass}>Decision</th>
            <th className={`${queueTableHeadClass} min-w-[4.5rem]`}>Status</th>
            <th className={queueTableHeadClass}>Queued</th>
            {isAdmin ? <th className={`${queueTableHeadClass} min-w-[5.75rem]`}>Hold</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.itemId} className="border-b border-sand/70">
              {isAdmin ? (
                <td className={`${queueTableCellClass} w-12`}>
                  {row.status === "queued" || row.status === "held" ? (
                    <input
                      type="checkbox"
                      className="mx-auto block"
                      aria-label={`Select ${row.applicantName}`}
                      checked={selected.has(row.itemId)}
                      disabled={row.status === "held"}
                      onChange={() => onToggle(row.itemId)}
                    />
                  ) : null}
                </td>
              ) : null}
              <td className={queueTableCellClass}>
                <Link className="font-semibold text-night underline" to={ADMIN_ROUTES.applicationReview(row.applicationId)}>
                  {row.applicantName}
                </Link>
                <p className="text-ocean">{row.recipientEmail}</p>
                {row.errorMessage ? <p className="text-red-700">{row.errorMessage}</p> : null}
              </td>
              <td className={queueTableCellClass}>{decisionLabel(row.decision)}</td>
              <td className={`${queueTableCellClass} whitespace-nowrap capitalize`}>{row.status}</td>
              <td className={queueTableCellClass}>{new Date(row.queuedAt).toLocaleString()}</td>
              {isAdmin ? (
                <td className={`${queueTableCellClass} whitespace-nowrap`}>
                  {row.status === "queued" || row.status === "held" ? (
                    <button
                      type="button"
                      className={`${reviewSecondaryButtonClass} mx-auto min-w-[5.75rem]`}
                      disabled={busy}
                      onClick={() => onHold(row.itemId, row.status !== "held")}
                    >
                      {row.status === "held" ? "Unhold" : "Hold"}
                    </button>
                  ) : (
                    <span className="mx-auto inline-block min-h-11 min-w-[5.75rem]" aria-hidden />
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentlySentSection({ rows, totalSent }: { rows: SentRow[]; totalSent: number }) {
  const visible = rows.slice(0, RECENTLY_SENT_DISPLAY_LIMIT);
  const showMoreNotice = totalSent > visible.length;

  return (
    <section aria-label="Recently sent decision emails" className="admin-card admin-card__body space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="admin-card__title">Recently sent</h3>
        {totalSent > 0 ? (
          <p className="admin-card__hint m-0">
            {showMoreNotice
              ? `Showing ${visible.length} of ${totalSent} sent emails`
              : `${totalSent} sent email${totalSent === 1 ? "" : "s"}`}
          </p>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="admin-page-lead">No decision emails have been sent yet.</p>
      ) : (
        <ul className="divide-y divide-sand/80">
          {visible.map((row) => {
            const sentAt = row.sentAt ?? row.queuedAt;
            return (
              <li key={row.itemId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-left">
                  <Link
                    className="font-semibold text-night underline"
                    to={ADMIN_ROUTES.applicationReview(row.applicationId)}
                  >
                    {row.applicantName}
                  </Link>
                  <p className="decision-email-recent-item__email truncate">{row.recipientEmail}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <ApplicationDecisionBadge status={row.decision} />
                  <time className="decision-email-recent-item__time" dateTime={new Date(sentAt).toISOString()}>
                    Sent {formatApplicationDisplayDate(sentAt)}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function DecisionEmailQueuePage() {
  const { sessionToken, staff } = useAdminAuth();
  const isAdmin = staff?.role === "admin";
  const queue = useQuery(listDecisionEmailQueueRef, sessionToken ? { sessionToken } : "skip");
  const release = useAction(releaseDecisionEmailsRef);
  const hold = useMutation(setDecisionEmailHoldRef);
  const retry = useMutation(retryFailedDecisionEmailsRef);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggle(itemId: QueueRow["itemId"]) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function send(itemIds?: Array<QueueRow["itemId"]>) {
    if (!sessionToken || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await release({
        sessionToken,
        ...(itemIds ? { itemIds } : {}),
      });
      setSelected(new Set());
      setNotice(`Sent ${result.sent} of ${result.total}. ${result.failed} failed.`);
    } catch (caught) {
      setError(reportUserFacingError(
        "Unable to send decision emails",
        caught,
        "We couldn't send these decision emails. Please try again.",
        { source: "DecisionEmailQueuePage.send" },
      ));
    } finally {
      setBusy(false);
    }
  }

  async function setHold(itemId: QueueRow["itemId"], held: boolean) {
    if (!sessionToken) return;
    setError(null);
    try {
      await hold({ sessionToken, itemId, held });
    } catch (caught) {
      setError(reportUserFacingError(
        "Unable to update hold",
        caught,
        "We couldn't update that row. Please try again.",
        { source: "DecisionEmailQueuePage.setHold" },
      ));
    }
  }

  async function retryFailed() {
    if (!sessionToken) return;
    setError(null);
    try {
      const result = await retry({ sessionToken });
      setNotice(`${result.retried} failed email${result.retried === 1 ? "" : "s"} returned to the queue.`);
    } catch (caught) {
      setError(reportUserFacingError(
        "Unable to retry decision emails",
        caught,
        "We couldn't retry the failed emails. Please try again.",
        { source: "DecisionEmailQueuePage.retryFailed" },
      ));
    }
  }

  if (!sessionToken || queue === undefined) {
    return <LoadingState message="Loading decision emails…" />;
  }

  const sending = queue.counts.sending > 0;
  const selectedIds = [...selected] as Array<QueueRow["itemId"]>;

  return (
    <section aria-labelledby="decision-emails-heading" className="space-y-5">
      <header className="space-y-2">
        <h2 id="decision-emails-heading" className="admin-page-title">
          Decision emails
        </h2>
        <p className="admin-page-lead">
          Review queued decisions before they are emailed. Review status and participant records update only after the email server accepts each message.
        </p>
        {!isAdmin ? (
          <p className="admin-page-lead">An admin releases these emails. You can review the queue, but you cannot send it.</p>
        ) : null}
      </header>

      <p className="admin-page-meta">
        Queued {queue.counts.queued} · Held {queue.counts.held} · Sending {queue.counts.sending} · Failed {queue.counts.failed}
      </p>

      {error ? <p role="alert" className="admin-callout admin-callout--alert">{error}</p> : null}
      {notice ? <p role="status" className="admin-callout admin-callout--success">{notice}</p> : null}

      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={reviewPrimaryButtonClass}
            disabled={busy || sending || selectedIds.length === 0}
            onClick={() => void send(selectedIds)}
          >
            Send selected
          </button>
          <button
            type="button"
            className={reviewSecondaryButtonClass}
            disabled={busy || sending || queue.counts.queued === 0}
            onClick={() => void send()}
          >
            Send all queued
          </button>
          <button
            type="button"
            className={reviewSecondaryButtonClass}
            disabled={busy || sending || queue.counts.failed === 0}
            onClick={() => void retryFailed()}
          >
            Retry failed
          </button>
        </div>
      ) : null}

      <QueueTable
        rows={queue.active}
        isAdmin={isAdmin}
        selected={selected}
        onToggle={toggle}
        onHold={(itemId, held) => void setHold(itemId, held)}
        busy={busy || sending}
      />

      <RecentlySentSection rows={queue.sent} totalSent={queue.counts.sent} />
    </section>
  );
}
