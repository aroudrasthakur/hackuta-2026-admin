import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { GenericId } from "convex/values";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { AdminStatusBadge } from "../../components/AdminStatusBadge";
import { EventStatusBadge } from "../../components/admin/EventStatusBadge";
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
import { formatLogTime, STAFF_CONFIG_LABELS, volunteerPermissions } from "../../lib/staffLogFormat";
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
  const [saving, setSaving] = useState(false);
  const save = useMutation(setVolunteerEventAccessRef);
  const changed = selected.length !== assigned.length || selected.some((eventId) => !assigned.includes(eventId));

  function toggle(eventId: string, checked: boolean) {
    setFeedback(null);
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
      });
      setFeedback({ tone: "success", message: `Event assignments saved (${result.added} added, ${result.removed} removed).` });
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
    <form aria-labelledby="volunteer-events-heading" className="admin-card admin-card__body space-y-4" onSubmit={(event) => void submit(event)}>
      <div>
        <h2 id="volunteer-events-heading" className="admin-card__title">Event assignments</h2>
        <p className="admin-page-lead">The volunteer can award points only for the events checked here, and only while an event is switched on. Start and end times are for reference.</p>
      </div>
      <FeedbackMessage feedback={feedback} />
      {status === "LoadingFirstPage" ? <LoadingState message="Loading events…" /> : events.length === 0 ? (
        <p className="text-sm text-ocean">
          No events exist yet. <Link className="font-semibold text-night underline" to={ADMIN_ROUTES.events}>Create an event</Link> first.
        </p>
      ) : (
        <fieldset className="space-y-1">
          <legend className="sr-only">Assigned events</legend>
          {events.map((event) => (
            <label key={event.eventId} className="flex min-h-11 items-center gap-3 text-sm text-night">
              <input
                type="checkbox"
                checked={selected.includes(event.eventId)}
                disabled={saving}
                onChange={(change) => toggle(event.eventId, change.target.checked)}
              />
              <span>
                <span className="font-semibold">{event.name}</span>
                <span className="text-ocean"> · {event.pointsAwarded} points</span>
              </span>
              <EventStatusBadge event={event} now={now} />
            </label>
          ))}
        </fieldset>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(EVENTS_PAGE_SIZE)} className={reviewSecondaryButtonClass}>
          {status === "LoadingMore" ? "Loading events…" : "Load more events"}
        </button>
      ) : null}
      {!volunteer.active ? <p className="text-sm text-ocean">Restore this volunteer's access before assigning new events.</p> : null}
      <button type="submit" disabled={saving || !changed} className={reviewPrimaryButtonClass}>
        {saving ? "Saving…" : "Save event assignments"}
      </button>
    </form>
  );
}

function ScanPermissions({ sessionToken, volunteer, feedback, setFeedback }: SectionProps) {
  const [canCheckIn, setCanCheckIn] = useState(volunteer.canCheckIn);
  const [canFoodCheckIn, setCanFoodCheckIn] = useState(volunteer.canFoodCheckIn);
  const [saving, setSaving] = useState(false);
  const save = useMutation(setVolunteerCapabilitiesRef);
  const changed = canCheckIn !== volunteer.canCheckIn || canFoodCheckIn !== volunteer.canFoodCheckIn;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !changed) return;
    setSaving(true);
    setFeedback(null);
    try {
      await save({ sessionToken, volunteerAdminId: volunteer.adminId, canCheckIn, canFoodCheckIn });
      setFeedback({ tone: "success", message: "Scan permissions saved. They apply on the volunteer's next scan." });
    } catch (caught) {
      setFeedback({ tone: "error", message: reportUserFacingError(
        "Unable to save scan permissions", caught,
        "Scan permissions were not changed. Please try again.",
        { source: "VolunteerDetailPage.savePermissions" },
      ) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form aria-labelledby="volunteer-permissions-heading" className="admin-card admin-card__body space-y-4" onSubmit={(event) => void submit(event)}>
      <h2 id="volunteer-permissions-heading" className="admin-card__title">Scan permissions</h2>
      <FeedbackMessage feedback={feedback} />
      <label className="flex min-h-11 items-center gap-3 text-sm text-night">
        <input type="checkbox" checked={canCheckIn} disabled={saving} onChange={(event) => { setFeedback(null); setCanCheckIn(event.target.checked); }} />
        Can check participants in
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm text-night">
        <input type="checkbox" checked={canFoodCheckIn} disabled={saving} onChange={(event) => { setFeedback(null); setCanFoodCheckIn(event.target.checked); }} />
        Can redeem participant food
      </label>
      <button type="submit" disabled={saving || !changed} className={reviewPrimaryButtonClass}>
        {saving ? "Saving…" : "Save scan permissions"}
      </button>
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
    const added = Array.isArray(details.addedEventIds) ? details.addedEventIds.length : 0;
    const removed = Array.isArray(details.removedEventIds) ? details.removedEventIds.length : 0;
    return `${added} added, ${removed} removed`;
  }
  if (log.action === "volunteer_capabilities_updated" && details.after && typeof details.after === "object") {
    const after = details.after as { canCheckIn?: boolean; canFoodCheckIn?: boolean };
    return `Now: ${volunteerPermissions({ canCheckIn: after.canCheckIn === true, canFoodCheckIn: after.canFoodCheckIn === true })}`;
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
  const eventKey = volunteer.events.map((event) => event.eventId).sort().join(",");
  return (
    <>
      <AdminPageHeader
        id="volunteer-detail-heading"
        title={volunteer.name}
        eyebrow="The Stoa · Volunteer"
        description={volunteer.email}
        actions={<AdminStatusBadge tone={volunteer.active ? "positive" : "negative"}>{volunteer.active ? "Active" : "Revoked"}</AdminStatusBadge>}
      />
      <dl className="admin-card admin-card__body grid gap-4 sm:grid-cols-3">
        <div><dt className="text-sm font-semibold text-ocean">Scan permissions</dt><dd className="text-night">{volunteerPermissions(volunteer)}</dd></div>
        <div><dt className="text-sm font-semibold text-ocean">Assigned events</dt><dd className="text-night">{volunteer.events.length}</dd></div>
        <div><dt className="text-sm font-semibold text-ocean">Linked participant</dt><dd className="text-night">{volunteer.participant?.name ?? "None"}</dd></div>
      </dl>
      <div className="grid gap-6 lg:grid-cols-2">
        <EventAssignments key={`events:${eventKey}`} volunteer={volunteer} {...section("events")} />
        <div className="space-y-6">
          <ScanPermissions key={`caps:${volunteer.canCheckIn}:${volunteer.canFoodCheckIn}`} volunteer={volunteer} {...section("permissions")} />
          <AccountAccess key={`access:${volunteer.active}`} volunteer={volunteer} {...section("access")} />
        </div>
      </div>
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
