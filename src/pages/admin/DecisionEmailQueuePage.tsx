import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { AdminStatusBadge, type StatusTone } from "../../components/AdminStatusBadge";
import { EmptyState } from "../../components/states/EmptyState";
import { QueryErrorState } from "../../components/states/QueryErrorState";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ApplicationsQueuePagination } from "../../components/ApplicationsQueuePagination";
import { paginateQueue, queuePage, queuePageRange } from "../../lib/applicationQueue";

type QueueRow = DecisionEmailQueue["active"][number];
type SentRow = DecisionEmailQueue["sent"][number];

/** Maximum recently sent rows rendered on the decision emails page. */
const RECENTLY_SENT_DISPLAY_LIMIT = 5;

const deliveryTones: Record<QueueRow["status"], StatusTone> = {
  queued: "info", held: "warning", sending: "info", failed: "negative", sent: "positive",
};

function QueueTable({
  rows,
  selected,
  onToggle,
  onHold,
  busy,
}: {
  rows: QueueRow[];
  selected: Set<string>;
  onToggle: (itemId: QueueRow["itemId"]) => void;
  onHold: (itemId: QueueRow["itemId"], held: boolean) => void;
  busy: boolean;
}) {
  if (rows.length === 0) {
    return <EmptyState title="No decision emails are waiting" description="Queued decisions will appear here before they are released." />;
  }

  return (
    <div role="region" aria-label="Queued decision emails" tabIndex={0} className="admin-card admin-table-scroll">
      <table className="admin-table decision-email-table">
        <caption className="sr-only">Decision email queue</caption>
        <thead>
          <tr>
            <th scope="col" className="w-12">Send</th>
            <th scope="col">Applicant</th>
            <th scope="col">Decision</th>
            <th scope="col">Status</th>
            <th scope="col">Queued</th>
            <th scope="col">Hold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.itemId}>
              <td className="w-12">
                {row.status === "queued" || row.status === "held" ? (
                  <input
                    type="checkbox"
                    className="block size-4 accent-ocean"
                    aria-label={`Select ${row.applicantName}`}
                    checked={selected.has(row.itemId)}
                    disabled={row.status === "held"}
                    onChange={() => onToggle(row.itemId)}
                  />
                ) : null}
              </td>
              <th scope="row" className="font-normal">
                <Link className="font-semibold text-night underline" to={ADMIN_ROUTES.applicationReview(row.applicationId)}>
                  {row.applicantName}
                </Link>
                <p className="break-all text-muted">{row.recipientEmail}</p>
                {row.errorMessage ? <p className="text-red-700">{row.errorMessage}</p> : null}
              </th>
              <td><ApplicationDecisionBadge status={row.decision} /></td>
              <td><AdminStatusBadge tone={deliveryTones[row.status]} label={`Delivery: ${row.status}`}>{row.status.charAt(0).toUpperCase() + row.status.slice(1)}</AdminStatusBadge></td>
              <td>{new Date(row.queuedAt).toLocaleString()}</td>
              <td className="whitespace-nowrap">
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
        <h2 className="admin-card__title">Recently sent</h2>
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

function DecisionEmailQueueContent() {
  const { sessionToken } = useAdminAuth();
  const queue = useQuery(listDecisionEmailQueueRef, sessionToken ? { sessionToken } : "skip");
  const release = useAction(releaseDecisionEmailsRef);
  const hold = useMutation(setDecisionEmailHoldRef);
  const retry = useMutation(retryFailedDecisionEmailsRef);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeCount = queue?.active.length ?? 0;
  const page = queuePage(searchParams, activeCount);
  const { start: rangeStart, end: rangeEnd, totalPages } = queuePageRange(page, activeCount);
  const pagedActive = queue ? paginateQueue(queue.active, page) : [];

  const goToPage = useCallback((nextPage: number) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextPage <= 1) next.delete("page");
      else next.set("page", String(nextPage));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const requestedRaw = searchParams.get("page");
    if (!requestedRaw) return;
    const requested = Number.parseInt(requestedRaw, 10);
    if (!Number.isFinite(requested) || requested < 1) return;
    if (requested === page) return;
    goToPage(page);
  }, [goToPage, page, searchParams]);

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
    return <LoadingState layout="rows" message="Loading decision emails…" />;
  }

  const sending = queue.counts.sending > 0;
  const selectedIds = [...selected] as Array<QueueRow["itemId"]>;

  return (
    <div className="space-y-5">
      <dl aria-label="Delivery counts" className="admin-delivery-counts">
        {(["queued", "held", "sending", "failed"] as const).map((status) => (
          <div key={status}><dt className="capitalize">{status}</dt><dd>{queue.counts[status]}</dd></div>
        ))}
      </dl>

      {error ? <p role="alert" className="admin-callout admin-callout--alert">{error}</p> : null}
      {notice ? <p role="status" className="admin-callout admin-callout--success">{notice}</p> : null}

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

      {queue.active.length > 0 ? (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-ocean">
            Showing {rangeStart}–{rangeEnd} of {activeCount} queued
            <span className="sr-only">. Page {page} of {totalPages}.</span>
          </p>
          <ApplicationsQueuePagination
            page={page}
            totalPages={totalPages}
            onPageChange={goToPage}
            ariaLabel="Queued decision emails pages"
          />
        </div>
      ) : null}

      <QueueTable
        rows={pagedActive}
        selected={selected}
        onToggle={toggle}
        onHold={(itemId, held) => void setHold(itemId, held)}
        busy={busy || sending}
      />

      <RecentlySentSection rows={queue.sent} totalSent={queue.counts.sent} />
    </div>
  );
}

export function DecisionEmailQueuePage() {
  const { sessionToken } = useAdminAuth();
  const [retry, setRetry] = useState(0);
  return (
    <section aria-labelledby="decision-emails-heading" className="space-y-5">
      <AdminPageHeader id="decision-emails-heading" title="Decision emails" description="Review queued decisions before they are emailed. Review status and participant records update only after the email server accepts each message." />
      <ErrorBoundary key={`${sessionToken}:${retry}`} fallback={<QueryErrorState title="Unable to load decision emails" onRetry={() => setRetry((value) => value + 1)} />}>
        <DecisionEmailQueueContent />
      </ErrorBoundary>
    </section>
  );
}
