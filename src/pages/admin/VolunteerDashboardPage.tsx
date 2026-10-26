import { Link } from "react-router-dom";
import { EmptyState } from "../../components/states/EmptyState";
import { LoadingState } from "../../components/states/LoadingState";
import { useVolunteerAccess } from "../../hooks/useVolunteerAccess";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNow } from "../../hooks/useNow";
import { canAccessStaffRoute } from "../../lib/staffRouteAccess";
import { ADMIN_ROUTES } from "../../types/routes";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { EventStatusBadge } from "../../components/admin/EventStatusBadge";
import { SectionIcon } from "../../components/SectionIcon";
import { reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";

export function VolunteerDashboardPage() {
  const { staff } = useAdminAuth();
  const options = useVolunteerAccess();
  const now = useNow();
  const header = <AdminPageHeader id="volunteer-dashboard-heading" title="Volunteer dashboard" description={`${staff ? `Welcome, ${staff.name}. ` : ""}Your assigned responsibilities and scan actions appear here as access changes.`} />;
  if (!staff || !options) return <div className="space-y-6">{header}<LoadingState layout="rows" message="Loading your responsibilities…" /></div>;
  const actions = [
    { to: ADMIN_ROUTES.scanCheckIn, title: "Participant check-in", icon: "checkIn" as const, description: "Welcome participants and check their arrival status." },
    { to: ADMIN_ROUTES.scanFood, title: "Food", icon: "food" as const, description: "Check meal redemption and dietary information." },
    { to: ADMIN_ROUTES.scanPoints, title: "Points", icon: "points" as const, description: "View your assigned events for point scans." },
    { to: ADMIN_ROUTES.scanShop, title: "Shop redemption", icon: "shop" as const, description: "Scan a participant, then sell shop items for their points." },
  ].filter(({ to }) => canAccessStaffRoute(to, staff, options) === true);

  return (
    <div className="space-y-8">
      {header}
      {actions.length ? (
        <section aria-label="Available scan actions" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map(({ to, title, icon, description }) => (
            <Link key={to} to={to} className="admin-card admin-action-card block space-y-2 p-6">
              <span className="admin-state__icon"><SectionIcon name={icon} /></span>
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <p className="text-sm text-mist">{description}</p>
              <span className="inline-block py-2 text-sm font-semibold">Open {title.toLowerCase()} →</span>
            </Link>
          ))}
        </section>
      ) : (
        <EmptyState title="No responsibilities assigned yet" description="Ask an administrator to grant check-in, food, shop, or event access. Your assignments will appear here automatically." />
      )}
      <section aria-labelledby="assigned-events">
        <h2 id="assigned-events" className="admin-card__title mb-3">Assigned events</h2>
        <p className="mb-4 text-sm text-mist">Listed events are switched on and available for point scans. Scheduled times are for reference.</p>
        {options.events.length ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {options.events.map((event) => (
              <li key={event.eventId} className="admin-card space-y-2 p-5">
                <h3 className="font-semibold text-ink">{event.name}</h3>
                <div className="flex flex-wrap items-center gap-2 text-sm"><span>{event.pointsAwarded} points</span><EventStatusBadge event={{ ...event, active: true }} now={now} /></div>
                <p className="text-sm text-mist"><time dateTime={new Date(event.startsAt).toISOString()}>{new Date(event.startsAt).toLocaleString()}</time> – <time dateTime={new Date(event.endsAt).toISOString()}>{new Date(event.endsAt).toLocaleString()}</time></p>
                <Link className={reviewSecondaryButtonClass} to={`${ADMIN_ROUTES.scanPoints}?event=${encodeURIComponent(event.eventId)}`}>Open points for {event.name} →</Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mist">No active events assigned. Contact an administrator if you need event access.</p>}
      </section>
    </div>
  );
}
