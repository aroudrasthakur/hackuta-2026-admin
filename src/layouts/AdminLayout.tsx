import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { AdminAccountControls } from "../components/AdminAccountControls";
import { HackUtaLogo } from "../components/HackUtaLogo";
import { StormPageFrame } from "../components/StormPageFrame";
import { ADMIN_ROUTES } from "../types/routes";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useVolunteerAccess } from "../hooks/useVolunteerAccess";
import { canAccessStaffRoute } from "../lib/staffRouteAccess";

function AdminTab({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      to={to}
      role="tab"
      aria-selected={active}
      className={`admin-nav-tab${active ? " admin-nav-tab--active" : ""}`}
    >
      {children}
    </Link>
  );
}

export function AdminLayout() {
  const { pathname, state } = useLocation();
  const { staff } = useAdminAuth();
  const options = useVolunteerAccess();
  const tabs = staff?.role === "volunteer" ? [
    { to: ADMIN_ROUTES.scan, label: "Dashboard" },
    { to: ADMIN_ROUTES.scanCheckIn, label: "Check-in" },
    { to: ADMIN_ROUTES.scanFood, label: "Food" },
    { to: ADMIN_ROUTES.scanPoints, label: "Points" },
  ] : [
    { to: ADMIN_ROUTES.applications, label: "Applications" },
    { to: ADMIN_ROUTES.decisionEmails, label: "Decision emails" },
    { to: ADMIN_ROUTES.participants, label: "Participants" },
    { to: ADMIN_ROUTES.volunteers, label: "Volunteers" },
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
  const headerRef = useRef<HTMLElement>(null);
  const [headerOffset, setHeaderOffset] = useState(0);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const syncOffset = () => {
      const rect = header.getBoundingClientRect();
      setHeaderOffset(rect.bottom + 12);
    };
    syncOffset();

    let observer: ResizeObserver | undefined;
    if (typeof window.ResizeObserver !== "undefined") {
      observer = new ResizeObserver(syncOffset);
      observer.observe(header);
    }
    addEventListener("resize", syncOffset);
    return () => {
      observer?.disconnect();
      removeEventListener("resize", syncOffset);
    };
  }, []);

  return (
    <StormPageFrame>
      <div className="admin-workspace min-h-screen">
        <header ref={headerRef} className="admin-topbar admin-topbar--compact">
          <div className="admin-topbar__inner admin-topbar__inner--compact">
            <div className="admin-topbar__brand">
              <HackUtaLogo className="admin-topbar__logo" />
              {import.meta.env.DEV &&
              import.meta.env.VITE_DEV_AUTH_BYPASS === "true" ? (
                <p className="mt-1 text-xs font-medium text-red-700">
                  Local development auth bypass is enabled
                </p>
              ) : null}
            </div>

            <AdminAccountControls />
          </div>
        </header>
        <div style={{ height: headerOffset }} aria-hidden="true" />
        <nav aria-label={staff?.role === "volunteer" ? "Volunteer" : "Admin"} className="mx-auto max-w-6xl px-4 pt-6">
          <div role="tablist" aria-label="Staff sections" className="admin-nav-tabs">
            {permittedTabs.map(({ to, label }) => (
              <AdminTab key={to} to={to} active={pathname === to || (to === ADMIN_ROUTES.applications && pathname.startsWith(`${to}/`))}>
                {label}
              </AdminTab>
            ))}
          </div>
        </nav>
        <main id="admin-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8">
          {typeof accessNotice === "string" ? <p role="alert" className="admin-card mb-6 p-4">{accessNotice}</p> : null}
          {access.revoked ? <p role="status" className="admin-card mb-6 p-4">Some of your scan access was removed. Your available actions and events are up to date. Contact an administrator if you need help.</p> : null}
          <Outlet />
        </main>
      </div>
    </StormPageFrame>
  );
}
