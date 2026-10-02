import type { ReactNode } from "react";

type AdminProtectedRouteProps = {
  children: ReactNode;
};

/** Placeholder until organizer auth is wired up. */
export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  return children;
}
