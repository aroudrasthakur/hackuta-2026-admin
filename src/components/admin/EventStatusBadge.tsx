import { eventStatus, type EventStatus } from "../../../shared/admin/volunteerRules";
import { AdminStatusBadge, type StatusTone } from "../AdminStatusBadge";

/** `active` is the only status in which volunteers can award points. */
const BADGES: Record<EventStatus, { label: string; tone: StatusTone }> = {
  active: { label: "Active", tone: "positive" },
  upcoming: { label: "Upcoming", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
  inactive: { label: "Switched off", tone: "warning" },
};

export function EventStatusBadge({ event, now }: {
  event: { active: boolean; startsAt: number; endsAt: number };
  now: number;
}) {
  const { label, tone } = BADGES[eventStatus(event, now)];
  return <AdminStatusBadge tone={tone}>{label}</AdminStatusBadge>;
}
