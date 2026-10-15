import { dashboardReviewStatusLabel } from "../lib/applicationDisplay";

const statusClasses = {
  unreviewed: "border-slate-300 bg-slate-100 text-slate-800",
  under_review: "border-blue-200 bg-blue-50 text-blue-900",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-900",
  waitlisted: "border-amber-200 bg-amber-50 text-amber-900",
  rejected: "border-red-200 bg-red-50 text-red-900",
  withdrawn: "border-stone-300 bg-stone-100 text-stone-700",
};

export function ApplicationStatusBadge({ status }: { status: keyof typeof statusClasses | null }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses[status ?? "unreviewed"]}`}>
      {dashboardReviewStatusLabel(status)}
    </span>
  );
}
