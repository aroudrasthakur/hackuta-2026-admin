/** Numbered progress for a scan flow. `current` past the last step marks every step done. */
export function ScanSteps({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol aria-label="Scan progress" className="grid gap-2 text-center text-sm font-semibold" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={`rounded-lg border px-2 py-2 ${index === current ? "border-ocean bg-ocean text-light" : index < current ? "border-ocean/40 bg-white text-ocean" : "border-sand bg-white/60 text-mist"}`}
        >
          {index < current ? <span className="sr-only">Done: </span> : null}
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}
