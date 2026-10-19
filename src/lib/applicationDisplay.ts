import { formatApplicationDisplayDate } from "./dateFormat";

/** Preserve meaningful false/zero values while presenting missing answers cleanly. */
export function formatApplicationAnswer(value: unknown): string {
  if (value === null || value === undefined) return "Not provided";
  if (typeof value === "string") return value.trim() ? value : "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not provided";
  return String(value);
}

export const dashboardReviewStatusLabels = {
  unreviewed: "Need review",
  under_review: "In review",
  stale: "Available to reclaim",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
} as const;

export function dashboardReviewStatusLabel(
  status: keyof typeof dashboardReviewStatusLabels | null | undefined,
) {
  if (!status || status === "unreviewed") return dashboardReviewStatusLabels.unreviewed;
  return dashboardReviewStatusLabels[status];
}

export function formatApplicationDate(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : formatApplicationDisplayDate(value);
}

/** Legacy applicant records may predate registration URL validation. */
export function applicationLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
