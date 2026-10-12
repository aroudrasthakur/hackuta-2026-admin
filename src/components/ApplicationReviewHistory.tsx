import { usePaginatedQuery } from "convex/react";
import type { GenericId } from "convex/values";
import { listApplicationReviewLogsRef, type ReviewHistoryEvent } from "../convex/adminApi";
import { formatApplicationDate } from "../lib/applicationDisplay";
import { ErrorBoundary } from "./ErrorBoundary";
import { EmptyState } from "./states/EmptyState";
import { LoadingState } from "./states/LoadingState";

const PAGE_SIZE = 50;

const actionLabels: Record<ReviewHistoryEvent["action"], string> = {
  viewed: "Viewed application",
  started_review: "Started review",
  review_ended: "Ended review",
  accepted: "Accepted applicant",
  rejected: "Rejected applicant",
  waitlisted: "Waitlisted applicant",
};

type ReviewHistoryProps = {
  applicationId: GenericId<"applications">;
  sessionToken: string;
};

type EventGroup = [ReviewHistoryEvent, ...ReviewHistoryEvent[]];

/** Folds runs of consecutive views into one group so decisions stay easy to scan. */
function groupConsecutiveViews(events: ReviewHistoryEvent[]) {
  const groups: EventGroup[] = [];
  for (const event of events) {
    const last = groups.at(-1);
    if (event.action === "viewed" && last?.[0].action === "viewed") last.push(event);
    else groups.push([event]);
  }
  return groups;
}

const rowClassName = "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1";

function EventTime({ value }: { value: number }) {
  return (
    <time dateTime={new Date(value).toISOString()} className="text-mist">
      {formatApplicationDate(value)}
    </time>
  );
}

function EventRow({ event }: { event: ReviewHistoryEvent }) {
  return (
    <div className={rowClassName}>
      <p>
        <span className="font-medium text-night">{event.actorName}</span>{" "}
        <span className={event.action === "accepted" ? "font-medium text-green-700" : "text-ocean"}>
          {actionLabels[event.action]}
        </span>
      </p>
      <EventTime value={event.createdAt} />
    </div>
  );
}

function ViewsGroup({ events }: { events: EventGroup }) {
  return (
    <details className="group">
      <summary className={`${rowClassName} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <p className="text-ocean">
          <span aria-hidden className="mr-2 inline-block text-[0.625rem] transition-transform group-open:rotate-90">▶</span>
          {actionLabels.viewed} ×{events.length}
        </p>
        <EventTime value={events[0].createdAt} />
      </summary>
      <ol className="mt-2 space-y-2 border-l border-sand pl-4">
        {events.map((event) => <li key={event._id}><EventRow event={event} /></li>)}
      </ol>
    </details>
  );
}

function ReviewHistoryEvents({ applicationId, sessionToken }: ReviewHistoryProps) {
  const { results, status, loadMore } = usePaginatedQuery(
    listApplicationReviewLogsRef,
    { sessionToken, applicationId },
    { initialNumItems: PAGE_SIZE },
  );

  if (status === "LoadingFirstPage") return <LoadingState message="Loading review history…" />;
  if (results.length === 0) {
    return <EmptyState title="No review activity yet" description="Events appear here as organizers review this application." />;
  }
  return (
    <>
      <ol className="divide-y divide-sand">
        {groupConsecutiveViews(results).map((group) => (
          <li key={group[0]._id} className="py-3 text-sm">
            {group.length === 1 ? <EventRow event={group[0]} /> : <ViewsGroup events={group} />}
          </li>
        ))}
      </ol>
      {status !== "Exhausted" && (
        <button
          type="button"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
          className="inline-flex items-center justify-center rounded-md border border-ocean px-4 py-2 text-sm font-medium text-ocean transition hover:bg-ocean hover:text-light disabled:opacity-60"
        >
          {status === "LoadingMore" ? "Loading…" : "Show older activity"}
        </button>
      )}
    </>
  );
}

export function ApplicationReviewHistory(props: ReviewHistoryProps) {
  return (
    <section aria-label="Review history" className="space-y-3 rounded-lg border border-sand bg-white/40 p-5">
      <h3 className="font-display text-lg text-night">Review history</h3>
      <ErrorBoundary
        fallback={
          <p role="alert" className="rounded-lg border border-sand bg-clay/30 p-3 text-sm">
            We couldn’t load the review history. Refresh the page to try again.
          </p>
        }
      >
        <ReviewHistoryEvents {...props} />
      </ErrorBoundary>
    </section>
  );
}
