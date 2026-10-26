import { useQuery } from "../convex/reactBindings";
import { listMyScanOptionsRef } from "../convex/adminApi";
import { useAdminAuth } from "./useAdminAuth";

/** Convex shares identical queries across the guard, navigation, and dashboard. */
export function useVolunteerAccess() {
  const { staff, sessionToken, isAuthenticated, isLoading, sessionReady } = useAdminAuth();
  const canLoad = sessionReady && !isLoading && isAuthenticated && sessionToken && staff?.role === "volunteer";
  const options = useQuery(listMyScanOptionsRef, canLoad ? { sessionToken } : "skip");
  return canLoad ? options : undefined;
}
