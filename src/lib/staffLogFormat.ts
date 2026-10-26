import type { StaffConfigLogRow, VolunteerActionLogRow } from "../convex/adminApi";

export const VOLUNTEER_ACTION_LABELS: Record<VolunteerActionLogRow["action"], string> = {
  check_in: "Checked in",
  food_check_in: "Food redeemed",
  point_scan: "Points awarded",
  admin_adjust: "Points adjusted",
};

export const STAFF_CONFIG_LABELS: Record<StaffConfigLogRow["action"], string> = {
  volunteer_created: "Volunteer account created",
  volunteer_promoted: "Promoted from participant",
  volunteer_restored: "Access restored",
  volunteer_revoked: "Access revoked",
  volunteer_password_reset: "Password reset",
  volunteer_capabilities_updated: "Scan permissions changed",
  event_created: "Event created",
  event_updated: "Event updated",
  event_active_changed: "Event status changed",
  volunteer_event_access_updated: "Event assignments changed",
};

export function volunteerPermissions(volunteer: { canCheckIn: boolean; canFoodCheckIn: boolean }) {
  return [
    volunteer.canCheckIn ? "Check-in" : null,
    volunteer.canFoodCheckIn ? "Food" : null,
  ].filter(Boolean).join(", ") || "None";
}

export function formatLogTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

export function formatPointsDelta(delta: number | null) {
  if (delta === null) return "—";
  return delta > 0 ? `+${delta}` : String(delta);
}

/** Value for `<input type="datetime-local">` in the browser's time zone. */
export function toDateTimeInputValue(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Milliseconds for a `datetime-local` value, or null when it is empty or invalid. */
export function fromDateTimeInputValue(value: string) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}
