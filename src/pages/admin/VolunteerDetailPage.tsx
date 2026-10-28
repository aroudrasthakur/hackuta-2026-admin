import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { GenericId } from "convex/values";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { AdminStatusBadge } from "../../components/AdminStatusBadge";
import { AccessSwitch } from "../../components/admin/AccessSwitch";
import { EventStatusBadge } from "../../components/admin/EventStatusBadge";
import { SectionIcon, type SectionIconName } from "../../components/SectionIcon";
import { VolunteerActivityLog } from "../../components/admin/VolunteerActivityLog";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { useMutation, usePaginatedQuery, useQuery } from "../../convex/reactBindings";
import {
  getVolunteerRef,
  listEventsRef,
  listStaffConfigLogsRef,
  restoreVolunteerRef,
  revokeVolunteerRef,
  setVolunteerCapabilitiesRef,
  setVolunteerEventAccessRef,
  type StaffConfigLogRow,
  type VolunteerRow,
} from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNow } from "../../hooks/useNow";
import {
  reviewDangerButtonClass,
  reviewPrimaryButtonClass,
  reviewSecondaryButtonClass,
} from "../../lib/reviewButtonClasses";
import { formatLogTime, STAFF_CONFIG_LABELS, volunteerPermissionList } from "../../lib/staffLogFormat";
import { reportUserFacingError } from "../../lib/userFacingError";
import { ADMIN_ROUTES } from "../../types/routes";

const HISTORY_PAGE_SIZE = 10;
const EVENTS_PAGE_SIZE = 50;
type VolunteerId = GenericId<"admins">;
type Feedback = { tone: "error" | "success"; message: string } | null;
type FeedbackSection = "events" | "permissions" | "access";
/**
 * Feedback lives in the parent: each section is keyed on the saved values, so
 * a successful save remounts it with the server's new state.
 */
type SectionProps = {
  sessionToken: string;
  volunteer: VolunteerRow;
  feedback: Feedback;
  setFeedback: (feedback: Feedback) => void;
};

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return feedback.tone === "error"
    ? <p role="alert" className="admin-callout admin-callout--alert">{feedback.message}</p>
    : <p role="status" className="admin-callout">{feedback.message}</p>;
}

function EventAssignments({ sessionToken, volunteer, feedback, setFeedback }: SectionProps) {
  const { results: events, status, loadMore } = usePaginatedQuery(listEventsRef, { sessionToken }, { initialNumItems: EVENTS_PAGE_SIZE });
  const now = useNow();
  const assigned: string[] = volunteer.events.map((event) => event.eventId);
  const [selected, setSelected] = useState<string[]>(assigned);
  const [allEvents, setAllEvents] = useState(volunteer.canScanAllEvents);
  const [saving, setSaving] = useState(false);
  const save = useMutation(setVolunteerEventAccessRef);
  const changed = allEvents !== volunteer.canScanAllEvents
    || selected.length !== assigned.length
    || selected.some((eventId) => !assigned.includes(eventId));

  function setAll(checked: boolean) {
    setFeedback(null);
    setAllEvents(checked);
    if (checked) setSelected(events.map((event) => event.eventId));
  }

  function toggle(eventId: string, checked: boolean) {
    setFeedback(null);
    setAllEvents(false);
    setSelected((current) => checked ? [...current, eventId] : current.filter((id) => id !== eventId));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !changed) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await save({
        sessionToken,
        volunteerAdminId: volunteer.adminId,
        eventIds: selected as Array<VolunteerRow["events"][number]["eventId"]>,
        canScanAllEvents: allEvents,
      });
      setFeedback({
        tone: "success",
        message: allEvents
          ? "This volunteer can award points for every event, including ones added later."
          : `Event assignments saved (${result.added} added, ${result.removed} removed).`,
      });
    } catch (caught) {
      setFeedback({ tone: "error", message: reportUserFacingError(
        "Unable to save event assignments", caught,
        "Event assignments were not changed. Please try again.",
        { source: "VolunteerDetailPage.saveEvents" },
      ) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form aria-labelledby="volunteer-events-heading" className="admin-card admin-card__body flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <div>
        <h2 id="volunteer-events-heading" className="admin-card__title">Event assignments</h2>
        <p className="admin-page-lead">
          Switch on the events this volunteer can award points for. Points only work while an event is switched on. Start and end times are for reference.
        </p>
      </div>
      <FeedbackMessage feedback={feedback} />
      <ul className="admin-access-list" aria-label="Event preferences">
        <li className="admin-access-row">
          <span className="admin-access-row__icon" aria-hidden="true"><SectionIcon name="events" /></span>
          <div className="min-w-0">
            <p className="admin-access-row__title">
              All events
              {allEvents
                ? <AdminStatusBadge tone="positive">{volunteer.canScanAllEvents ? "Allowed" : "Allowed after saving"}</AdminStatusBadge>
                : volunteer.canScanAllEvents
                  ? <AdminStatusBadge tone="warning">Removed after saving</AdminStatusBadge>
                  : <AdminStatusBadge tone="neutral">Specific events only</AdminStatusBadge>}
            </p>
            <p className="admin-access-row__description">
              Award points for every current event and any event added later.
            </p>
          </div>
          <div className="admin-access-row__control">
            <AccessSwitch
              label="All events"
              checked={allEvents}
              disabled={saving || !volunteer.active}
              onChange={setAll}
            />
          </div>
        </li>
      </ul>
      {status === "LoadingFirstPage" ? <LoadingState message="Loading events…" /> : events.length === 0 ? (
        <p className="text-sm text-ocean">
          No events exist yet. <Link className="font-semibold text-night underline" to={ADMIN_ROUTES.events}>Create an event</Link> first.
          {allEvents ? " All-events access will include them when they are created." : null}
        </p>
      ) : (
        <>
          <p className="text-sm font-semibold text-night">
            {allEvents
              ? "All events assigned, including ones added later."
              : `${selected.length} of ${events.length} events assigned`}
          </p>
          <ul className="admin-access-list" aria-label="Events">
            {events.map((event) => (
              <li key={event.eventId} className="admin-access-row">
                <span className="admin-access-row__icon" aria-hidden="true"><SectionIcon name="events" /></span>
                <div className="min-w-0">
                  <p className="admin-access-row__title">
                    {event.name}
                    <EventStatusBadge event={event} now={now} />
                  </p>
                  <p className="admin-access-row__description">{event.pointsAwarded} points per participant</p>
                </div>
                <div className="admin-access-row__control">
                  <AccessSwitch
                    label={`Assign ${event.name}`}
                    checked={allEvents || selected.includes(event.eventId)}
                    disabled={saving || allEvents}
                    onChange={(checked) => toggle(event.eventId, checked)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(EVENTS_PAGE_SIZE)} className={reviewSecondaryButtonClass}>
          {status === "LoadingMore" ? "Loading events…" : "Load more events"}
        </button>
      ) : null}
      {!volunteer.active ? <p className="text-sm text-ocean">Restore this volunteer's access before assigning new events.</p> : null}
      <div className="admin-access-footer">
        <button type="submit" disabled={saving || !changed} className={reviewPrimaryButtonClass}>
          {saving ? "Saving…" : "Save event assignments"}
        </button>
        {changed && !saving ? <p className="text-sm font-semibold text-ocean">Unsaved changes</p> : null}
      </div>
    </form>
  );
}

type Capabilities = { canCheckIn: boolean; canFoodCheckIn: boolean; canRedeemShop: boolean };

const ACCESS_ROWS: Array<{ key: keyof Capabilities; title: string; description: string; icon: SectionIconName }> = [
  { key: "canCheckIn", title: "Participant check-in", icon: "checkIn", description: "Scan a registration QR, hand over a badge, and check the participant in." },
  { key: "canFoodCheckIn", title: "Food distribution", icon: "food", description: "Scan badges and record meals." },
  { key: "canRedeemShop", title: "Shop redemption", icon: "shop", description: "Scan badges and sell shop items for points." },
];

function accessBadge(allowed: boolean, saved: boolean) {
  if (allowed === saved) {
    return allowed
      ? <AdminStatusBadge tone="positive">Allowed</AdminStatusBadge>
      : <AdminStatusBadge tone="neutral">Not allowed</AdminStatusBadge>;
  }
  return <AdminStatusBadge tone="warning">{allowed ? "Allowed after saving" : "Removed after saving"}</AdminStatusBadge>;
}

function VolunteerAccess({ sessionToken, volunteer, feedback, setFeedback }: SectionProps) {
  const saved: Capabilities = {
    canCheckIn: volunteer.canCheckIn,
    canFoodCheckIn: volunteer.canFoodCheckIn,
    canRedeemShop: volunteer.canRedeemShop,
  };
  const [access, setAccess] = useState<Capabilities>(saved);
  const [saving, setSaving] = useState(false);
  const save = useMutation(setVolunteerCapabilitiesRef);
  const changed = ACCESS_ROWS.some(({ key }) => access[key] !== saved[key]);
  const locked = saving || !volunteer.active;
  const eventCount = volunteer.events.length;
  const allEventsAllowed = volunteer.canScanAllEvents;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !changed) return;
    setSaving(true);
    setFeedback(null);
    try {
      await save({ sessionToken, volunteerAdminId: volunteer.adminId, ...access });
      setFeedback({ tone: "success", message: "Volunteer access saved. It applies on the volunteer's next scan." });
    } catch (caught) {
      setFeedback({ tone: "error", message: reportUserFacingError(
        "Unable to save volunteer access", caught,
        "Volunteer access was not changed. Please try again.",
        { source: "VolunteerDetailPage.savePermissions" },
      ) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form aria-labelledby="volunteer-permissions-heading" className="admin-card admin-card__body flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      <div>
        <h2 id="volunteer-permissions-heading" className="admin-card__title">Volunteer access</h2>
        <p className="admin-page-lead">Volunteers can only do what's switched on here. New volunteers start with everything off.</p>
      </div>
      <FeedbackMessage feedback={feedback} />
      <ul className="admin-access-list" aria-label="Volunteer actions">
        {ACCESS_ROWS.map(({ key, title, description, icon }) => (
          <li key={key} className="admin-access-row">
            <span className="admin-access-row__icon" aria-hidden="true"><SectionIcon name={icon} /></span>
            <div className="min-w-0">
              <p className="admin-access-row__title">{title} {accessBadge(access[key], saved[key])}</p>
              <p className="admin-access-row__description">{description}</p>
            </div>
            <div className="admin-access-row__control">
              <AccessSwitch
                label={title}
                checked={access[key]}
                disabled={locked}
                onChange={(checked) => { setFeedback(null); setAccess((current) => ({ ...current, [key]: checked })); }}
              />
            </div>
          </li>
        ))}
        <li className="admin-access-row">
          <span className="admin-access-row__icon" aria-hidden="true"><SectionIcon name="points" /></span>
          <div className="min-w-0">
            <p className="admin-access-row__title">
              Event points
              {allEventsAllowed
                ? <AdminStatusBadge tone="positive">Allowed for all events</AdminStatusBadge>
                : eventCount > 0
                  ? <AdminStatusBadge tone="positive">Allowed for {eventCount} {eventCount === 1 ? "event" : "events"}</AdminStatusBadge>
                  : <AdminStatusBadge tone="neutral">Not allowed</AdminStatusBadge>}
            </p>
            <p className="admin-access-row__description">
              Award points for assigned events. <a className="font-semibold text-night underline" href="#volunteer-events-heading">Manage event assignments</a>
            </p>
          </div>
        </li>
      </ul>
      {!volunteer.active ? <p className="text-sm text-ocean">Restore this volunteer's account before changing their access.</p> : null}
      <div className="admin-access-footer">
        <button type="submit" disabled={saving || !changed} className={reviewPrimaryButtonClass}>
          {saving ? "Saving…" : "Save access"}
        </button>
        {changed && !saving ? <p className="text-sm font-semibold text-ocean">Unsaved changes</p> : null}
      </div>
    </form>
  );
}

function AccountAccess({ sessionToken, volunteer, feedback, setFeedback }: SectionProps) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const revoke = useMutation(revokeVolunteerRef);
  const restore = useMutation(restoreVolunteerRef);

  async function update(active: boolean) {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      await (active ? restore : revoke)({ sessionToken, volunteerAdminId: volunteer.adminId });
      setConfirming(false);
      setFeedback({ tone: "success", message: active
        ? "Access restored. The volunteer must sign in again."
        : "Access revoked and the volunteer was signed out." });
    } catch (caught) {
      setFeedback({ tone: "error", message: reportUserFacingError(
        active ? "Unable to restore volunteer access" : "Unable to revoke volunteer access", caught,
        "Volunteer access was not changed. Please try again.",
        { source: "VolunteerDetailPage.updateAccess" },
      ) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="volunteer-access-heading" className="admin-card admin-card__body space-y-4">
      <h2 id="volunteer-access-heading" className="admin-card__title">Account access</h2>
      <FeedbackMessage feedback={feedback} />
      {volunteer.active ? (
        confirming ? (
          <div className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-3">
            <p className="text-sm text-red-950">Revoke this account? The volunteer is signed out immediately. Permissions, events, and history are kept.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving} className={reviewDangerButtonClass} onClick={() => void update(false)}>
                {saving ? "Revoking…" : "Confirm revoke"}
              </button>
              <button type="button" disabled={saving} className={reviewSecondaryButtonClass} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" className={reviewDangerButtonClass} onClick={() => { setFeedback(null); setConfirming(true); }}>
            Revoke volunteer access
          </button>
        )
      ) : (
        <button type="button" disabled={saving} className={reviewSecondaryButtonClass} onClick={() => void update(true)}>
          {saving ? "Restoring…" : "Restore volunteer access"}
        </button>
      )}
    </section>
  );
}

function historyDetail(log: StaffConfigLogRow) {
  const details = log.details ?? {};
  if (log.action === "volunteer_event_access_updated") {
    const after = details.after && typeof details.after === "object"
      ? details.after as { canScanAllEvents?: boolean }
      : undefined;
    if (after?.canScanAllEvents) return "all events, including future ones";
    const added = Array.isArray(details.addedEventIds) ? details.addedEventIds.length : 0;
    const removed = Array.isArray(details.removedEventIds) ? details.removedEventIds.length : 0;
    return `${added} added, ${removed} removed`;
  }
  if (log.action === "volunteer_capabilities_updated" && details.after && typeof details.after === "object") {
    const after = details.after as { canCheckIn?: boolean; canFoodCheckIn?: boolean; canRedeemShop?: boolean };
    const before = (details.before ?? {}) as typeof after;
    const changes = ([["canCheckIn", "Check-in"], ["canFoodCheckIn", "Food"], ["canRedeemShop", "Shop"]] as const)
      .filter(([key]) => typeof after[key] === "boolean" && after[key] !== before[key])
      .map(([key, name]) => `${name} ${after[key] ? "on" : "off"}`);
    return changes.length ? changes.join(", ") : null;
  }
  return null;
}

function AccountHistory({ sessionToken, volunteerAdminId }: { sessionToken: string; volunteerAdminId: VolunteerId }) {
  const { results, status, loadMore } = usePaginatedQuery(
    listStaffConfigLogsRef,
    { sessionToken, targetAdminId: volunteerAdminId },
    { initialNumItems: HISTORY_PAGE_SIZE },
  );
  return (
    <section aria-labelledby="volunteer-history-heading" className="space-y-4">
      <h2 id="volunteer-history-heading" className="admin-card__title">Account history</h2>
      {status === "LoadingFirstPage" ? <LoadingState message="Loading account history…" /> : results.length === 0 ? (
        <p className="text-sm text-ocean">No account changes recorded yet.</p>
      ) : (
        <ul className="admin-card divide-y divide-[var(--color-border)]">
          {results.map((log) => {
            const detail = historyDetail(log);
            return (
              <li key={log.logId} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <span className="font-semibold text-night">{STAFF_CONFIG_LABELS[log.action]}</span>
                  <span className="text-ocean"> by {log.actor.name}{detail ? ` · ${detail}` : ""}</span>
                </span>
                <time className="text-ocean" dateTime={new Date(log.createdAt).toISOString()}>{formatLogTime(log.createdAt)}</time>
              </li>
            );
          })}
        </ul>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(HISTORY_PAGE_SIZE)} className={reviewSecondaryButtonClass}>
          {status === "LoadingMore" ? "Loading history…" : "Load more history"}
        </button>
      ) : null}
    </section>
  );
}

function VolunteerDetail({ sessionToken, volunteerAdminId }: { sessionToken: string; volunteerAdminId: VolunteerId }) {
  const volunteer = useQuery(getVolunteerRef, { sessionToken, volunteerAdminId });
  const [feedback, setFeedback] = useState<Record<FeedbackSection, Feedback>>({ events: null, permissions: null, access: null });
  const section = (name: FeedbackSection) => ({
    sessionToken,
    feedback: feedback[name],
    setFeedback: (next: Feedback) => setFeedback((current) => ({ ...current, [name]: next })),
  });
  if (volunteer === undefined) return <LoadingState message="Loading volunteer…" />;
  if (volunteer === null) {
    return (
      <EmptyState
        title="Volunteer not found"
        description="This account doesn't exist or isn't a volunteer."
        action={<Link className={reviewSecondaryButtonClass} to={ADMIN_ROUTES.volunteers}>Back to all volunteers</Link>}
      />
    );
  }
  const eventKey = `${volunteer.canScanAllEvents}:${volunteer.events.map((event) => event.eventId).sort().join(",")}`;
  const eventCount = volunteer.events.length;
  const allowed = [
    ...volunteerPermissionList(volunteer),
    ...(volunteer.canScanAllEvents
      ? ["Points: all events"]
      : eventCount ? [`Points: ${eventCount} ${eventCount === 1 ? "event" : "events"}`] : []),
  ];
  return (
    <>
      <AdminPageHeader
        id="volunteer-detail-heading"
        title={volunteer.name}
        description={volunteer.email}
        actions={<AdminStatusBadge tone={volunteer.active ? "positive" : "negative"}>{volunteer.active ? "Active" : "Revoked"}</AdminStatusBadge>}
      />
      <dl className="admin-card admin-card__body grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <dt className="text-sm font-semibold text-ocean">Can currently</dt>
          <dd className="mt-1">
            {allowed.length ? (
              <ul className="admin-access-summary">
                {allowed.map((name) => <li key={name}><AdminStatusBadge tone="positive">{name}</AdminStatusBadge></li>)}
              </ul>
            ) : <AdminStatusBadge tone="neutral">No access yet</AdminStatusBadge>}
          </dd>
        </div>
        <div><dt className="text-sm font-semibold text-ocean">Linked participant</dt><dd className="mt-1 text-night">{volunteer.participant?.name ?? "None"}</dd></div>
      </dl>
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <VolunteerAccess
          key={`caps:${volunteer.canCheckIn}:${volunteer.canFoodCheckIn}:${volunteer.canRedeemShop}:${volunteer.active}`}
          volunteer={volunteer}
          {...section("permissions")}
        />
        <EventAssignments key={`events:${eventKey}`} volunteer={volunteer} {...section("events")} />
      </div>
      <AccountAccess key={`access:${volunteer.active}`} volunteer={volunteer} {...section("access")} />
      <VolunteerActivityLog
        sessionToken={sessionToken}
        volunteerAdminId={volunteer.adminId}
        headingId="volunteer-own-activity-heading"
        title={`${volunteer.name}'s activity`}
      />
      <AccountHistory sessionToken={sessionToken} volunteerAdminId={volunteer.adminId} />
    </>
  );
}

export function VolunteerDetailPage() {
  const { volunteerAdminId } = useParams();
  const { sessionToken, staff } = useAdminAuth();
  return (
    <section aria-labelledby="volunteer-detail-heading" className="space-y-6">
      <Link className="inline-block font-semibold text-ocean underline" to={ADMIN_ROUTES.volunteers}>← All volunteers</Link>
      {staff?.role === "admin" && sessionToken && volunteerAdminId ? (
        <VolunteerDetail key={volunteerAdminId} sessionToken={sessionToken} volunteerAdminId={volunteerAdminId as VolunteerId} />
      ) : (
        <LoadingState message="Verifying administrator access…" />
      )}
    </section>
  );
}
