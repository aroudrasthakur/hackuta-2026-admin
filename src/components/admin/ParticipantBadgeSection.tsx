import type { ParticipantDetails } from "../../convex/adminApi";

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

/** Read-only badge status for one participant. Badges are assigned at the check-in desk. */
export function ParticipantBadgeSection({ checkedInAt, badge }: {
  checkedInAt: number | null;
  badge: ParticipantDetails["badge"];
}) {
  return (
    <section aria-labelledby="participant-badge-heading" className="space-y-3 rounded-xl border border-sand bg-white/70 p-4">
      <h3 id="participant-badge-heading" className="font-semibold text-night">Badge</h3>
      {badge ? (
        <p className="text-sm text-night">
          Assigned <time dateTime={new Date(badge.assignedAt).toISOString()}>{formatTimestamp(badge.assignedAt)}</time>
          {badge.assignedBy ? ` by ${badge.assignedBy.name}` : ""}.
        </p>
      ) : checkedInAt === null ? (
        <p className="text-sm text-ocean">No badge yet. A badge is assigned at the check-in desk.</p>
      ) : (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Checked in without a badge. Food, points, and the shop need a badge.
        </p>
      )}
    </section>
  );
}
