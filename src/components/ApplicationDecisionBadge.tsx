import type { SubmittedApplicationSummary } from "../convex/adminApi";

const decisionPresentations = {
  accepted: {
    label: "Accepted",
    className: "border-green-200 bg-green-50 text-green-800",
  },
  rejected: {
    label: "Rejected",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  waitlisted: {
    label: "Waitlisted",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
} as const;

type FinalDecisionStatus = keyof typeof decisionPresentations;

const DECISION_BADGE_BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-4 py-2 text-sm font-semibold";

function decisionPresentationForStatus(
  status: SubmittedApplicationSummary["reviewStatus"],
) {
  if (status === null || status === undefined || !(status in decisionPresentations)) {
    return null;
  }
  return decisionPresentations[status as FinalDecisionStatus];
}

export function ApplicationDecisionBadge({
  status,
}: {
  status: SubmittedApplicationSummary["reviewStatus"];
}) {
  const decision = decisionPresentationForStatus(status);

  if (!decision) return null;

  return (
    <span
      aria-label={`Decision: ${decision.label}`}
      className={`${DECISION_BADGE_BASE_CLASS} ${decision.className}`}
    >
      {decision.label}
    </span>
  );
}
