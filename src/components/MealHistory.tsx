import { useState } from "react";
import { usePaginatedQuery } from "../convex/reactBindings";
import { listMealRedemptionsRef, type AdminMeal } from "../convex/mealsApi";
import { LoadingState } from "./states/LoadingState";
import { EmptyState } from "./states/EmptyState";
import { ErrorBoundary } from "./ErrorBoundary";
import { QueryErrorState } from "./states/QueryErrorState";
import { reviewSecondaryButtonClass } from "../lib/reviewButtonClasses";

function HistoryRows({ meal, sessionToken, from, to }: { meal: AdminMeal; sessionToken: string; from?: number | undefined; to?: number | undefined }) {
  const { results, status, loadMore } = usePaginatedQuery(listMealRedemptionsRef,
    { sessionToken, mealPeriodId: meal._id, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) }, { initialNumItems: 25 });
  if (status === "LoadingFirstPage") return <LoadingState message="Loading collection history…" />;
  return <>
    {results.length === 0 ? <EmptyState title="No collections found" description="Collections for this meal will appear here. Try a different time range." /> :
      <div className="admin-table-scroll" role="region" aria-label="Meal collection history" tabIndex={0}>
        <table className="admin-table"><caption className="sr-only">Collection history for {meal.name}</caption>
          <thead><tr><th scope="col">Participant</th><th scope="col">Served by</th><th scope="col">Collected at</th></tr></thead>
          <tbody>{results.map((row) => <tr key={row.redemptionId}><th scope="row">{row.participantName}</th><td>{row.scannedByName}</td><td><time dateTime={new Date(row.redeemedAt).toISOString()}>{new Date(row.redeemedAt).toLocaleString()}</time></td></tr>)}</tbody>
        </table>
      </div>}
    {status === "CanLoadMore" || status === "LoadingMore" ? <button type="button" className={reviewSecondaryButtonClass} disabled={status === "LoadingMore"} onClick={() => loadMore(25)}>{status === "LoadingMore" ? "Loading…" : "Load more collections"}</button> : null}
  </>;
}

export function MealHistory({ meal, sessionToken }: { meal: AdminMeal; sessionToken: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [retry, setRetry] = useState(0);
  const lower = from ? new Date(from).getTime() : undefined;
  const upper = to ? new Date(to).getTime() : undefined;
  const invalid = (lower !== undefined && !Number.isFinite(lower)) || (upper !== undefined && !Number.isFinite(upper)) || (lower !== undefined && upper !== undefined && lower > upper);
  return <section aria-labelledby="meal-history-heading" className="admin-card admin-card__body space-y-4">
    <h2 id="meal-history-heading" className="admin-card__title">Collection history · {meal.name}</h2>
    <div className="flex flex-wrap items-end gap-4">
      <label className="meal-field">Collected from<input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="meal-field">Collected through<input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="button" className={reviewSecondaryButtonClass} onClick={() => { setFrom(""); setTo(""); }}>Clear filters</button>
    </div>
    <p className="text-sm text-muted">Collection times and filters use your local timezone.</p>
    {invalid ? <p role="alert">Choose a collection range with the end after the start.</p> :
      <ErrorBoundary key={`${from}:${to}:${retry}`} fallback={<QueryErrorState title="Unable to load collection history" onRetry={() => setRetry((value) => value + 1)} />}>
        <HistoryRows key={`${from}:${to}`} meal={meal} sessionToken={sessionToken} from={lower} to={upper} />
      </ErrorBoundary>}
  </section>;
}
