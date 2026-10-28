import { Link } from "react-router-dom";
import { AdminPageHeader } from "../../components/AdminPageHeader";
import { LoadingState } from "../../components/states/LoadingState";
import { VolunteerActionCard } from "../../components/volunteer/VolunteerActionCard";
import { EventStatusBadge } from "../../components/admin/EventStatusBadge";
import { SectionIcon } from "../../components/SectionIcon";
import { useVolunteerAccess } from "../../hooks/useVolunteerAccess";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNow } from "../../hooks/useNow";
import { canAccessStaffRoute } from "../../lib/staffRouteAccess";
import { ADMIN_ROUTES } from "../../types/routes";

function greetingFor(now: number) {
  const hour = new Date(now).getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const ACTIONS = [
  {
    to: ADMIN_ROUTES.scanCheckIn,
    title: "Participant check-in",
    icon: "checkIn",
    description: "Scan their registration QR, hand over a badge, and confirm.",
  },
  {
    to: ADMIN_ROUTES.scanFood,
    title: "Food distribution",
    icon: "food",
    description: "Scan a badge, check dietary notes, and record the meal.",
  },
  {
    to: ADMIN_ROUTES.scanPoints,
    title: "Event points",
    icon: "points",
    description: "Scan a badge to award points for your assigned events.",
  },
  {
    to: ADMIN_ROUTES.scanShop,
    title: "Shop redemption",
    icon: "shop",
    description: "Scan a badge and sell shop items for points.",
  },
] as const;

export function VolunteerDashboardPage() {
  const { staff } = useAdminAuth();
  const options = useVolunteerAccess(true);
  const now = useNow();
  const firstName = staff?.name?.trim().split(/\s+/)[0] || "Volunteer";

  if (!staff || !options) {
    return (
      <div className="space-y-6">
        <AdminPageHeader id="volunteer-dashboard-heading" title="Volunteer dashboard" />
        <LoadingState layout="rows" message="Loading your responsibilities…" />
      </div>
    );
  }

  const actions = ACTIONS.filter(({ to }) => canAccessStaffRoute(to, staff, options) === true);

  return (
    <div className="volunteer-dashboard space-y-8">
      <AdminPageHeader
        id="volunteer-dashboard-heading"
        title={`${greetingFor(now)}, ${firstName}`}
        description="Choose a responsibility to start scanning."
      />

      {actions.length ? (
        <section aria-labelledby="volunteer-responsibilities">
          <h2 id="volunteer-responsibilities" className="volunteer-section-title">Your responsibilities</h2>
          <ul className="volunteer-action-grid">
            {actions.map(({ to, title, icon, description }) => (
              <li key={to}>
                <VolunteerActionCard to={to} title={title} description={description} icon={<SectionIcon name={icon} />} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="volunteer-callout" role="status">
          <h2 className="volunteer-callout__title">No responsibilities assigned yet</h2>
          <p>
            Your account doesn't include check-in, food, shop, or points access yet. Ask an organizer to assign
            responsibilities; they'll appear here automatically.
          </p>
        </div>
      )}

      <section aria-labelledby="assigned-events-heading">
        <h2 id="assigned-events-heading" className="volunteer-section-title">
          {staff.role === "admin" ? "Active events" : "Assigned events"}
        </h2>
        <p className="volunteer-dashboard__hint">
          {options.events.length
            ? "Events you can award points for. Times are for reference only."
            : staff.role === "admin"
              ? "No active events yet. Create or activate an event on the Events page to award points."
              : "No events assigned. Contact an administrator if you need event access."}
        </p>
        {options.events.length ? (
          <ul className="volunteer-event-summary">
            {options.events.map((event) => (
              <li key={event.eventId}>
                <Link
                  className="volunteer-event-summary__item"
                  to={`${ADMIN_ROUTES.scanPoints}?event=${encodeURIComponent(event.eventId)}`}
                  aria-label={`Scan points for ${event.name}, ${event.pointsAwarded} points`}
                >
                  <span className="volunteer-event-summary__name">{event.name}</span>
                  <span className="volunteer-event-summary__meta">
                    <span>{event.pointsAwarded} pts</span>
                    <EventStatusBadge event={{ ...event, active: true }} now={now} />
                    <span aria-hidden="true" className="volunteer-action-card__chevron">→</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
