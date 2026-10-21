import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { AdminAccountControls } from "../components/AdminAccountControls";
import { HackUtaLogo } from "../components/HackUtaLogo";
import { StormPageFrame } from "../components/StormPageFrame";
import { ADMIN_ROUTES } from "../types/routes";

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
  const { pathname } = useLocation();
  const applicationsActive =
    pathname === ADMIN_ROUTES.applications ||
    pathname.startsWith(`${ADMIN_ROUTES.applications}/`);
  const decisionEmailsActive = pathname === ADMIN_ROUTES.decisionEmails;
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
        <nav aria-label="Admin" className="mx-auto max-w-6xl px-4 pt-6">
          <div role="tablist" aria-label="Admin sections" className="admin-nav-tabs">
            <AdminTab to={ADMIN_ROUTES.applications} active={applicationsActive}>
              Applications
            </AdminTab>
            <AdminTab to={ADMIN_ROUTES.decisionEmails} active={decisionEmailsActive}>
              Decision emails
            </AdminTab>
          </div>
        </nav>
        <main id="admin-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8">
          <Outlet />
        </main>
      </div>
    </StormPageFrame>
  );
}
