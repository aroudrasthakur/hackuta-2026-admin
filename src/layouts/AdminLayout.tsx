import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { AdminAccountControls } from "../components/AdminAccountControls";
import { AdminNav } from "../components/AdminNav";
import { StormPageFrame } from "../components/StormPageFrame";

export function AdminLayout() {
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
        <header ref={headerRef} className="admin-topbar">
          <div className="admin-topbar__inner">
            <div className="admin-topbar__brand">
              <p className="admin-topbar__brand-kicker">HackUTA 2026</p>
              <h1 className="admin-topbar__brand-title">Organizer Admin</h1>
              {import.meta.env.DEV &&
              import.meta.env.VITE_DEV_AUTH_BYPASS === "true" ? (
                <p className="mt-1 text-xs font-medium text-red-700">
                  Local development auth bypass is enabled
                </p>
              ) : null}
            </div>

            <AdminNav />

            <AdminAccountControls />
          </div>
        </header>
        <div style={{ height: headerOffset }} aria-hidden="true" />
        <main id="admin-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8">
          <Outlet />
        </main>
      </div>
    </StormPageFrame>
  );
}
