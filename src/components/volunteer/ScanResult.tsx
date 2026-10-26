import { useEffect, useRef, type ReactNode } from "react";
import type { ScanOutcome } from "../../lib/scanResults";
import { scanPrimaryButtonClass, scanSecondaryButtonClass } from "../../lib/scanButtonClasses";
import { FailureIcon, SuccessIcon, WarningIcon } from "./VolunteerIcons";

const TONES = {
  success: { label: "Success", Icon: SuccessIcon },
  duplicate: { label: "Already done", Icon: WarningIcon },
  error: { label: "Not completed", Icon: FailureIcon },
} as const;

/** Final outcome with a focused Scan next action for fast repeat scanning. */
export function ScanResult({
  outcome,
  onScanNext,
  children,
  secondaryAction,
  onRetry,
}: {
  outcome: ScanOutcome;
  onScanNext: () => void;
  children?: ReactNode;
  secondaryAction?: ReactNode;
  onRetry?: () => void;
}) {
  const tone = TONES[outcome.tone];
  const Icon = tone.Icon;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);

  return (
    <section
      aria-label="Scan result"
      className={`volunteer-result volunteer-result--${outcome.tone}`}
    >
      <div className="volunteer-result__body">
        <div
          role={outcome.tone === "error" ? "alert" : "status"}
          aria-live={outcome.tone === "error" ? "assertive" : "polite"}
        >
          <span className="volunteer-result__badge" aria-hidden="true">
            <Icon />
          </span>
          <h2 className="volunteer-result__title mt-3">
            <span className="sr-only">{tone.label}: </span>
            {outcome.title}
          </h2>
          <p className="volunteer-result__message mt-2">{outcome.detail}</p>
          {children}
        </div>
        {secondaryAction}
        <div className="volunteer-result__actions">
          {outcome.tone === "error" && onRetry ? (
            <button type="button" className={scanSecondaryButtonClass} onClick={onRetry}>
              Try again
            </button>
          ) : null}
          <button ref={nextRef} type="button" className={scanPrimaryButtonClass} onClick={onScanNext}>
            Scan next
          </button>
        </div>
      </div>
    </section>
  );
}
