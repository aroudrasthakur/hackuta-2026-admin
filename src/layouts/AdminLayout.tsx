import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AdminNav } from "../components/AdminNav";

export function AdminLayout() {
  const { signOut } = useAuthActions();
  const [error, setError] = useState("");
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
            <button
              type="button"
              className="text-sm text-ocean underline-offset-2 hover:underline"
              onClick={() => { void signOut().catch(() => setError("Could not sign out. Try again.")); }}
            >
              Sign out
            </button>
            {error && <p role="alert">{error}</p>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
