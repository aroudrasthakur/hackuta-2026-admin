import { useRef, useState } from "react";
import { useMutation, useQuery } from "../../convex/reactBindings";
import { listMealPeriodsRef, removeMealPeriodRef, setMealPeriodActiveRef, type AdminMeal } from "../../convex/mealsApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNow } from "../../hooks/useNow";
import { mealStatus, type MealStatus } from "../../../shared/admin/mealRules";
import { userFacingErrorMessage } from "../../lib/userFacingError";
import { reviewDangerButtonClass, reviewPrimaryButtonClass, reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { AdminStatusBadge, type StatusTone } from "../../components/AdminStatusBadge";
import { MealForm } from "../../components/MealForm";
import { MealDialog } from "../../components/MealDialog";
import { MealHistory } from "../../components/MealHistory";
import { LoadingState } from "../../components/states/LoadingState";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { QueryErrorState } from "../../components/states/QueryErrorState";

const tones: Record<MealStatus, StatusTone> = { Active: "positive", Upcoming: "info", Ended: "neutral", Disabled: "warning" };
type PendingAction = { meal: AdminMeal; kind: "remove" | "deactivate" | "activate" };

function MealManagement({ sessionToken }: { sessionToken: string }) {
  const meals = useQuery(listMealPeriodsRef, { sessionToken });
  const setActive = useMutation(setMealPeriodActiveRef);
  const remove = useMutation(removeMealPeriodRef);
  const now = useNow();
  const [form, setForm] = useState<AdminMeal | "new" | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyId, setHistoryId] = useState<AdminMeal["_id"] | null>(null);
  const [filter, setFilter] = useState<MealStatus | "All">("All");
  const selectedMeal = meals?.find((meal) => meal._id === historyId);

  async function confirmAction() {
    if (!action || running.current) return;
    running.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const args = { sessionToken, mealPeriodId: action.meal._id };
      if (action.kind === "remove") await remove(args);
      else await setActive({ ...args, active: action.kind === "activate" });
      setNotice(action.kind === "remove" ? "Meal removed." : action.kind === "activate" ? "Meal enabled for its serving window." : "Meal deactivated. Collection history is preserved.");
      setAction(null);
    } catch (caught) {
      setError(userFacingErrorMessage(caught, "We couldn't update this meal. Please try again."));
    } finally { running.current = false; setBusy(false); }
  }
  const visible = meals?.filter((meal) => filter === "All" || mealStatus(meal, now) === filter);

  return <>
    <AdminPageHeader id="meals-heading" title="Meals" eyebrow="The Symposium · Meals" description="Schedule serving windows and follow meal collections live."
      actions={<button className={reviewPrimaryButtonClass} onClick={() => { setNotice(""); setForm("new"); }}>Create meal</button>} />
    {notice && <p role="status" className="admin-callout">{notice}</p>}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <label className="meal-field">Meal status<select value={filter} onChange={(event) => setFilter(event.target.value as MealStatus | "All")}>
        {["All", "Upcoming", "Active", "Ended", "Disabled"].map((status) => <option key={status}>{status}</option>)}
      </select></label>
      <p className="text-sm text-muted">Schedules use your local timezone. Served counts update live.</p>
    </div>
    {meals === undefined ? <LoadingState message="Loading meals…" /> : meals.length === 0 ?
      <EmptyState title="No meals scheduled" description="Create your first meal with a name and serving window." /> : visible?.length === 0 ?
        <EmptyState title="No meals match this status" description="Choose another status to see your scheduled meals." /> :
        <div className="admin-card admin-table-scroll" role="region" aria-label="Meal management" tabIndex={0}>
          <table className="admin-table meal-table"><caption className="sr-only">Meal periods</caption>
            <thead><tr>{["Meal", "Schedule", "Status", "Served", "Actions"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{visible?.map((meal) => {
              const status = mealStatus(meal, now);
              return <tr key={meal._id}>
                <th scope="row"><span className="font-semibold">{meal.name}</span>{meal.description && <p className="mt-1 font-normal text-muted">{meal.description}</p>}</th>
                <td><time dateTime={new Date(meal.startsAt).toISOString()}>{new Date(meal.startsAt).toLocaleString()}</time><span className="block text-muted">to <time dateTime={new Date(meal.endsAt).toISOString()}>{new Date(meal.endsAt).toLocaleString()}</time></span></td>
                <td><AdminStatusBadge tone={tones[status]}>{status}</AdminStatusBadge></td>
                <td className="tabular-nums">{meal.served === null ? "Updating count…" : meal.served.toLocaleString()}</td>
                <td><div className="flex flex-wrap gap-2">
                  <button className={reviewSecondaryButtonClass} aria-label={`Edit ${meal.name}`} onClick={() => setForm(meal)}>Edit</button>
                  <button className={reviewSecondaryButtonClass} aria-label={`${meal.active ? "Deactivate" : "Activate"} ${meal.name}`} onClick={() => { setError(""); setAction({ meal, kind: meal.active ? "deactivate" : "activate" }); }}>{meal.active ? "Deactivate" : "Activate"}</button>
                  <button className={reviewSecondaryButtonClass} aria-label={`History for ${meal.name}`} onClick={() => setHistoryId(meal._id)}>History</button>
                  <button className={reviewDangerButtonClass} disabled={meal.served === null || meal.served > 0} title={meal.served === null ? "Wait for the collection count to finish updating." : meal.served > 0 ? "Deactivate this meal to preserve collection history." : undefined} aria-label={`Remove ${meal.name}`} onClick={() => { setError(""); setAction({ meal, kind: "remove" }); }}>Remove</button>
                </div>{meal.served !== null && meal.served > 0 && <p className="mt-2 text-sm text-muted">Collection history is preserved. Deactivate to stop serving.</p>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
    {selectedMeal && <MealHistory key={selectedMeal._id} meal={selectedMeal} sessionToken={sessionToken} />}
    {form && <MealForm meal={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={setNotice} />}
    {action && <MealDialog title={`${action.kind === "remove" ? "Remove" : action.kind === "activate" ? "Activate" : "Deactivate"} ${action.meal.name}?`} onClose={() => setAction(null)} busy={busy}>
      <p>{action.kind === "remove" ? "This removes the unused meal permanently. A meal with collection history cannot be removed." : action.kind === "activate" ? "This meal will be available during its serving window. Its schedule must not overlap another enabled meal." : "This stops new collections for this meal. Its schedule and collection history will be preserved."}</p>
      {error && <p role="alert" className="admin-callout admin-callout--alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3">
        <button className={reviewSecondaryButtonClass} disabled={busy} onClick={() => setAction(null)}>Cancel</button>
        <button className={action.kind === "remove" ? reviewDangerButtonClass : reviewPrimaryButtonClass} disabled={busy} onClick={() => void confirmAction()}>{busy ? "Updating…" : action.kind === "remove" ? "Remove meal" : action.kind === "activate" ? "Activate meal" : "Deactivate meal"}</button>
      </div>
    </MealDialog>}
  </>;
}

export function MealsPage() {
  const { sessionToken, staff } = useAdminAuth();
  const [retry, setRetry] = useState(0);
  if (!sessionToken || staff?.role !== "admin") return null;
  return <section aria-labelledby="meals-heading" className="space-y-6">
    <ErrorBoundary key={retry} fallback={<><AdminPageHeader id="meals-heading" title="Meals" eyebrow="The Symposium · Meals" /><QueryErrorState title="Unable to load meals" onRetry={() => setRetry((value) => value + 1)} /></>}>
      <MealManagement sessionToken={sessionToken} />
    </ErrorBoundary>
  </section>;
}
