import { useEffect, useRef, useState } from "react";
import type { GenericId } from "convex/values";
import { useMutation } from "../../convex/reactBindings";
import { lookupParticipantByQrRef, type ParticipantQrLookup } from "../../convex/adminApi";
import { ScanNetworkError, withScanTimeout } from "../../lib/scanResults";
import { reportUserFacingError } from "../../lib/userFacingError";
import { reviewSecondaryButtonClass } from "../../lib/reviewButtonClasses";
import { LoadingState } from "../states/LoadingState";
import { QrScanner, type ScanSource } from "../volunteer/QrScanner";

export type BadgeLookupMatch = {
  participantId: GenericId<"participants">;
  name: string;
  matchedBy: "badge" | "registration";
};

const LOOKUP_MESSAGES: Record<Exclude<ParticipantQrLookup["status"], "ok">, string> = {
  qr_not_found: "No participant is assigned to that code. Check the badge and try again.",
  badge_retired: "That badge was replaced and no longer belongs to anyone. Ask the participant for their current badge.",
  participant_not_eligible: "That code belongs to someone who is not an accepted participant.",
  rate_limited: "Too many scans in a short time. Wait a minute, then try again.",
};

/**
 * Modal badge scanner for administrators. Resolves a badge (or registration)
 * QR code to an accepted participant and hands the match to `onFound`; the
 * camera only runs while the dialog is open.
 */
export function BadgeLookupDialog({ sessionToken, open, onClose, onFound }: {
  sessionToken: string;
  open: boolean;
  onClose: () => void;
  onFound: (match: BadgeLookupMatch) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const lookup = useMutation(lookupParticipantByQrRef);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraPreferred, setCameraPreferred] = useState(false);
  const titleId = "badge-lookup-title";

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setError(null);
      setResolving(false);
      setCameraPreferred(false);
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // The camera preview is tall; bring a failed lookup's message back into view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);

  async function onScan(qrValue: string, source: ScanSource) {
    setCameraPreferred(source === "camera");
    setResolving(true);
    setError(null);
    try {
      const result = await withScanTimeout(() => lookup({ sessionToken, qrValue }));
      if (result.status === "ok") {
        onFound({ participantId: result.participantId, name: result.name, matchedBy: result.matchedBy });
        return;
      }
      setError(LOOKUP_MESSAGES[result.status]);
    } catch (caught) {
      setError(caught instanceof ScanNetworkError
        ? "The lookup didn't reach the server. Check your connection and try again."
        : reportUserFacingError(
          "Unable to look up badge",
          caught,
          "The badge could not be looked up. Please try again.",
          { source: "BadgeLookupDialog.onScan" },
        ));
    } finally {
      setResolving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-modal="true"
      className="participants-dialog"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={() => { if (open) onClose(); }}
    >
      {open ? (
        <div className="flex max-h-full min-h-0 flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-sand px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="admin-card__title">Scan badge</h2>
              <p className="mt-1 text-sm text-ocean">Scan a participant's badge QR code to open their details.</p>
            </div>
            <button type="button" onClick={onClose} className={reviewSecondaryButtonClass}>Close</button>
          </header>
          <div className="min-h-0 space-y-5 overflow-y-auto p-5">
            {error ? <p ref={errorRef} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p> : null}
            {resolving
              ? <LoadingState message="Looking up participant…" />
              : (
                <QrScanner
                  mode="badge"
                  allowManualEntry
                  autoStart={cameraPreferred}
                  onScan={(qrValue, source) => void onScan(qrValue, source)}
                />
              )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
