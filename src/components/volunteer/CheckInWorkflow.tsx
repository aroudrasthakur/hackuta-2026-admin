import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoadingState } from "../states/LoadingState";
import { useCheckInWorkflow, type CheckInWorkflowState } from "../../hooks/useCheckInWorkflow";
import type { ScanOutcome } from "../../lib/scanResults";
import { scanConfirmButtonClass, scanSecondaryButtonClass } from "../../lib/scanButtonClasses";
import { QrScanner, type ScanMode, type ScanSource } from "./QrScanner";
import { ScanResult } from "./ScanResult";
import { ScanSteps } from "./ScanSteps";

const STEPS = ["Registration QR", "Badge QR", "Confirm"] as const;

function stepIndex(state: CheckInWorkflowState) {
  switch (state.step) {
    case "registration":
    case "checking_registration":
      return 0;
    case "badge":
    case "checking_badge":
      return 1;
    case "confirm":
      return 2;
    case "result":
      return state.outcome.tone === "success" ? STEPS.length : -1;
  }
}

const MODE_LABELS: Record<ScanMode, { title: string; where: string; className: string }> = {
  registration: {
    title: "Scan the registration QR",
    where: "On the participant's phone, in the participant portal",
    className: "border-ocean bg-ocean/10 text-night",
  },
  badge: {
    title: "Scan the badge QR",
    where: "Printed on the physical badge you're handing them",
    className: "border-amber-500 bg-amber-50 text-amber-950",
  },
};

function ScanModeBanner({ mode, step }: { mode: ScanMode; step: number }) {
  const label = MODE_LABELS[mode];
  return (
    <div className={`rounded-2xl border-2 p-4 ${label.className}`} data-scan-mode={mode}>
      <p className="text-sm font-semibold uppercase tracking-wide">Step {step} of 3</p>
      <p className="text-2xl font-bold">{label.title}</p>
      <p className="text-base">{label.where}</p>
    </div>
  );
}

function StepError({ error }: { error: ScanOutcome | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="admin-callout admin-callout--alert text-base">
      <p className="font-semibold">{error.title}</p>
      <p>{error.detail}</p>
    </div>
  );
}

function ParticipantCard({ name, children }: { name: string; children?: ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <section aria-labelledby="check-in-participant" className="admin-card space-y-2 p-5">
      <p className="text-sm font-semibold uppercase tracking-wide text-ocean">Participant</p>
      <h2 id="check-in-participant" ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-night">{name}</h2>
      <p className="text-base font-semibold text-emerald-800">Registration verified · not checked in yet</p>
      {children}
    </section>
  );
}

/**
 * Door check-in in three steps: the registration QR identifies the
 * participant, the badge QR picks their physical badge, and Confirm checks
 * them in. Nothing is saved before Confirm. Scanned values are never shown.
 */
export function CheckInWorkflow() {
  const { state, scanRegistration, scanBadge, confirm, back, restart } = useCheckInWorkflow();
  const [cameraPreferred, setCameraPreferred] = useState(false);
  const onScan = (scan: (rawValue: string) => Promise<void>) => (rawValue: string, source: ScanSource) => {
    setCameraPreferred(source === "camera");
    void scan(rawValue);
  };

  return (
    <div className="space-y-5">
      <ScanSteps steps={STEPS} current={stepIndex(state)} />

      {state.step === "registration" ? (
        <>
          <ScanModeBanner mode="registration" step={1} />
          <p className="text-base text-ocean">This only looks them up. Nothing is saved until you confirm.</p>
          <StepError error={state.error} />
          <QrScanner key="registration" mode="registration" onScan={onScan(scanRegistration)} autoStart={cameraPreferred} />
        </>
      ) : null}

      {state.step === "checking_registration" ? (
        <div className="space-y-3">
          <LoadingState message="Looking up registration…" />
          <button type="button" className={scanSecondaryButtonClass} onClick={restart}>Cancel</button>
        </div>
      ) : null}

      {state.step === "badge" ? (
        <>
          <ParticipantCard name={state.participant.name} />
          <ScanModeBanner mode="badge" step={2} />
          <p className="text-base text-ocean">Hand {state.participant.name} an unused badge, then scan the code printed on it.</p>
          <StepError error={state.error} />
          <QrScanner key="badge" mode="badge" onScan={onScan(scanBadge)} autoStart={cameraPreferred} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className={scanSecondaryButtonClass} onClick={back}>Back: scan a different registration</button>
            <button type="button" className={scanSecondaryButtonClass} onClick={restart}>Start over</button>
          </div>
        </>
      ) : null}

      {state.step === "checking_badge" ? (
        <div className="space-y-3">
          <ParticipantCard name={state.participant.name} />
          <LoadingState message="Checking badge…" />
          <button type="button" className={scanSecondaryButtonClass} onClick={back}>Cancel</button>
        </div>
      ) : null}

      {state.step === "confirm" ? (
        <>
          <ParticipantCard name={state.participant.name}>
            <dl className="grid gap-3 pt-2 text-lg">
              <div>
                <dt className="admin-meta__label">Badge</dt>
                <dd className="font-semibold text-night">Scanned and unused, ready to assign</dd>
              </div>
            </dl>
          </ParticipantCard>
          <p className="admin-callout text-base">
            Confirming checks {state.participant.name} in and links this badge to them. Their registration QR stops working,
            and they'll use the badge for food, points, and the shop.
          </p>
          <StepError error={state.error} />
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className={scanConfirmButtonClass}
              onClick={() => void confirm()}
              disabled={state.submitting}
              aria-busy={state.submitting || undefined}
            >
              {state.submitting ? "Checking in…" : state.error ? "Try again: confirm check-in" : "Confirm check-in"}
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className={scanSecondaryButtonClass} onClick={back} disabled={state.submitting}>
                Back: scan a different badge
              </button>
              <button type="button" className={scanSecondaryButtonClass} onClick={restart} disabled={state.submitting}>
                Start over
              </button>
            </div>
          </div>
        </>
      ) : null}

      {state.step === "result" ? <ScanResult outcome={state.outcome} onScanNext={restart} /> : null}
    </div>
  );
}
