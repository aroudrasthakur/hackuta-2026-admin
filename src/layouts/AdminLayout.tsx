import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AdminNav } from "../components/AdminNav";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { reviewSecondaryButtonClass } from "../lib/reviewButtonClasses";
import { ADMIN_ROUTES } from "../types/routes";

export function AdminLayout() {
  const navigate = useNavigate();
  const { staff, signOut } = useAdminAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
      navigate(ADMIN_ROUTES.login, { replace: true });
    } catch {
      setSignOutError("Unable to sign out. Please try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <div className="admin-workspace min-h-screen bg-light">
      <a
        href="#admin-content"
        className="sr-only z-50 rounded-md bg-white p-3 text-night focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="border-b border-sand bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ocean">HackUTA 2026</p>
              <h1 className="text-lg font-semibold text-night">Organizer admin</h1>
              {import.meta.env.DEV &&
              import.meta.env.VITE_DEV_AUTH_BYPASS === "true" ? (
                <p className="mt-1 text-xs font-medium text-red-700">
                  Local development auth bypass is enabled
                </p>
              ) : null}
            </div>
            <AdminNav />
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-4 border-t border-sand pt-3 sm:w-auto sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            {staff ? (
              <p className="min-w-0 flex-1 break-words text-sm text-ocean">
                Signed in as <span className="font-medium text-night">{staff.name}</span> ({staff.role})
              </p>
            ) : null}
            <button
              type="button"
              className={`${reviewSecondaryButtonClass} shrink-0`}
              disabled={isSigningOut}
              onClick={() => void handleSignOut()}
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
            {signOutError && (
              <p role="alert" className="w-full text-sm text-red-800">{signOutError}</p>
            )}
          </div>
        </div>
      </header>
      <main
        id="admin-content"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
      >
        <Outlet />
      </main>
    </div>
  );
}
