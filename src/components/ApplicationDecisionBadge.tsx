import type { SubmittedApplicationSummary } from "../convex/adminApi";
import { AdminStatusBadge } from "./AdminStatusBadge";

const decisionPresentations = {
  accepted: {
    label: "Accepted",
    tone: "positive",
  },
  rejected: {
    label: "Rejected",
    tone: "negative",
  },
  waitlisted: {
    label: "Waitlisted",
    tone: "warning",
  },
} as const;

type FinalDecisionStatus = keyof typeof decisionPresentations;

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
    <AdminStatusBadge
      label={`Decision: ${decision.label}`}
      tone={decision.tone}
    >
      {decision.label}
    </AdminStatusBadge>
  );
}
