/** Numbered progress for a scan flow. `current` past the last step marks every step done. */
export function ScanSteps({ steps, current, label = "Scan progress" }: { steps: readonly string[]; current: number; label?: string }) {
  return (
    <ol aria-label={label} className="volunteer-steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={`volunteer-steps__item${index === current ? " volunteer-steps__item--current" : index < current ? " volunteer-steps__item--done" : ""}`}
        >
          {index < current ? <span className="sr-only">Done: </span> : null}
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}
