import { usePaginatedQuery } from "../convex/reactBindings";
import type { GenericId } from "convex/values";
import { listApplicationReviewLogsRef, type ReviewHistoryEvent } from "../convex/adminApi";
import { reviewActionLabels } from "../lib/reviewActionLabels";
import { ErrorBoundary } from "./ErrorBoundary";
import { EmptyState } from "./states/EmptyState";
import { LoadingState } from "./states/LoadingState";

const PAGE_SIZE = 50;
const reviewHistoryDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

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

type Action = ReviewHistoryEvent["action"];

/** Decisions get colored badges, review lifecycle uses the brand color, views stay muted. */
const actionStyles: Record<Action, { dot: string; badge: string }> = {
  accepted: { dot: "bg-green-600", badge: "bg-green-100 text-green-800" },
  rejected: { dot: "bg-red-600", badge: "bg-red-100 text-red-800" },
  waitlisted: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  started_review: { dot: "bg-ocean", badge: "bg-ocean/10 text-ocean" },
  review_ended: { dot: "bg-ocean", badge: "bg-ocean/10 text-ocean" },
  viewed: { dot: "bg-sand", badge: "text-mist" },
};

const rowClassName = "flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1";

function isDecision(action: Action) {
  return action === "accepted" || action === "rejected" || action === "waitlisted";
}

function EventTime({ value }: { value: number }) {
  return (
    <time dateTime={new Date(value).toISOString()} className="text-mist">
      {reviewHistoryDateFormatter.format(value)}
    </time>
  );
}

function Marker({ action }: { action: Action }) {
  return <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${actionStyles[action].dot}`} />;
}

function EventRow({ event }: { event: ReviewHistoryEvent }) {
  const { action } = event;
  const decision = isDecision(action);
  return (
    <div className={`flex items-start gap-3 ${decision ? "rounded-md bg-white/70 px-3 py-2" : ""}`}>
      <Marker action={action} />
      <div className={rowClassName}>
        <p>
          <span className="font-medium text-night">{event.actorName}</span>{" "}
          <span className={`rounded px-1.5 py-0.5 ${decision ? "font-semibold" : ""} ${actionStyles[action].badge}`}>
            {reviewActionLabels[action]}
          </span>
        </p>
        <EventTime value={event.createdAt} />
      </div>
    </div>
  );
}

function ViewsGroup({ events }: { events: EventGroup }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
        <Marker action="viewed" />
        <div className={rowClassName}>
          <p className="text-mist">
            <span aria-hidden className="mr-2 inline-block text-[0.625rem] transition-transform group-open:rotate-90">▶</span>
            {reviewActionLabels.viewed} ×{events.length}
          </p>
          <EventTime value={events[0].createdAt} />
        </div>
      </summary>
      <ol className="ml-1 mt-2 space-y-2 border-l border-sand pl-4">
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
      <ol className="space-y-1.5">
        {groupConsecutiveViews(results).map((group) => (
          <li key={group[0]._id} className="text-sm">
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
