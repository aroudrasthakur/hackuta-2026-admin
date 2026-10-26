import { useState } from "react";
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
function ScanWorkflow({ purpose, eventId }: { purpose: ScanPurpose; eventId?: GenericId<"events"> }) {
  const { state, scan, confirm, reset } = useScanWorkflow(purpose, eventId);
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

/** Volunteer scanner for check-in, food, or event points. Route guards already require the matching access. */
export function VolunteerScanPage({ workflow }: { workflow: ScanWorkflowName }) {
  const page = PAGES[workflow];
  const options = useVolunteerAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const [choosingEvent, setChoosingEvent] = useState(false);

  if (!options) return <LoadingState message="Loading your scan access…" />;

  const points = page.purpose === "point_scan";
  const requestedEventId = searchParams.get("event");
  const selectedEvent = points
    ? options.events.find((event) => event.eventId === requestedEventId) ??
      (requestedEventId === null && options.events.length === 1 ? options.events[0] : undefined)
    : undefined;
  const showPicker = points && (!selectedEvent || choosingEvent);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl text-ink">{page.title}</h1>
        <p className="mt-1 text-base text-ocean">{page.lead}</p>
      </div>

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

      {points && !selectedEvent ? (
        <p className="admin-callout text-base">Choose an event to start scanning.</p>
      ) : showPicker ? null : (
        <ScanWorkflow
          key={`${page.purpose}:${selectedEvent?.eventId ?? ""}`}
          purpose={page.purpose}
          {...(selectedEvent ? { eventId: selectedEvent.eventId } : {})}
        />
      )}

      <Link className="inline-block py-3 font-semibold" to={ADMIN_ROUTES.scan}>Back to volunteer dashboard</Link>
    </div>
  );
}
