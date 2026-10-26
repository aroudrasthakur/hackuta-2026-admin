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
    <section aria-labelledby="scan-confirm-heading" className="volunteer-confirm">
      <div className="volunteer-confirm__body">
        <p className="volunteer-section-label">Confirm participant</p>
        <h2 id="scan-confirm-heading" ref={headingRef} tabIndex={-1} className="volunteer-confirm__name">
          {preview.participant.name}
        </h2>

        <dl className="volunteer-confirm__facts">
          {preview.purpose === "check_in" ? (
            <div>
              <dt>Check-in status</dt>
              <dd>Not checked in yet</dd>
            </div>
          ) : null}
          {preview.purpose === "food_check_in" ? (
            <>
              <div>
                <dt>Meal</dt>
                <dd>{preview.meal.name}</dd>
              </div>
              <div>
                <dt>Food status</dt>
                <dd>Not redeemed yet</dd>
              </div>
              <div className={preview.participant.dietaryInfo ? "admin-callout border-amber-300 bg-amber-50 text-amber-950 rounded-xl p-3" : undefined}>
                <dt>Dietary restrictions</dt>
                <dd className={preview.participant.dietaryInfo ? "text-xl font-semibold" : undefined}>
                  {preview.participant.dietaryInfo ?? "None listed"}
                </dd>
              </div>
            </>
          ) : null}
          {preview.purpose === "point_scan" ? (
            <>
              <div>
                <dt>Event</dt>
                <dd>{preview.event.name}</dd>
              </div>
              <div>
                <dt>Points to award</dt>
                <dd>{preview.event.pointsAwarded} points</dd>
              </div>
              <div>
                <dt>Award status</dt>
                <dd>Not awarded yet</dd>
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

        <div className="volunteer-confirm__actions">
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
      </div>
    </section>
  );
}
