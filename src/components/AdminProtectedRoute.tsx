import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { LoadingState } from "./states/LoadingState";
import { ADMIN_ROUTES } from "../types/routes";

type AdminProtectedRouteProps = {
  children: ReactNode;
};

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading, sessionToken } = useAdminAuth();

  if (!sessionToken) {
    return <Navigate to={ADMIN_ROUTES.login} replace state={{ from: location }} />;
  }

  if (isLoading) {
    return <LoadingState message="Verifying organizer session…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to={ADMIN_ROUTES.login} replace state={{ from: location }} />;
  }

  return children;
}
