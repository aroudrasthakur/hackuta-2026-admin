import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { SignInPasswordInput } from "../../components/SignInPasswordInput";
import { StormPageFrame } from "../../components/StormPageFrame";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { LoadingState } from "../../components/states/LoadingState";
import { intendedStaffDestination } from "../../lib/staffRouteAccess";
import { useVolunteerAccess } from "../../hooks/useVolunteerAccess";
import { SIGN_IN_FAILED_MESSAGE } from "../../../shared/admin/errors";
import { reportUserFacingError } from "../../lib/userFacingError";

export function AdminLoginPage() {
  const location = useLocation();
  const options = useVolunteerAccess();
  const { signIn, isAuthenticated, isLoading, sessionReady, staff, authError } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!sessionReady || isLoading || (isAuthenticated && staff?.role === "volunteer" && options === undefined)) {
    return (
      <StormPageFrame>
        <main id="admin-content" tabIndex={-1} className="flex min-h-screen items-center justify-center px-4">
          <LoadingState message="Checking session…" />
        </main>
      </StormPageFrame>
    );
  }

  if (isAuthenticated && staff) {
    return <Navigate to={intendedStaffDestination(location.state, staff, options)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(reportUserFacingError("Organizer sign-in failed", caught, SIGN_IN_FAILED_MESSAGE));
    } finally {
      setPending(false);
    }
  }

  const message = authError ?? error;

  return (
    <StormPageFrame>
      <main id="admin-content" tabIndex={-1} className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="sign-in-card w-full">
          <div className="sign-in-card__heading">
            <p className="text-xs uppercase tracking-wide text-mist">HackUTA 2026</p>
            <h1 className="sign-in-card__title">Organizer sign-in</h1>
            <p className="sign-in-card__subtitle">
              Reviewer, admin, and volunteer accounts are provisioned by the organizing
              team. There is no public sign-up.
            </p>
          </div>

          <form className="sign-in-form sign-in-card__body" onSubmit={handleSubmit}>
            <label className="sign-in-field">
              <span className="sign-in-field__label">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="sign-in-field__input"
              />
            </label>

            <div className="sign-in-field">
              <label className="sign-in-field__label" htmlFor="admin-sign-in-password">
                Password
              </label>
              <SignInPasswordInput
                id="admin-sign-in-password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="sign-in-field__input"
              />
            </div>

            {message ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {message}
              </p>
            ) : null}

            <button type="submit" disabled={pending} className="sign-in-btn">
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    </StormPageFrame>
  );
}
