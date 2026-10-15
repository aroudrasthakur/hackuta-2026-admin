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

const actionStyles: Record<Action, { marker: string; category?: string; categoryStyle?: string; eventStyle?: string }> = {
  accepted: {
    marker: "bg-green-600",
    category: "Decision",
    categoryStyle: "bg-green-100 text-green-800",
    eventStyle: "border-green-500",
  },
  rejected: {
    marker: "bg-red-600",
    category: "Decision",
    categoryStyle: "bg-red-100 text-red-800",
    eventStyle: "border-red-500",
  },
  waitlisted: {
    marker: "bg-amber-500",
    category: "Decision",
    categoryStyle: "bg-amber-100 text-amber-800",
    eventStyle: "border-amber-500",
  },
  started_review: {
    marker: "bg-ocean",
    category: "Review update",
    categoryStyle: "bg-ocean/10 text-ocean",
  },
  review_ended: {
    marker: "bg-ocean",
    category: "Review update",
    categoryStyle: "bg-ocean/10 text-ocean",
  },
  viewed: { marker: "bg-sand" },
};

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
  return (
    <span
      aria-hidden
      className={`relative z-10 mt-1 size-2.5 shrink-0 rounded-full border-2 border-white ${actionStyles[action].marker}`}
    />
  );
}

function EventRow({ event }: { event: ReviewHistoryEvent }) {
  const { action } = event;
  const decision = isDecision(action);
  return (
    <div data-action={action} className="flex items-start gap-3">
      <Marker action={action} />
      <div className={`-mt-1 min-w-0 flex-1 ${decision ? `rounded-md border-l-2 bg-white/70 px-3 py-2 ${actionStyles[action].eventStyle}` : "py-0.5"}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-medium text-night">{reviewActionLabels[action]}</p>
          {actionStyles[action].category && (
            <span
              data-category={actionStyles[action].category}
              className={`rounded-sm px-1.5 py-0.5 text-[0.65rem] font-semibold ${actionStyles[action].categoryStyle}`}
            >
              {actionStyles[action].category}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-mist">
          <span className="font-medium text-ocean">{event.actorName}</span>{" · "}
          <EventTime value={event.createdAt} />
        </p>
      </div>
    </div>
  );
}

function ViewsGroup({ events }: { events: EventGroup }) {
  const latestEvent = events[0];
  return (
    <div className="flex items-start gap-3">
      <Marker action="viewed" />
      <details className="group -mt-1 min-w-0 flex-1 py-0.5">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <p className="font-medium text-night">
            <span aria-hidden className="mr-2 inline-block text-[0.625rem] text-mist transition-transform group-open:rotate-90">▶</span>
            {reviewActionLabels.viewed} ×{events.length}
          </p>
          <p className="mt-1 text-xs text-mist">
            Latest: <span className="font-medium text-ocean">{latestEvent.actorName}</span>{" · "}
            <EventTime value={latestEvent.createdAt} />
            <span className="sr-only">View individual events</span>
          </p>
        </summary>
        <ol className="mt-2 space-y-2 border-l border-sand pl-4">
          {events.map((event) => <li key={event._id}><EventRow event={event} /></li>)}
        </ol>
      </details>
    </div>
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
      <ol className="relative space-y-1 before:absolute before:bottom-2 before:left-[4px] before:top-3 before:w-px before:bg-sand">
        {groupConsecutiveViews(results).map((group) => (
          <li key={group[0]._id} className="py-1.5 text-sm">
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
      <h3 className="font-display text-lg text-night">Review History</h3>
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
