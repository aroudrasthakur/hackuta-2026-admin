import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "../convex/reactBindings";
import { createMealPeriodRef, updateMealPeriodRef, type AdminMeal } from "../convex/mealsApi";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { userFacingErrorMessage } from "../lib/userFacingError";
import { reviewPrimaryButtonClass, reviewSecondaryButtonClass } from "../lib/reviewButtonClasses";
import { MealDialog } from "./MealDialog";
import { localDateTime } from "../lib/dateFormat";

export function MealForm({ meal, onClose, onSaved }: {
  meal?: AdminMeal | undefined; onClose: () => void; onSaved: (message: string) => void;
}) {
  const { sessionToken } = useAdminAuth();
  const create = useMutation(createMealPeriodRef);
  const update = useMutation(updateMealPeriodRef);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(meal?.active ?? true);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !sessionToken) return;
    const data = new FormData(event.currentTarget);
    const startsAt = new Date(String(data.get("startsAt"))).getTime();
    const endsAt = new Date(String(data.get("endsAt"))).getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) {
      setError("Choose an end time after the start time."); return;
    }
    submitting.current = true;
    setBusy(true); setError("");
    const args = { sessionToken, name: String(data.get("name")), description: String(data.get("description")),
      startsAt, endsAt, active: data.get("active") === "on" };
    try {
      if (meal) await update({ ...args, mealPeriodId: meal._id });
      else await create(args);
      onSaved(meal ? "Meal updated." : "Meal created."); onClose();
    } catch (caught) {
      setError(userFacingErrorMessage(caught, "We couldn't save this meal. Please try again."));
    } finally { submitting.current = false; setBusy(false); }
  }
  return <MealDialog title={meal ? "Edit meal" : "Create meal"} onClose={onClose} busy={busy}>
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <label className="meal-field">Meal name<input name="name" required maxLength={100} defaultValue={meal?.name} autoFocus /></label>
        <label className="meal-field">Description <span className="font-normal text-muted">(optional)</span><textarea name="description" maxLength={1000} rows={3} defaultValue={meal?.description} /></label>
        <p className="text-sm text-muted">Times are in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="meal-field">Starts at<input name="startsAt" type="datetime-local" required defaultValue={meal ? localDateTime(meal.startsAt) : ""} /></label>
          <label className="meal-field">Ends at<input name="endsAt" type="datetime-local" required defaultValue={meal ? localDateTime(meal.endsAt) : ""} /></label>
        </div>
        <label className="flex min-h-11 items-center gap-3"><input name="active" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-4 accent-ocean" />Enable during serving window</label>
        {meal?.active && !enabled && <label className="flex min-h-11 items-center gap-3"><input type="checkbox" required className="size-4 accent-ocean" />Confirm deactivation. New collections for this meal will stop.</label>}
        <p className="text-sm text-muted">Enabled meals cannot have overlapping serving windows.</p>
      </fieldset>
      {error && <p role="alert" className="admin-callout admin-callout--alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" disabled={busy} className={reviewSecondaryButtonClass} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy} className={reviewPrimaryButtonClass}>{busy ? "Saving…" : "Save meal"}</button>
      </div>
    </form>
  </MealDialog>;
}
