import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { GenericId } from "convex/values";
import { usePaginatedQuery } from "../../convex/reactBindings";
import { listVolunteerActionLogsRef, type VolunteerActionLogRow } from "../../convex/adminApi";
import { reviewPrimaryButtonClass } from "../../lib/reviewButtonClasses";
import { formatLogTime, formatPointsDelta, VOLUNTEER_ACTION_LABELS } from "../../lib/staffLogFormat";
import { ADMIN_ROUTES } from "../../types/routes";
import { EmptyState } from "../states/EmptyState";
import { LoadingState } from "../states/LoadingState";

const PAGE_SIZE = 25;
type ActionFilter = "all" | VolunteerActionLogRow["action"];

/**
 * Scan and point-adjustment history, newest first. With `volunteerAdminId`
 * only that volunteer's actions are shown and the staff column is omitted.
 */
export function VolunteerActivityLog({ sessionToken, volunteerAdminId, headingId, title }: {
  sessionToken: string;
  volunteerAdminId?: GenericId<"admins">;
  headingId: string;
  title: string;
}) {
  const [action, setAction] = useState<ActionFilter>("all");
  const args = useMemo(() => ({
    sessionToken,
    ...(volunteerAdminId ? { volunteerAdminId } : {}),
    ...(action === "all" ? {} : { action }),
  }), [action, sessionToken, volunteerAdminId]);
  const { results, status, loadMore } = usePaginatedQuery(listVolunteerActionLogsRef, args, { initialNumItems: PAGE_SIZE });
  const showStaff = volunteerAdminId === undefined;

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={headingId} className="admin-card__title">{title}</h2>
        <label className="admin-field min-w-[12rem]">
          Action
          <select className="admin-field__control" value={action} onChange={(event) => setAction(event.target.value as ActionFilter)}>
            <option value="all">All actions</option>
            {(Object.keys(VOLUNTEER_ACTION_LABELS) as Array<VolunteerActionLogRow["action"]>).map((value) => (
              <option key={value} value={value}>{VOLUNTEER_ACTION_LABELS[value]}</option>
            ))}
          </select>
        </label>
      </div>

      {status === "LoadingFirstPage" ? <LoadingState layout="rows" message="Loading activity…" /> : null}
      {status !== "LoadingFirstPage" && results.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description={action === "all"
            ? "Check-ins, food redemptions, and point awards will appear here as volunteers scan participants."
            : "No activity matches this action. Choose another action to see more."}
        />
      ) : null}
      {results.length > 0 ? (
        <div className="admin-card admin-table-scroll">
          <table className="admin-table min-w-[44rem]">
            <thead>
              <tr>
                <th scope="col">When</th>
                {showStaff ? <th scope="col">Staff</th> : null}
                <th scope="col">Action</th>
                <th scope="col">Participant</th>
                <th scope="col">Event</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {results.map((log) => (
                <tr key={log.logId}>
                  <td className="whitespace-nowrap">
                    <time dateTime={new Date(log.createdAt).toISOString()}>{formatLogTime(log.createdAt)}</time>
                  </td>
                  {showStaff ? (
                    <td>
                      {log.action === "admin_adjust" ? log.actor.name : (
                        <Link className="font-semibold text-night underline" to={ADMIN_ROUTES.volunteerDetail(log.actor.adminId)}>
                          {log.actor.name}
                        </Link>
                      )}
                    </td>
                  ) : null}
                  <td>
                    {VOLUNTEER_ACTION_LABELS[log.action]}
                    {log.reason ? <p className="text-xs text-ocean">Reason: {log.reason}</p> : null}
                  </td>
                  <td>{log.participant.name}</td>
                  <td>{log.event?.name ?? "—"}</td>
                  <td className="whitespace-nowrap font-semibold">{formatPointsDelta(log.pointsDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(PAGE_SIZE)} className={reviewPrimaryButtonClass}>
            {status === "LoadingMore" ? "Loading activity…" : "Load more activity"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
