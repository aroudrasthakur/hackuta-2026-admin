import { useEffect, useRef, type ReactNode } from "react";
import type { ScanOutcome } from "../../lib/scanResults";
import { scanPrimaryButtonClass } from "../../lib/scanButtonClasses";
import { FailureIcon, SuccessIcon, WarningIcon } from "./VolunteerIcons";

const TONES = {
  success: { label: "Success", Icon: SuccessIcon },
  duplicate: { label: "Already done", Icon: WarningIcon },
  error: { label: "Not completed", Icon: FailureIcon },
} as const;

/** Final outcome with a focused Scan next action for fast repeat scanning. `children` adds details such as a receipt. */
export function ScanResult({ outcome, onScanNext, children, secondaryAction }: {
  outcome: ScanOutcome;
  onScanNext: () => void;
  children?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  const { label, Icon } = TONES[outcome.tone];
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);

  return (
    <section aria-label="Scan result" className={`volunteer-result volunteer-result--${outcome.tone}`}>
      <div role={outcome.tone === "error" ? "alert" : "status"} className="volunteer-result__body">
        <div className="volunteer-result__summary">
          <span className="volunteer-result__badge" aria-hidden="true"><Icon /></span>
          <div className="min-w-0">
            <h2 className="volunteer-result__title">
              <span className="sr-only">{label}: </span>
              {outcome.title}
            </h2>
            <p className="volunteer-result__message">{outcome.detail}</p>
          </div>
        </div>
        {children}
      </div>
      <div className="volunteer-result__actions">
        <button ref={nextRef} type="button" className={scanPrimaryButtonClass} onClick={onScanNext}>
          Scan next
        </button>
        {secondaryAction}
      </div>
    </section>
  );
}
