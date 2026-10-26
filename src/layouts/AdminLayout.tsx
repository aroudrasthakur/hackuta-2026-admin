import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { AdminAccountControls } from "../components/AdminAccountControls";
import { HackUtaLogo } from "../components/HackUtaLogo";
import { StormPageFrame } from "../components/StormPageFrame";
import { ADMIN_ROUTES } from "../types/routes";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useVolunteerAccess } from "../hooks/useVolunteerAccess";
import { canAccessStaffRoute } from "../lib/staffRouteAccess";
import { SectionIcon, type SectionIconName } from "../components/SectionIcon";
import { WeatherMoodToggle } from "../components/WeatherMoodToggle";

function AdminSectionLink({
  to,
  active,
  children,
  icon,
}: {
  to: string;
  active: boolean;
  children: string;
  icon: SectionIconName;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className="admin-section-link"
    >
      <SectionIcon name={icon} /><span>{children}</span>
    </Link>
  );
}

export function AdminLayout() {
  const { pathname, state } = useLocation();
  const { staff } = useAdminAuth();
  const options = useVolunteerAccess();
  const tabs = staff?.role === "volunteer" ? [
    { to: ADMIN_ROUTES.scan, label: "Dashboard", icon: "dashboard" as const },
    { to: ADMIN_ROUTES.scanCheckIn, label: "Check-in", icon: "checkIn" as const },
    { to: ADMIN_ROUTES.scanFood, label: "Food", icon: "food" as const },
    { to: ADMIN_ROUTES.scanPoints, label: "Points", icon: "points" as const },
  ] : [
    { to: ADMIN_ROUTES.applications, label: "Applications", icon: "applications" as const },
    { to: ADMIN_ROUTES.decisionEmails, label: "Decision emails", icon: "emails" as const },
    { to: ADMIN_ROUTES.participants, label: "Participants", icon: "participants" as const },
    { to: ADMIN_ROUTES.volunteers, label: "Volunteers", icon: "volunteers" as const },
    { to: ADMIN_ROUTES.meals, label: "Meals", icon: "food" as const },
  ];
  const permittedTabs = tabs.filter(({ to }) => staff && canAccessStaffRoute(to, staff, options) === true);
  const grants = staff?.role === "volunteer"
    ? options === undefined ? null : [...permittedTabs.map(({ to }) => to), ...options.events.map(({ eventId }) => eventId)].sort().join(",")
    : "";
  const [access, setAccess] = useState({ grants, revoked: false });

  useEffect(() => {
    // Compare committed permission snapshots; loading is not a revocation.
    if (grants === null) return;
    // Persist revocation history even if access is later restored.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccess((previous) => previous.grants === grants ? previous : {
      grants,
      revoked: previous.revoked || (previous.grants ?? "").split(",").some((grant) => grant && !grants.split(",").includes(grant)),
    });
  }, [grants]);
  const accessNotice = (state as { accessNotice?: unknown } | null)?.accessNotice;

  return (
    <StormPageFrame embeddedWeather>
      <div className="admin-workspace min-h-screen">
        <header className="admin-topbar">
          <div className="admin-topbar__inner">
            <div className="admin-topbar__brand">
              <HackUtaLogo className="admin-topbar__logo" />
              {import.meta.env.DEV &&
              import.meta.env.VITE_DEV_AUTH_BYPASS === "true" ? (
                <p className="mt-1 text-xs font-medium text-red-700">
                  Local development auth bypass is enabled
                </p>
              ) : null}
            </div>
            <WeatherMoodToggle />
            <AdminAccountControls />
          </div>
        </header>
        <nav aria-label={staff?.role === "volunteer" ? "Volunteer" : "Admin"} className="admin-section-nav mx-auto max-w-6xl px-4 pt-5">
          <ul className="admin-section-list">
            {permittedTabs.map(({ to, label, icon }) => (
              <li key={to}><AdminSectionLink to={to} icon={icon} active={pathname === to || (to === ADMIN_ROUTES.applications && pathname.startsWith(`${to}/`))}>
                {label}
              </AdminSectionLink></li>
            ))}
          </ul>
        </nav>
        <main id="admin-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          {typeof accessNotice === "string" ? <p role="alert" className="admin-callout admin-callout--alert mb-6">{accessNotice}</p> : null}
          {access.revoked ? <p role="status" className="admin-callout mb-6">Some of your scan access was removed. Your available actions and events are up to date. Contact an administrator if you need help.</p> : null}
          <Outlet />
        </main>
      </div>
    </StormPageFrame>
  );
}
