import { useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useLocation } from "react-router-dom";
import { LoadingState } from "./states/LoadingState";

const accessRef = makeFunctionReference<"query", Record<string, never>, { role: "admin" | "reviewer" | null }>("admin/access:getAccess");

function OrganizerSignIn() {
  const { signIn } = useAuthActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("flow", "signIn");
    setBusy(true);
    setError("");
    try { await signIn("password", data); }
    catch { setError("Sign-in failed. Check your email and password and verify your account through registration."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-light p-6">
    <form onSubmit={(event) => { void submit(event); }} className="w-full max-w-md space-y-4 rounded-lg border border-sand p-6">
      <h1 className="font-display text-2xl">Organizer sign-in</h1>
      <p>Use your existing verified HackUTA account.</p>
      <label className="block">Email<input required name="email" type="email" autoComplete="username" className="mt-1 w-full rounded border border-sand p-2" /></label>
      <label className="block">Password<input required name="password" type="password" autoComplete="current-password" className="mt-1 w-full rounded border border-sand p-2" /></label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} className="rounded bg-ocean px-4 py-2 text-light">{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  </main>;
}

function OrganizerAccess({ children }: { children: ReactNode }) {
  const access = useQuery(accessRef, {});
  const { signOut } = useAuthActions();
  const [error, setError] = useState("");
  if (access === undefined) return <LoadingState message="Checking organizer access…" />;
  if (access.role) return children;
  return <main className="space-y-4 bg-light p-8">
    <h1 className="font-display text-xl">Organizer access required</h1>
    <p>This account needs a verified email and an assigned admin or reviewer role.</p>
    <button className="underline" onClick={() => { void signOut().catch(() => setError("Could not sign out. Try again.")); }}>Sign out</button>
    {error && <p role="alert">{error}</p>}
  </main>;
}

export function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const location = useLocation();
  // Explicit local sample preview never mounts a live query or grants organizer access.
  if (import.meta.env.DEV && location.pathname === "/admin/applications" && new URLSearchParams(location.search).get("preview") === "1") return children;
  if (isLoading) return <LoadingState message="Checking session…" />;
  if (!isAuthenticated) return <OrganizerSignIn />;
  return <OrganizerAccess>{children}</OrganizerAccess>;
}
