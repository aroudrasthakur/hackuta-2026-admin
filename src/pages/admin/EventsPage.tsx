import { useState, type FormEvent } from "react";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { EventStatusBadge } from "../../components/admin/EventStatusBadge";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { useMutation, usePaginatedQuery } from "../../convex/reactBindings";
import {
  createEventRef,
  listEventsRef,
  setEventActiveRef,
  setEventPointsRef,
  updateEventRef,
  type AdminEventRow,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNow } from "../../hooks/useNow";
import {
  reviewPrimaryButtonClass,
  reviewSecondaryButtonClass,
} from "../../lib/reviewButtonClasses";
import { formatLogTime, fromDateTimeInputValue, toDateTimeInputValue } from "../../lib/staffLogFormat";
import { reportUserFacingError } from "../../lib/userFacingError";
import {
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_NAME_MAX_LENGTH,
  EVENT_POINTS_MAX,
} from "../../../shared/admin/volunteerRules";

type EventDraft = { name: string; description: string; pointsAwarded: string; startsAt: string; endsAt: string };
type EventInput = { name: string; description?: string; pointsAwarded: number; startsAt: number; endsAt: number };
type Feedback = { tone: "error" | "success"; message: string } | null;

const PAGE_SIZE = 25;
const EMPTY_DRAFT: EventDraft = { name: "", description: "", pointsAwarded: "", startsAt: "", endsAt: "" };

function draftFromEvent(event: AdminEventRow): EventDraft {
  return {
    name: event.name,
    description: event.description ?? "",
    pointsAwarded: String(event.pointsAwarded),
    startsAt: toDateTimeInputValue(event.startsAt),
    endsAt: toDateTimeInputValue(event.endsAt),
  };
}

/** Field-level messages for the rules in `normalizeEventInput`; the server validates again. */
function parseDraft(draft: EventDraft): EventInput | string {
  const name = draft.name.trim();
  if (!name) return "Enter an event name.";
  if (name.length > EVENT_NAME_MAX_LENGTH) return `Keep the event name under ${EVENT_NAME_MAX_LENGTH} characters.`;
  if (draft.description.trim().length > EVENT_DESCRIPTION_MAX_LENGTH) {
    return `Keep the description under ${EVENT_DESCRIPTION_MAX_LENGTH} characters.`;
  }
  const pointsAwarded = Number(draft.pointsAwarded);
  if (!Number.isSafeInteger(pointsAwarded) || pointsAwarded <= 0 || pointsAwarded > EVENT_POINTS_MAX) {
    return `Points must be a whole number from 1 to ${EVENT_POINTS_MAX.toLocaleString()}.`;
  }
  const startsAt = fromDateTimeInputValue(draft.startsAt);
  const endsAt = fromDateTimeInputValue(draft.endsAt);
  if (startsAt === null || endsAt === null) return "Enter a start and end time.";
  if (startsAt >= endsAt) return "The event must end after it starts.";
  const description = draft.description.trim();
  return { name, pointsAwarded, startsAt, endsAt, ...(description ? { description } : {}) };
}

function EventForm({ idPrefix, initial, pointsLocked = false, submitLabel, savingLabel, onSubmit, onCancel }: {
  idPrefix: string;
  initial: EventDraft;
  pointsLocked?: boolean;
  submitLabel: string;
  savingLabel: string;
  onSubmit: (input: EventInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = (field: keyof EventDraft) => (event: { target: { value: string } }) => {
    setError(null);
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const parsed = parseDraft(draft);
    if (typeof parsed === "string") {
      setError(parsed);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)} noValidate>
      {error ? <p role="alert" className="admin-callout admin-callout--alert sm:col-span-2">{error}</p> : null}
      <label className="admin-field sm:col-span-2" htmlFor={`${idPrefix}-name`}>
        Event name
        <input id={`${idPrefix}-name`} className="admin-field__control" value={draft.name} onChange={update("name")} required />
      </label>
      <label className="admin-field sm:col-span-2" htmlFor={`${idPrefix}-description`}>
        Description (optional)
        <textarea id={`${idPrefix}-description`} className="admin-field__control min-h-20 resize-y" value={draft.description} onChange={update("description")} />
      </label>
      <label className="admin-field" htmlFor={`${idPrefix}-points`}>
        Points per participant
        <input
          id={`${idPrefix}-points`}
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          className="admin-field__control"
          value={draft.pointsAwarded}
          onChange={update("pointsAwarded")}
          disabled={pointsLocked}
          aria-describedby={pointsLocked ? `${idPrefix}-points-locked` : undefined}
          required
        />
      </label>
      <div className="flex items-end">
        {pointsLocked ? (
          <p id={`${idPrefix}-points-locked`} className="text-sm text-ocean">
            Points are locked because participants have already received them.
          </p>
        ) : null}
      </div>
      <label className="admin-field" htmlFor={`${idPrefix}-starts`}>
        Starts
        <input id={`${idPrefix}-starts`} type="datetime-local" className="admin-field__control" value={draft.startsAt} onChange={update("startsAt")} required />
      </label>
      <label className="admin-field" htmlFor={`${idPrefix}-ends`}>
        Ends
        <input id={`${idPrefix}-ends`} type="datetime-local" className="admin-field__control" value={draft.endsAt} onChange={update("endsAt")} required />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={saving} className={reviewPrimaryButtonClass}>{saving ? savingLabel : submitLabel}</button>
        {onCancel ? <button type="button" disabled={saving} className={reviewSecondaryButtonClass} onClick={onCancel}>Cancel</button> : null}
      </div>
    </form>
  );
}

function errorMessage(context: string, caught: unknown, fallback: string, source: string) {
  return new Error(reportUserFacingError(context, caught, fallback, { source }));
}

function EventsList({ sessionToken }: { sessionToken: string }) {
  const { results: events, status, loadMore } = usePaginatedQuery(listEventsRef, { sessionToken }, { initialNumItems: PAGE_SIZE });
  const createEvent = useMutation(createEventRef);
  const updateEvent = useMutation(updateEventRef);
  const setEventPoints = useMutation(setEventPointsRef);
  const setEventActive = useMutation(setEventActiveRef);
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function create(input: EventInput) {
    try {
      await createEvent({ sessionToken, ...input });
    } catch (caught) {
      throw errorMessage("Unable to create event", caught, "The event was not created. Please try again.", "EventsPage.create");
    }
    setAdding(false);
    setFeedback({ tone: "success", message: `“${input.name}” was created and switched on.` });
  }

  /** Points first: a locked value fails before the schedule is touched. */
  async function save(event: AdminEventRow, { pointsAwarded, ...schedule }: EventInput) {
    try {
      if (pointsAwarded !== event.pointsAwarded) {
        await setEventPoints({ sessionToken, eventId: event.eventId, pointsAwarded });
      }
      await updateEvent({ sessionToken, eventId: event.eventId, ...schedule });
    } catch (caught) {
      throw errorMessage("Unable to update event", caught, "The event was not changed. Please try again.", "EventsPage.update");
    }
    setEditingId(null);
    setFeedback({ tone: "success", message: `“${schedule.name}” was updated.` });
  }

  async function toggle(event: AdminEventRow) {
    if (togglingId) return;
    setTogglingId(event.eventId);
    setFeedback(null);
    try {
      await setEventActive({ sessionToken, eventId: event.eventId, active: !event.active });
      setFeedback({ tone: "success", message: event.active
        ? `“${event.name}” is switched off. Volunteers can no longer award its points.`
        : `“${event.name}” is switched on. Volunteers can award its points.` });
    } catch (caught) {
      setFeedback({ tone: "error", message: reportUserFacingError(
        "Unable to change event status", caught, "The event status was not changed. Please try again.",
        { source: "EventsPage.toggle" },
      ) });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        feedback.tone === "error"
          ? <p role="alert" className="admin-callout admin-callout--alert">{feedback.message}</p>
          : <p role="status" className="admin-callout">{feedback.message}</p>
      ) : null}

      {adding ? (
        <section aria-labelledby="add-event-heading" className="admin-card admin-card__body space-y-4">
          <h2 id="add-event-heading" className="admin-card__title">Add event</h2>
          <EventForm
            idPrefix="new-event"
            initial={EMPTY_DRAFT}
            submitLabel="Create event"
            savingLabel="Creating…"
            onSubmit={create}
            onCancel={() => setAdding(false)}
          />
        </section>
      ) : (
        <button type="button" className={reviewPrimaryButtonClass} onClick={() => { setFeedback(null); setAdding(true); }}>
          Add event
        </button>
      )}

      {status === "LoadingFirstPage" ? <LoadingState layout="rows" message="Loading events…" /> : events.length === 0 ? (
        <EmptyState title="No events yet" description="Add an event so volunteers can award its points to participants." />
      ) : (
        <ul aria-label="Events" className="space-y-3">
          {events.map((event) => (
            <li key={event.eventId} className="admin-card admin-card__body space-y-3">
              {editingId === event.eventId ? (
                <>
                  <h2 className="admin-card__title">Edit {event.name}</h2>
                  <EventForm
                    idPrefix={`event-${event.eventId}`}
                    initial={draftFromEvent(event)}
                    pointsLocked={event.pointsLocked}
                    submitLabel="Save changes"
                    savingLabel="Saving…"
                    onSubmit={(input) => save(event, input)}
                    onCancel={() => setEditingId(null)}
                  />
                </>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <h2 className="text-lg font-semibold text-night">{event.name}</h2>
                    <p className="text-sm text-ocean">
                      {formatLogTime(event.startsAt)} – {formatLogTime(event.endsAt)} · {event.pointsAwarded} points
                    </p>
                    {event.description ? <p className="text-sm text-night">{event.description}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <EventStatusBadge event={event} now={now} />
                    <button type="button" className={reviewSecondaryButtonClass} onClick={() => { setFeedback(null); setEditingId(event.eventId); }}>
                      Edit<span className="sr-only"> {event.name}</span>
                    </button>
                    <button type="button" disabled={togglingId !== null} className={reviewSecondaryButtonClass} onClick={() => void toggle(event)}>
                      {togglingId === event.eventId ? "Saving…" : event.active ? "Switch off" : "Switch on"}
                      <span className="sr-only"> {event.name}</span>
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(PAGE_SIZE)} className={reviewPrimaryButtonClass}>
            {status === "LoadingMore" ? "Loading events…" : "Load more events"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function EventsPage() {
  const { sessionToken, staff } = useAdminAuth();
  return (
    <section aria-labelledby="events-heading" className="space-y-6">
      <AdminPageHeader
        id="events-heading"
        title="Events"
        description="Create the events volunteers award points for. Points can be awarded while an event is switched on; start and end times are for reference. Assign events to volunteers from the Volunteers page."
      />
      {staff?.role === "admin" && sessionToken ? <EventsList sessionToken={sessionToken} /> : (
        <LoadingState message="Verifying administrator access…" />
      )}
    </section>
  );
}
