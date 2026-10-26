import { useEffect, useRef } from "react";
import type { ScanOutcome, ScanPreview } from "../../lib/scanResults";
import { scanConfirmButtonClass, scanSecondaryButtonClass } from "../../lib/scanButtonClasses";

function confirmLabel(preview: ScanPreview) {
  if (preview.purpose === "point_scan") return `Award ${preview.event.pointsAwarded} points`;
  if (preview.purpose === "food_check_in") return "Confirm food given";
  return "Confirm check-in";
}

/**
 * Participant details for one explicit confirmation. Dietary information is
 * shown only for food previews and disappears with this component.
 */
export function ScanConfirmation({
  preview,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  preview: ScanPreview;
  submitting: boolean;
  error: ScanOutcome | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section aria-labelledby="scan-confirm-heading" className="admin-card space-y-5 p-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-ocean">Confirm participant</p>
        <h2 id="scan-confirm-heading" ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-night">
          {preview.participant.name}
        </h2>
      </div>

      <dl className="grid gap-3 text-lg">
        {preview.purpose === "check_in" ? (
          <div>
            <dt className="admin-meta__label">Check-in status</dt>
            <dd className="font-semibold text-night">Not checked in yet</dd>
          </div>
        ) : null}
        {preview.purpose === "food_check_in" ? (
          <>
            <div>
              <dt className="admin-meta__label">Food status</dt>
              <dd className="font-semibold text-night">Not redeemed yet</dd>
            </div>
            <div className={preview.participant.dietaryInfo ? "admin-callout border-amber-300 bg-amber-50 text-amber-950" : ""}>
              <dt className="admin-meta__label">Dietary restrictions</dt>
              <dd className={preview.participant.dietaryInfo ? "text-xl font-semibold" : "text-night"}>
                {preview.participant.dietaryInfo ?? "None listed"}
              </dd>
            </div>
          </>
        ) : null}
        {preview.purpose === "point_scan" ? (
          <>
            <div>
              <dt className="admin-meta__label">Event</dt>
              <dd className="font-semibold text-night">{preview.event.name}</dd>
            </div>
            <div>
              <dt className="admin-meta__label">Award</dt>
              <dd className="text-2xl font-semibold text-night">{preview.event.pointsAwarded} points</dd>
            </div>
          </>
        ) : null}
      </dl>

      {error ? (
        <div role="alert" className="admin-callout admin-callout--alert text-base">
          <p className="font-semibold">{error.title}</p>
          <p>{error.detail}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className={scanConfirmButtonClass}
          onClick={onConfirm}
          disabled={submitting}
          aria-busy={submitting || undefined}
        >
          {submitting ? "Saving…" : error ? `Try again: ${confirmLabel(preview).toLowerCase()}` : confirmLabel(preview)}
        </button>
        <button type="button" className={scanSecondaryButtonClass} onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </section>
  );
}
