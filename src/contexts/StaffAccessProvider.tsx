import type { ReactNode } from "react";
import { useQuery } from "../convex/reactBindings";
import { listMyScanOptionsRef } from "../convex/adminApi";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { VolunteerAccessContext } from "./volunteerAccessContext";

/** One reactive subscription shared by navigation, route guards, and dashboard. */
export function StaffAccessProvider({ children }: { children: ReactNode }) {
  const { staff, sessionToken, isAuthenticated, isLoading, sessionReady } = useAdminAuth();
  const canLoad = sessionReady && !isLoading && isAuthenticated && sessionToken && staff?.role === "volunteer";
  const options = useQuery(listMyScanOptionsRef, canLoad ? { sessionToken } : "skip");
  return <VolunteerAccessContext.Provider value={canLoad ? options : undefined}>{children}</VolunteerAccessContext.Provider>;
}
