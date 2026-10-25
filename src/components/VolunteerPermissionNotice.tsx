import { useState } from "react";
import { useVolunteerAccess } from "../contexts/volunteerAccessContext";
import { useAdminAuth } from "../hooks/useAdminAuth";

export function VolunteerPermissionNotice() {
  const options = useVolunteerAccess();
  const { staff } = useAdminAuth();
  const grants = [
    ...(staff?.canCheckIn && options?.canCheckIn ? ["check-in"] : []),
    ...(staff?.canFoodCheckIn && options?.canFoodCheckIn ? ["food"] : []),
    ...(options?.events.map((event) => event.eventId) ?? []),
  ].sort().join(",");
  const [previous, setPrevious] = useState(grants);
  const [revoked, setRevoked] = useState(false);
  // Compare subscription snapshots before rendering children, including event removals.
  if (previous !== grants) {
    setPrevious(grants);
    if (previous.split(",").some((grant) => grant && !grants.split(",").includes(grant))) {
      setRevoked(true);
    }
  }
  return revoked ? (
    <p role="status" className="admin-card mb-6 p-4">Some of your scan access was removed. Your available actions and events are up to date. Contact an administrator if you need help.</p>
  ) : null;
}
