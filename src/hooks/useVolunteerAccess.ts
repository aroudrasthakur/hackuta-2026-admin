import { useQuery } from "../convex/reactBindings";
import { listMyScanOptionsRef } from "../convex/adminApi";
import { useAdminAuth } from "./useAdminAuth";

/** Convex shares identical queries across the guard, navigation, and dashboard. */
export function useVolunteerAccess(includeAdmin = false) {
  const { staff, sessionToken, isAuthenticated, isLoading, sessionReady } = useAdminAuth();
  const isScannerRole =
    staff?.role === "volunteer" || (includeAdmin && staff?.role === "admin");
  const canLoad = sessionReady && !isLoading && isAuthenticated && sessionToken && isScannerRole;
  const options = useQuery(listMyScanOptionsRef, canLoad ? { sessionToken } : "skip");
  return canLoad ? options : undefined;
}
