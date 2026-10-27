import { useState, type FormEvent } from "react";
import type { GenericId } from "convex/values";
import { useMutation } from "../../convex/reactBindings";
import { assignParticipantBadgeRef, type ParticipantDetails } from "../../convex/adminApi";
import { reportUserFacingError } from "../../lib/userFacingError";
import { reviewPrimaryButtonClass, reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";
import { BADGE_REASON_MAX_LENGTH, normalizeBadgeQr } from "../../../shared/admin/qrValues";
import { QrScanner } from "../volunteer/QrScanner";

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

/**
 * Badge status and admin-only badge recovery for one participant. The new
 * badge is scanned (or typed), never shown, and sent once with a reason. The
 * server retires the old badge and keeps points, meals, and purchases.
 */
export function ParticipantBadgeSection({ sessionToken, participantId, name, checkedInAt, badge, disabled, onDone }: {
  sessionToken: string;
  participantId: GenericId<"participants">;
  name: string;
  checkedInAt: number | null;
  badge: ParticipantDetails["badge"];
  disabled: boolean;
  onDone: (notice: string) => void;
}) {
  const assign = useMutation(assignParticipantBadgeRef);
  const [editing, setEditing] = useState<{ expectedBadgeAssignedAt: number | null } | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replacing = badge !== null;
  const action = replacing ? "Replace badge" : "Assign badge";

  function begin() {
    setEditing({ expectedBadgeAssignedAt: badge?.assignedAt ?? null });
    setScanned(null);
    setReason("");
    setError(null);
  }

  function cancel() {
    setEditing(null);
    setScanned(null);
    setReason("");
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !scanned || busy) return;
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > BADGE_REASON_MAX_LENGTH) {
      setError(`Enter a reason for the badge change (up to ${BADGE_REASON_MAX_LENGTH} characters).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await assign({
        sessionToken,
        participantId,
        badgeQrCodeToken: scanned,
        reason: trimmed,
        expectedBadgeAssignedAt: editing.expectedBadgeAssignedAt,
      });
      cancel();
      onDone(replacing
        ? `Badge replaced. ${name}'s old badge no longer works; points, meals, and purchases are unchanged.`
        : `Badge assigned. ${name}'s registration QR no longer works; they'll use the badge from now on.`);
    } catch (caught) {
      setScanned(null);
      setError(reportUserFacingError(
        "Unable to change participant badge",
        caught,
        "The badge was not changed. Scan the badge again and try again.",
        { source: "ParticipantBadgeSection.submit" },
      ));
    } finally {
      setBusy(false);
    }
  }

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
          Checked in without a badge. Food, points, and the shop need a badge, so assign one before they can use them.
        </p>
      )}

      {error ? <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p> : null}

      {editing ? (
        <div className="space-y-4">
          {replacing ? (
            <p className="text-sm text-ocean">
              Use this for a lost, damaged, or wrong badge. The current badge stops working immediately and can never be used again.
            </p>
          ) : null}
          {scanned === null ? (
            <QrScanner mode="badge" onScan={(value) => { if (normalizeBadgeQr(value)) { setScanned(value); setError(null); } }} />
          ) : (
            <form className="space-y-4" onSubmit={(event) => void submit(event)}>
              <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
                New badge scanned. It's checked again when you confirm.
              </p>
              <label className="admin-field">
                Reason
                <textarea
                  required
                  maxLength={BADGE_REASON_MAX_LENGTH}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={replacing ? "For example: badge lost, badge damaged" : "For example: checked in before badges were issued"}
                  className="admin-field__control min-h-20 resize-y"
                />
              </label>
              <p className="text-right text-xs text-ocean">{reason.length}/{BADGE_REASON_MAX_LENGTH}</p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy || disabled} className={reviewPrimaryButtonClass}>
                  {busy ? "Saving…" : replacing ? "Confirm badge replacement" : "Confirm badge assignment"}
                </button>
                <button type="button" disabled={busy} className={reviewSecondaryButtonClass} onClick={() => setScanned(null)}>
                  Scan a different badge
                </button>
              </div>
            </form>
          )}
          <button type="button" disabled={busy} className={reviewSecondaryButtonClass} onClick={cancel}>Cancel</button>
        </div>
      ) : checkedInAt !== null ? (
        <button type="button" disabled={disabled} className={reviewSecondaryButtonClass} onClick={begin}>{action}</button>
      ) : null}
    </section>
  );
}
