import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { LoadingState } from "./states/LoadingState";
import { ADMIN_ROUTES } from "../types/routes";
import { useVolunteerAccess } from "../hooks/useVolunteerAccess";
import { canAccessStaffRoute, staffHome } from "../lib/staffRouteAccess";

/** Without children, redirect to the current staff member's home. */
export function AdminProtectedRoute({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, isLoading, sessionReady, staff } = useAdminAuth();
  const options = useVolunteerAccess();
  const hasSession = isAuthenticated && !!staff;
  const [hadSession, setHadSession] = useState(hasSession);

  useEffect(() => {
    // Remember committed sessions so expiry clears the old account's destination.
    // This history cannot be derived from the current, unauthenticated inputs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasSession) setHadSession(true);
  }, [hasSession]);

  if (!sessionReady || isLoading) {
    return <LoadingState message="Verifying organizer session…" />;
  }

  if (!isAuthenticated || !staff) {
    return <Navigate to={ADMIN_ROUTES.login} replace state={hadSession ? null : { from: location }} />;
  }
  if (!children) return <Navigate to={staffHome(staff)} replace />;

  const allowed = canAccessStaffRoute(location.pathname, staff, options, location.search);
  if (allowed === undefined) {
    return <LoadingState message="Checking scan permissions…" />;
  }
  if (!allowed) {
    return <Navigate to={staffHome(staff)} replace state={{ accessNotice: "Your current permissions do not allow access to that page. If your responsibilities changed, contact an administrator." }} />;
  }

  return children;
}
