import { createContext, useContext } from "react";
import type { VolunteerScanOptions } from "../convex/adminApi";

export const VolunteerAccessContext = createContext<VolunteerScanOptions | undefined>(undefined);

export function useVolunteerAccess() {
  return useContext(VolunteerAccessContext);
}
