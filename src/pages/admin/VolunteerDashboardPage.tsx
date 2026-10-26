import { Link } from "react-router-dom";
import { LoadingState } from "../../components/states/LoadingState";
import { VolunteerActionCard } from "../../components/volunteer/VolunteerActionCard";
import { EventStatusBadge } from "../../components/admin/EventStatusBadge";
import { SectionIcon } from "../../components/SectionIcon";
import { useVolunteerAccess } from "../../hooks/useVolunteerAccess";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useNow } from "../../hooks/useNow";
import { canAccessStaffRoute } from "../../lib/staffRouteAccess";
import { ADMIN_ROUTES } from "../../types/routes";

function greetingFor(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function VolunteerDashboardPage() {
  const { staff } = useAdminAuth();
  const options = useVolunteerAccess();
  const now = useNow();
  const firstName = staff?.name?.trim().split(/\s+/)[0] || "Volunteer";

  if (!staff || !options) {
    return (
      <div className="volunteer-ops space-y-6">
        <header>
          <h1 className="volunteer-dashboard__greeting">Volunteer dashboard</h1>
          <p className="volunteer-dashboard__lead">Loading your responsibilities…</p>
        </header>
        <LoadingState layout="rows" message="Loading your responsibilities…" />
      </div>
    );
  }

  const actions = [
    {
      to: ADMIN_ROUTES.scanCheckIn,
      title: "Participant Check-in",
      icon: "checkIn" as const,
      description: "Confirm arrival and mark general event check-in.",
    },
    {
      to: ADMIN_ROUTES.scanFood,
      title: "Food Distribution",
      icon: "food" as const,
      description: "Verify dietary notes and record meal redemption.",
    },
    {
      to: ADMIN_ROUTES.scanPoints,
      title: "Event Points",
      icon: "points" as const,
      description: "Award configured points for your assigned events.",
    },
    {
      to: ADMIN_ROUTES.scanShop,
      title: "Shop Redemption",
      icon: "shop" as const,
      description: "Scan a participant, then sell shop items for their points.",
    },
  ].filter(({ to }) => canAccessStaffRoute(to, staff, options) === true);

  return (
    <div className="volunteer-ops space-y-8">
      <header>
        <h1 className="volunteer-dashboard__greeting">
          {greetingFor()}, {firstName}
        </h1>
        <p className="volunteer-dashboard__lead">
          Choose a responsibility to start scanning. Large controls stay thumb-friendly on phones.
        </p>
      </header>

      {actions.length ? (
        <section aria-label="Available scan actions">
          <h2 className="volunteer-section-label">Your responsibilities</h2>
          <ul className="volunteer-action-grid">
            {actions.map(({ to, title, icon, description }) => (
              <li key={to}>
                <VolunteerActionCard
                  to={to}
                  title={title}
                  description={description}
                  icon={<SectionIcon name={icon} />}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="volunteer-callout" role="status">
          <h2 className="volunteer-callout__title">No responsibilities assigned yet</h2>
          <p>
            Your account does not currently include check-in, food, shop, or points access. Ask an
            organizer to assign responsibilities — they will appear here automatically.
          </p>
        </div>
      )}

      <section aria-labelledby="assigned-events-heading">
        <h2 id="assigned-events-heading" className="volunteer-section-label">
          Assigned events
        </h2>
        <p className="volunteer-dashboard__hint">
          Listed events are switched on for point scans. Schedule labels are for reference only.
        </p>
        {options.events.length ? (
          <>
            <ul className="volunteer-event-summary mt-3">
              {options.events.map((event) => (
                <li key={event.eventId} className="volunteer-event-summary__item">
                  <span className="volunteer-event-summary__name">{event.name}</span>
                  <span className="volunteer-event-summary__meta">
                    <span>{event.pointsAwarded} pts</span>
                    <EventStatusBadge event={{ ...event, active: true }} now={now} />
                    <Link
                      className="volunteer-inline-link"
                      to={`${ADMIN_ROUTES.scanPoints}?event=${encodeURIComponent(event.eventId)}`}
                    >
                      Open →
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
            <p className="volunteer-dashboard__hint">
              Open{" "}
              <Link className="volunteer-inline-link" to={ADMIN_ROUTES.scanPoints}>
                Event Points
              </Link>{" "}
              to select an event before scanning.
            </p>
          </>
        ) : (
          <p className="volunteer-dashboard__hint">
            No active events assigned. Contact an administrator if you need event access.
          </p>
        )}
      </section>
    </div>
  );
}
