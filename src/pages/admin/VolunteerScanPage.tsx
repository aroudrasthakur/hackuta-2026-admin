import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { GenericId } from "convex/values";
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
import { listActiveMealPeriodsRef, type VolunteerMealPeriod } from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useMealClock } from "../../hooks/useMealClock";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { QueryErrorState } from "../../components/states/QueryErrorState";

export type ScanWorkflowName = "check-in" | "food" | "points";

const PAGES: Record<ScanWorkflowName, { purpose: ScanPurpose; title: string; lead: string }> = {
  "check-in": {
    purpose: "check_in",
    title: "Participant Check-in",
    lead: "Scan a participant's QR code, confirm their name, then check them in.",
  },
  food: {
    purpose: "food_check_in",
    title: "Food Distribution",
    lead: "Scan a participant's QR code, check dietary restrictions, then confirm food distribution.",
  },
  points: {
    purpose: "point_scan",
    title: "Event Points",
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
    <ol aria-label="Scan progress" className="volunteer-steps">
      {STEPS.map((label, index) => {
        const className =
          index === current
            ? "volunteer-steps__item volunteer-steps__item--current"
            : index < current
              ? "volunteer-steps__item volunteer-steps__item--done"
              : "volunteer-steps__item";
        return (
          <li key={label} aria-current={index === current ? "step" : undefined} className={className}>
            {index + 1}. {label}
          </li>
        );
      })}
    </ol>
  );
}

/** One scan → confirm → result loop. Keyed by purpose and event so a change clears all participant state. */
function ScanWorkflow({ purpose, eventId, mealPeriodId, onConfirming, onReset, onPhaseChange }: {
  purpose: ScanPurpose; eventId?: GenericId<"events">; mealPeriodId?: GenericId<"mealPeriods">;
  onConfirming?: () => void; onReset?: () => void;
  onPhaseChange?: (locked: boolean) => void;
}) {
  const { state, scan, confirm, reset } = useScanWorkflow(purpose, eventId, mealPeriodId);
  const [cameraPreferred, setCameraPreferred] = useState(false);
  const locked =
    state.step === "confirm" || state.step === "result" || state.step === "resolving";

  useEffect(() => {
    onPhaseChange?.(locked);
    return () => onPhaseChange?.(false);
  }, [locked, onPhaseChange]);

  const onScan = (rawValue: string, source: ScanSource) => {
    setCameraPreferred(source === "camera");
    void scan(rawValue);
  };
  const resetWorkflow = () => { reset(); onReset?.(); };

  return (
    <div className="space-y-5">
      <ScanSteps current={stepIndex(state)} />
      {state.step === "scan" ? <QrScanner onScan={onScan} autoStart={cameraPreferred} /> : null}
      {state.step === "resolving" ? (
        <div className="space-y-3">
          <LoadingState message="Looking up participant…" />
          <button type="button" className={scanSecondaryButtonClass} onClick={resetWorkflow}>Cancel</button>
        </div>
      ) : null}
      {state.step === "confirm" ? (
        <ScanConfirmation
          preview={state.preview}
          submitting={state.submitting}
          error={state.error}
          onConfirm={() => { onConfirming?.(); void confirm(); }}
          onCancel={resetWorkflow}
        />
      ) : null}
      {state.step === "result" ? (
        <ScanResult
          outcome={state.outcome}
          onScanNext={resetWorkflow}
          {...(state.outcome.tone === "error" ? { onRetry: resetWorkflow } : {})}
        />
      ) : null}
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
  const [phaseLocked, setPhaseLocked] = useState(false);
  // A confirmed request may already have committed. Keep its response visible
  // through availability changes until the volunteer acknowledges the result.
  const [confirmedMeal, setConfirmedMeal] = useState<VolunteerMealPeriod | null>(null);
  if (meals === undefined) return <LoadingState message="Loading available meals…" />;
  const available = meals.filter((meal) => now >= meal.startsAt && now < meal.endsAt);
  const requested = searchParams.get("meal");
  const selected = confirmedMeal ?? available.find((meal) => meal.mealPeriodId === requested) ??
    (requested === null && available.length === 1 ? available[0] : undefined);
  if (available.length === 0 && !confirmedMeal) {
    return <EmptyState title="No meals available" description="No meal is being served right now. Availability will update when serving begins or an administrator changes the schedule." />;
  }
  if (!selected || (choosing && !phaseLocked)) {
    return <>
      {requested && !selected && <p role="status" className="admin-callout">The selected meal is no longer available. Choose a meal to continue.</p>}
      <fieldset className="space-y-3" disabled={phaseLocked}>
        <legend className="volunteer-section-label">Choose your meal</legend>
        {available.map((meal) => (
          <label key={meal.mealPeriodId} className="volunteer-event-card">
            <input
              type="radio"
              name="scan-meal"
              className="volunteer-event-card__radio"
              checked={selected?.mealPeriodId === meal.mealPeriodId}
              onChange={() => {
                setChoosing(false);
                setSearchParams({ meal: meal.mealPeriodId }, { replace: true });
              }}
            />
            <span className="min-w-0">
              <span className="volunteer-event-card__name">{meal.name}</span>
              <span className="volunteer-event-card__points">
                Serving until {new Date(meal.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {choosing && selected && (
        <button type="button" className={scanSecondaryButtonClass} onClick={() => setChoosing(false)}>
          Keep {selected.name}
        </button>
      )}
    </>;
  }
  return <>
    <div className="volunteer-selected-context">
      <p>
        <span className="volunteer-selected-context__kicker">Serving meal</span>
        <span className="volunteer-selected-context__title">{selected.name}</span>
      </p>
      {available.length > 1 && !confirmedMeal && !phaseLocked ? (
        <button type="button" className={scanSecondaryButtonClass} onClick={() => setChoosing(true)}>
          Change meal
        </button>
      ) : null}
    </div>
    {confirmedMeal && !available.some((meal) => meal.mealPeriodId === selected.mealPeriodId) &&
      <p role="status" className="admin-callout">This meal is no longer available for new scans. The collection result will remain here until you continue.</p>}
    <ScanWorkflow
      key={`${selected.mealPeriodId}:${selected.name}:${selected.startsAt}:${selected.endsAt}:${selected.updatedAt}`}
      purpose="food_check_in"
      mealPeriodId={selected.mealPeriodId}
      onConfirming={() => setConfirmedMeal(selected)}
      onReset={() => setConfirmedMeal(null)}
      onPhaseChange={setPhaseLocked}
    />
  </>;
}

/** Volunteer scanner for check-in, food, or event points. Route guards already require the matching access. */
export function VolunteerScanPage({ workflow }: { workflow: ScanWorkflowName }) {
  const page = PAGES[workflow];
  const options = useVolunteerAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const [choosingEvent, setChoosingEvent] = useState(false);
  const [mealRetry, setMealRetry] = useState(0);
  const [phaseLocked, setPhaseLocked] = useState(false);

  if (!options) return <LoadingState message="Loading your scan access…" />;

  const points = page.purpose === "point_scan";
  const requestedEventId = searchParams.get("event");
  const selectedEvent = points
    ? options.events.find((event) => event.eventId === requestedEventId) ??
      (requestedEventId === null && options.events.length === 1 ? options.events[0] : undefined)
    : undefined;
  const showPicker = points && (!selectedEvent || (choosingEvent && !phaseLocked));

  return (
    <section aria-labelledby={`${workflow}-scan-heading`} className="volunteer-ops volunteer-scan-shell space-y-6">
      <header className="volunteer-scan__header">
        <h1 id={`${workflow}-scan-heading`} className="volunteer-scan__title">{page.title}</h1>
        <p className="volunteer-scan__lead">{page.lead}</p>
      </header>

      {showPicker ? (
        <EventSelector
          events={options.events}
          selectedEventId={selectedEvent?.eventId ?? null}
          locked={phaseLocked}
          onSelect={(eventId) => {
            setChoosingEvent(false);
            setSearchParams({ event: eventId }, { replace: true });
          }}
        />
      ) : null}
      {points && selectedEvent && !showPicker ? (
        <div className="volunteer-selected-context">
          <p>
            <span className="volunteer-selected-context__kicker">Scanning for</span>
            <span className="volunteer-selected-context__title">{selectedEvent.name}</span>
            <span className="volunteer-selected-context__meta"> · {selectedEvent.pointsAwarded} points</span>
          </p>
          {options.events.length > 1 && !phaseLocked ? (
            <button type="button" className={scanSecondaryButtonClass} onClick={() => setChoosingEvent(true)}>
              Change event
            </button>
          ) : null}
        </div>
      ) : null}

      {workflow === "food" ? (
        <ErrorBoundary
          key={mealRetry}
          fallback={<QueryErrorState title="Unable to load available meals" onRetry={() => setMealRetry((value) => value + 1)} />}
        >
          <FoodMealScanner />
        </ErrorBoundary>
      ) : points && !selectedEvent ? (
        <p className="admin-callout text-base">Choose an event to start scanning.</p>
      ) : showPicker ? null : (
        <ScanWorkflow
          key={`${page.purpose}:${selectedEvent?.eventId ?? ""}`}
          purpose={page.purpose}
          {...(selectedEvent ? { eventId: selectedEvent.eventId } : {})}
          onPhaseChange={setPhaseLocked}
        />
      )}

      <Link className="volunteer-back-link" to={ADMIN_ROUTES.scan}>Back to volunteer dashboard</Link>
    </section>
  );
}
