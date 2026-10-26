import { useEffect, useRef } from "react";
import type { ScanOutcome } from "../../lib/scanResults";
import { scanPrimaryButtonClass } from "../../lib/scanButtonClasses";

const TONES = {
  success: { panel: "border-emerald-700 bg-emerald-50 text-emerald-950", icon: "✓", label: "Success" },
  duplicate: { panel: "border-amber-500 bg-amber-50 text-amber-950", icon: "!", label: "Already done" },
  error: { panel: "border-red-700 bg-red-50 text-red-950", icon: "✕", label: "Not completed" },
} as const;

/** Final outcome with a focused Scan next action for fast repeat scanning. */
export function ScanResult({ outcome, onScanNext }: { outcome: ScanOutcome; onScanNext: () => void }) {
  const tone = TONES[outcome.tone];
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);

  return (
    <section aria-label="Scan result" className="space-y-4">
      <div role={outcome.tone === "error" ? "alert" : "status"} className={`rounded-2xl border-2 p-5 ${tone.panel}`}>
        <p className="flex items-center gap-3 text-2xl font-semibold">
          <span aria-hidden="true" className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-2xl">
            {tone.icon}
          </span>
          <span><span className="sr-only">{tone.label}: </span>{outcome.title}</span>
        </p>
        <p className="mt-2 text-lg">{outcome.detail}</p>
      </div>
      <button ref={nextRef} type="button" className={scanPrimaryButtonClass} onClick={onScanNext}>
        Scan next
      </button>
    </section>
  );
}
