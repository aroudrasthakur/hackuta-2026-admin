import { Outlet, useNavigate } from "react-router-dom";
import { AdminNav } from "../components/AdminNav";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { ADMIN_ROUTES } from "../types/routes";

export function AdminLayout() {
  const navigate = useNavigate();
  const { staff, signOut } = useAdminAuth();
  return (
    <div className="min-h-screen bg-light">
      <header className="border-b border-sand bg-clay/50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-mist">HackUTA 2026</p>
            <h1 className="font-display text-2xl text-night">Organizer admin</h1>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <AdminNav />
            {staff ? (
              <p className="text-sm text-mist">
                Signed in as <span className="text-night">{staff.name}</span> ({staff.role})
              </p>
            ) : null}
            <button
              type="button"
              className="text-sm text-ocean underline-offset-2 hover:underline"
              onClick={() => {
                void signOut().then(() => navigate(ADMIN_ROUTES.login, { replace: true }));
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
