import { Link } from "react-router-dom";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { AdminStatusBadge } from "../../components/AdminStatusBadge";
import { VolunteerActivityLog } from "../../components/admin/VolunteerActivityLog";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { usePaginatedQuery } from "../../convex/reactBindings";
import { listVolunteersRef } from "../../convex/adminApi";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { reviewPrimaryButtonClass } from "../../lib/reviewButtonClasses";
import { volunteerPermissions } from "../../lib/staffLogFormat";
import { ADMIN_ROUTES } from "../../types/routes";

const PAGE_SIZE = 25;

function VolunteerRoster({ sessionToken }: { sessionToken: string }) {
  const { results, status, loadMore } = usePaginatedQuery(listVolunteersRef, { sessionToken }, { initialNumItems: PAGE_SIZE });

  return (
    <section aria-labelledby="volunteer-roster-heading" className="space-y-4">
      <h2 id="volunteer-roster-heading" className="admin-card__title">All volunteers</h2>
      {status === "LoadingFirstPage" ? <LoadingState layout="rows" message="Loading volunteers…" /> : null}
      {status !== "LoadingFirstPage" && results.length === 0 ? (
        <EmptyState
          title="No volunteers yet"
          description="Promote an accepted participant from the Participants page to create a volunteer account."
        />
      ) : null}
      {results.length > 0 ? (
        <div className="admin-card admin-table-scroll">
          <table className="admin-table min-w-[44rem]">
            <thead>
              <tr>
                <th scope="col">Volunteer</th>
                <th scope="col">Status</th>
                <th scope="col">Scan permissions</th>
                <th scope="col">Events</th>
              </tr>
            </thead>
            <tbody>
              {results.map((volunteer) => (
                <tr key={volunteer.adminId}>
                  <th scope="row" className="max-w-[18rem] font-normal">
                    <Link className="font-semibold text-night underline" to={ADMIN_ROUTES.volunteerDetail(volunteer.adminId)}>
                      {volunteer.name}
                    </Link>
                    <p className="break-all text-sm text-ocean">{volunteer.email}</p>
                  </th>
                  <td>
                    <AdminStatusBadge tone={volunteer.active ? "positive" : "negative"}>
                      {volunteer.active ? "Active" : "Revoked"}
                    </AdminStatusBadge>
                  </td>
                  <td>{volunteerPermissions(volunteer)}</td>
                  <td>{volunteer.events.length === 0 ? "None" : volunteer.events.map((event) => event.name).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(PAGE_SIZE)} className={reviewPrimaryButtonClass}>
            {status === "LoadingMore" ? "Loading volunteers…" : "Load more volunteers"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function VolunteersPage() {
  const { sessionToken, staff } = useAdminAuth();
  return (
    <section aria-labelledby="volunteers-heading" className="space-y-8">
      <AdminPageHeader
        id="volunteers-heading"
        title="Volunteers"
        eyebrow="The Stoa · Volunteers"
        description="View every volunteer and their activity. Open a volunteer to see their own log and assign events."
      />
      {staff?.role === "admin" && sessionToken ? (
        <>
          <VolunteerRoster sessionToken={sessionToken} />
          <VolunteerActivityLog sessionToken={sessionToken} headingId="volunteer-activity-heading" title="Activity log" />
        </>
      ) : (
        <LoadingState message="Verifying administrator access…" />
      )}
    </section>
  );
}
