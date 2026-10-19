import { dashboardReviewStatusLabel } from "../lib/applicationDisplay";

const statusClasses = {
  unreviewed: "border-violet-300 bg-violet-50 text-violet-950",
  under_review: "border-sky-300 bg-sky-50 text-sky-950",
  stale: "border-orange-300 bg-orange-50 text-orange-950",
  accepted: "border-emerald-300 bg-emerald-50 text-emerald-950",
  waitlisted: "border-amber-300 bg-amber-50 text-amber-950",
  rejected: "border-red-300 bg-red-50 text-red-950",
  withdrawn: "border-stone-300 bg-stone-100 text-stone-700",
};

export function ApplicationStatusBadge({
  status,
  className = "",
}: {
  status: keyof typeof statusClasses | null;
  className?: string;
}) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide ${statusClasses[status ?? "unreviewed"]} ${className}`}>
      {dashboardReviewStatusLabel(status)}
    </span>
  );
}
