import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { LoadingState } from "../../components/states/LoadingState";
import { ADMIN_ROUTES } from "../../types/routes";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { signIn, isAuthenticated, isLoading, staff } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (isLoading) {
    return <LoadingState message="Checking session…" />;
  }

  if (isAuthenticated && staff) {
    return <Navigate to={ADMIN_ROUTES.dashboard} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await signIn(email.trim(), password);
      navigate(ADMIN_ROUTES.dashboard, { replace: true });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Sign-in failed. Please try again.";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-light px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-sand bg-clay/40 p-8 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-mist">HackUTA 2026</p>
        <h1 className="mt-1 font-display text-3xl text-night">Organizer sign-in</h1>
        <p className="mt-2 text-sm text-ocean">
          Reviewer and admin accounts are provisioned by the organizing team. There is
          no public sign-up.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-night">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-sand bg-light px-3 py-2 text-ink outline-none ring-ocean focus:ring-2"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-night">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-sand bg-light px-3 py-2 text-ink outline-none ring-ocean focus:ring-2"
            />
          </label>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-ocean px-4 py-2.5 text-sm font-medium text-light transition hover:bg-night disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
