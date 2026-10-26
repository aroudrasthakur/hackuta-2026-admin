import { Link } from "react-router-dom";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { useVolunteerAccess } from "../../hooks/useVolunteerAccess";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNow } from "../../hooks/useNow";
import { canAccessStaffRoute } from "../../lib/staffRouteAccess";
import { ADMIN_ROUTES } from "../../types/routes";

export function VolunteerDashboardPage() {
  const { staff } = useAdminAuth();
  const options = useVolunteerAccess();
  const now = useNow();
  if (!staff || !options) return <LoadingState message="Loading your responsibilities…" />;
  const actions = [
    { to: ADMIN_ROUTES.scanCheckIn, title: "Participant check-in", description: "Welcome participants and check their arrival status." },
    { to: ADMIN_ROUTES.scanFood, title: "Food", description: "Check meal redemption and dietary information." },
    { to: ADMIN_ROUTES.scanPoints, title: "Points", description: "View your assigned events for point scans." },
  ].filter(({ to }) => canAccessStaffRoute(to, staff, options) === true);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-mist">Welcome, {staff.name}</p>
        <h1 className="font-display text-3xl text-ink">Volunteer dashboard</h1>
        <p className="mt-2 text-sm text-mist">Your assigned responsibilities and scan actions appear here as access changes.</p>
      </div>
      {actions.length ? (
        <section aria-label="Available scan actions" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map(({ to, title, description }) => (
            <Link key={to} to={to} className="admin-card block space-y-2 p-6 focus-visible:outline-2 focus-visible:outline-offset-4">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <p className="text-sm text-mist">{description}</p>
              <span className="inline-block py-2 text-sm font-semibold">Open {title.toLowerCase()} →</span>
            </Link>
          ))}
        </section>
      ) : (
        <EmptyState title="No responsibilities assigned yet" description="Ask an administrator to grant check-in, food, or event access. Your assignments will appear here automatically." />
      )}
      <section aria-labelledby="assigned-events">
        <h2 id="assigned-events" className="mb-3 text-xl font-semibold text-ink">Assigned events</h2>
        <p className="mb-4 text-sm text-mist">Listed events are active and available for point scans. Scheduled times are for reference; follow your event lead’s instructions.</p>
        {options.events.length ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {options.events.map((event) => (
              <li key={event.eventId} className="admin-card space-y-2 p-5">
                <h3 className="font-semibold text-ink">{event.name}</h3>
                <p className="text-sm">{event.pointsAwarded} points · {now < event.startsAt ? "Scheduled" : now > event.endsAt ? "Scheduled time ended" : "Within scheduled time"}</p>
                <p className="text-sm text-mist"><time dateTime={new Date(event.startsAt).toISOString()}>{new Date(event.startsAt).toLocaleString()}</time> – <time dateTime={new Date(event.endsAt).toISOString()}>{new Date(event.endsAt).toLocaleString()}</time></p>
                <Link className="inline-block py-3 text-sm font-semibold" to={`${ADMIN_ROUTES.scanPoints}?event=${encodeURIComponent(event.eventId)}`}>Open points for {event.name} →</Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mist">No active events assigned. Contact an administrator if you need event access.</p>}
      </section>
    </div>
  );
}
