import type { VolunteerScanOptions } from "../../convex/adminApi";
import { eventStatus } from "../../../shared/admin/volunteerRules";
import { useNow } from "../../hooks/useNow";

type AssignedEvent = VolunteerScanOptions["events"][number];

const STATUS_LABEL = {
  active: "Active",
  upcoming: "Upcoming",
  ended: "Ended",
  inactive: "Switched off",
} as const;

/** Assigned active events as large selectable cards. Point values come from the server. */
export function EventSelector({
  events,
  selectedEventId,
  onSelect,
  locked = false,
}: {
  events: readonly AssignedEvent[];
  selectedEventId: string | null;
  onSelect: (eventId: AssignedEvent["eventId"]) => void;
  /** When true (e.g. during confirmation), selection cannot change. */
  locked?: boolean;
}) {
  const now = useNow();

  return (
    <fieldset className="volunteer-event-selector" disabled={locked}>
      <legend className="volunteer-section-label">Choose your event</legend>
      <div className="volunteer-event-selector__list" role="presentation">
        {events.map((event) => {
          const selected = event.eventId === selectedEventId;
          const status = eventStatus({ ...event, active: true }, now);
          return (
            <label
              key={event.eventId}
              className={`volunteer-event-card${selected ? " volunteer-event-card--selected" : ""}`}
            >
              <input
                type="radio"
                name="scan-event"
                className="volunteer-event-card__radio"
                value={event.eventId}
                checked={selected}
                disabled={locked}
                onChange={() => onSelect(event.eventId)}
              />
              <span className="min-w-0">
                <span className="volunteer-event-card__name">{event.name}</span>
                <span className="volunteer-event-card__points">
                  {event.pointsAwarded} points per participant
                </span>
              </span>
              <span className={`volunteer-event-card__status volunteer-event-card__status--${status}`}>
                {STATUS_LABEL[status]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
