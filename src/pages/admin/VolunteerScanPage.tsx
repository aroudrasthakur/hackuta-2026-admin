import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { GenericId } from "convex/values";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { EventSelector } from "../../components/volunteer/EventSelector";
import { QrScanner, type ScanSource } from "../../components/volunteer/QrScanner";
import { ScanConfirmation } from "../../components/volunteer/ScanConfirmation";
import { ScanResult } from "../../components/volunteer/ScanResult";
import { LoadingState } from "../../components/states/LoadingState";
import { useScanWorkflow, type ScanWorkflowState } from "../../hooks/useScanWorkflow";
import { useVolunteerAccess } from "../../hooks/useVolunteerAccess";
import type { ScanPurpose } from "../../lib/scanResults";
import { scanSecondaryButtonClass } from "../../lib/scanButtonClasses";
import { ADMIN_ROUTES } from "../../types/routes";
import { useQuery } from "../../convex/reactBindings";
import { listActiveMealPeriodsRef } from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useMealClock } from "../../hooks/useMealClock";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { QueryErrorState } from "../../components/states/QueryErrorState";

export type ScanWorkflowName = "check-in" | "food" | "points";

const PAGES: Record<ScanWorkflowName, { purpose: ScanPurpose; title: string; lead: string }> = {
  "check-in": {
    purpose: "check_in",
    title: "Participant check-in",
    lead: "Scan a participant's QR code, confirm their name, then check them in.",
  },
  food: {
    purpose: "food_check_in",
    title: "Food",
    lead: "Scan a participant's QR code, check dietary restrictions, then confirm food distribution.",
  },
  points: {
    purpose: "point_scan",
    title: "Points",
    lead: "Choose your event, scan a participant's QR code, then confirm the award.",
  },
};

const STEPS = ["Scan", "Confirm", "Done"] as const;

function stepIndex(state: ScanWorkflowState) {
  if (state.step === "confirm") return 1;
  if (state.step === "result") return 2;
  return 0;
}

function ScanSteps({ current }: { current: number }) {
  return (
    <ol aria-label="Scan progress" className="grid grid-cols-3 gap-2 text-center text-sm font-semibold">
      {STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={`rounded-lg border px-2 py-2 ${index === current ? "border-ocean bg-ocean text-light" : index < current ? "border-ocean/40 bg-white text-ocean" : "border-sand bg-white/60 text-mist"}`}
        >
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

/** One scan → confirm → result loop. Keyed by purpose and event so a change clears all participant state. */
function ScanWorkflow({ purpose, eventId, mealPeriodId }: { purpose: ScanPurpose; eventId?: GenericId<"events">; mealPeriodId?: GenericId<"mealPeriods"> }) {
  const { state, scan, confirm, reset } = useScanWorkflow(purpose, eventId, mealPeriodId);
  const [cameraPreferred, setCameraPreferred] = useState(false);

  const onScan = (rawValue: string, source: ScanSource) => {
    setCameraPreferred(source === "camera");
    void scan(rawValue);
  };

  return (
    <div className="space-y-5">
      <ScanSteps current={stepIndex(state)} />
      {state.step === "scan" ? <QrScanner onScan={onScan} autoStart={cameraPreferred} /> : null}
      {state.step === "resolving" ? (
        <div className="space-y-3">
          <LoadingState message="Looking up participant…" />
          <button type="button" className={scanSecondaryButtonClass} onClick={reset}>Cancel</button>
        </div>
      ) : null}
      {state.step === "confirm" ? (
        <ScanConfirmation
          preview={state.preview}
          submitting={state.submitting}
          error={state.error}
          onConfirm={() => void confirm()}
          onCancel={reset}
        />
      ) : null}
      {state.step === "result" ? <ScanResult outcome={state.outcome} onScanNext={reset} /> : null}
    </div>
  );
}

/** Availability reacts to admin edits and the clock; changing meals drops the previous participant and QR. */
function FoodMealScanner() {
  const { sessionToken } = useAdminAuth();
  const meals = useQuery(listActiveMealPeriodsRef, sessionToken ? { sessionToken } : "skip");
  const now = useMealClock(meals);
  const [searchParams, setSearchParams] = useSearchParams();
  const [choosing, setChoosing] = useState(false);
  if (meals === undefined) return <LoadingState message="Loading available meals…" />;
  const available = meals.filter((meal) => now >= meal.startsAt && now < meal.endsAt);
  const requested = searchParams.get("meal");
  const selected = available.find((meal) => meal.mealPeriodId === requested) ??
    (requested === null && available.length === 1 ? available[0] : undefined);
  if (available.length === 0) return <EmptyState title="No meals available" description="No meal is being served right now. Availability will update when serving begins or an administrator changes the schedule." />;
  if (!selected || choosing) return <>
    {requested && !selected && <p role="status" className="admin-callout">The selected meal is no longer available. Choose a meal to continue.</p>}
    <fieldset className="space-y-3">
      <legend className="mb-2 text-lg font-semibold text-night">Choose your meal</legend>
      {available.map((meal) => <label key={meal.mealPeriodId} className="admin-card flex min-h-16 cursor-pointer items-center gap-4 p-4">
        <input type="radio" name="scan-meal" className="h-6 w-6 flex-none accent-ocean" checked={selected?.mealPeriodId === meal.mealPeriodId}
          onChange={() => { setChoosing(false); setSearchParams({ meal: meal.mealPeriodId }, { replace: true }); }} />
        <span className="min-w-0"><span className="block text-lg font-semibold text-night">{meal.name}</span>
          <span className="block text-base text-ocean">Serving until {new Date(meal.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></span>
      </label>)}
    </fieldset>
  </>;
  return <>
    <div className="admin-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-lg"><span className="block text-sm font-semibold uppercase tracking-wide text-ocean">Serving meal</span>
        <span className="text-2xl font-semibold text-night">{selected.name}</span></p>
      {available.length > 1 && <button type="button" className={scanSecondaryButtonClass} onClick={() => setChoosing(true)}>Change meal</button>}
    </div>
    <ScanWorkflow key={`${selected.mealPeriodId}:${selected.name}:${selected.startsAt}:${selected.endsAt}:${selected.updatedAt}`}
      purpose="food_check_in" mealPeriodId={selected.mealPeriodId} />
  </>;
}

/** Volunteer scanner for check-in, food, or event points. Route guards already require the matching access. */
export function VolunteerScanPage({ workflow }: { workflow: ScanWorkflowName }) {
  const page = PAGES[workflow];
  const options = useVolunteerAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const [choosingEvent, setChoosingEvent] = useState(false);
  const [mealRetry, setMealRetry] = useState(0);

  if (!options) return <LoadingState message="Loading your scan access…" />;

  const points = page.purpose === "point_scan";
  const requestedEventId = searchParams.get("event");
  const selectedEvent = points
    ? options.events.find((event) => event.eventId === requestedEventId) ??
      (requestedEventId === null && options.events.length === 1 ? options.events[0] : undefined)
    : undefined;
  const showPicker = points && (!selectedEvent || choosingEvent);

  return (
    <section aria-labelledby={`${workflow}-scan-heading`} className="mx-auto max-w-2xl space-y-6">
      <AdminPageHeader id={`${workflow}-scan-heading`} title={page.title} description={page.lead} />

      {showPicker ? (
        <EventSelector
          events={options.events}
          selectedEventId={selectedEvent?.eventId ?? null}
          onSelect={(eventId) => {
            setChoosingEvent(false);
            setSearchParams({ event: eventId }, { replace: true });
          }}
        />
      ) : null}
      {points && selectedEvent && !showPicker ? (
        <div className="admin-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg">
            <span className="block text-sm font-semibold uppercase tracking-wide text-ocean">Scanning for</span>
            <span className="font-semibold text-night">{selectedEvent.name}</span>
            <span className="text-ocean"> · {selectedEvent.pointsAwarded} points</span>
          </p>
          {options.events.length > 1 ? (
            <button type="button" className={scanSecondaryButtonClass} onClick={() => setChoosingEvent(true)}>
              Change event
            </button>
          ) : null}
        </div>
      ) : null}

      {workflow === "food" ? <ErrorBoundary key={mealRetry} fallback={<QueryErrorState title="Unable to load available meals" onRetry={() => setMealRetry((value) => value + 1)} />}><FoodMealScanner /></ErrorBoundary> : points && !selectedEvent ? (
        <p className="admin-callout text-base">Choose an event to start scanning.</p>
      ) : showPicker ? null : (
        <ScanWorkflow
          key={`${page.purpose}:${selectedEvent?.eventId ?? ""}`}
          purpose={page.purpose}
          {...(selectedEvent ? { eventId: selectedEvent.eventId } : {})}
        />
      )}

      <Link className="inline-block py-3 font-semibold" to={ADMIN_ROUTES.scan}>Back to volunteer dashboard</Link>
    </section>
  );
}
