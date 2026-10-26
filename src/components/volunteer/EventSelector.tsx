import type { VolunteerScanOptions } from "../../convex/adminApi";

type AssignedEvent = VolunteerScanOptions["events"][number];

/** Assigned active events as large radio cards. Point values come from the server and cannot be edited. */
export function EventSelector({
  events,
  selectedEventId,
  onSelect,
}: {
  events: readonly AssignedEvent[];
  selectedEventId: string | null;
  onSelect: (eventId: AssignedEvent["eventId"]) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-lg font-semibold text-night">Choose your event</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {events.map((event) => {
          const selected = event.eventId === selectedEventId;
          return (
            <label
              key={event.eventId}
              className={`admin-card flex min-h-16 cursor-pointer items-center gap-4 p-4 ${selected ? "ring-2 ring-ocean" : ""}`}
            >
              <input
                type="radio"
                name="scan-event"
                className="h-6 w-6 flex-none accent-ocean"
                value={event.eventId}
                checked={selected}
                onChange={() => onSelect(event.eventId)}
              />
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-night">{event.name}</span>
                <span className="block text-base text-ocean">{event.pointsAwarded} points per participant</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
