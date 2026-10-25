import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { LoadingState } from "./states/LoadingState";
import { ADMIN_ROUTES } from "../types/routes";

type AdminProtectedRouteProps = {
  children: ReactNode;
  volunteerOnly?: boolean;
};

export function AdminProtectedRoute({ children, volunteerOnly = false }: AdminProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading, sessionReady, staff } = useAdminAuth();

  if (!sessionReady || isLoading) {
    return <LoadingState message="Verifying organizer session…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to={ADMIN_ROUTES.login} replace state={{ from: location }} />;
  }

  if (staff?.role === "volunteer" && !volunteerOnly) {
    return <Navigate to={ADMIN_ROUTES.volunteer} replace />;
  }
  if (staff?.role !== "volunteer" && volunteerOnly) {
    return <Navigate to={ADMIN_ROUTES.applications} replace />;
  }

  return children;
}
