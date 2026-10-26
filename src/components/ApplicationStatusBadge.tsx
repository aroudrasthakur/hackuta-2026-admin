import { dashboardReviewStatusLabel } from "../lib/applicationDisplay";
import { AdminStatusBadge, type StatusTone } from "./AdminStatusBadge";

const statusTones = {
  unreviewed: "neutral", under_review: "info", stale: "warning",
  accepted: "positive", waitlisted: "warning", rejected: "negative", withdrawn: "neutral",
} satisfies Record<string, StatusTone>;

export function ApplicationStatusBadge({
  status,
  className = "",
}: {
  status: keyof typeof statusTones | null;
  className?: string;
}) {
  return (
    <AdminStatusBadge tone={statusTones[status ?? "unreviewed"]} className={className}>
      {dashboardReviewStatusLabel(status)}
    </AdminStatusBadge>
  );
}
