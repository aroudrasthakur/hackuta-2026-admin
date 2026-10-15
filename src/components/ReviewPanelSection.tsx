import type { ReactNode } from "react";

type ReviewPanelSectionProps = {
  "aria-label": string;
  title: string;
  description?: string;
  children: ReactNode;
};

/** Shared card layout for review claim and decision panels on the application page. */
export function ReviewPanelSection({
  "aria-label": ariaLabel,
  title,
  description,
  children,
}: ReviewPanelSectionProps) {
  return (
    <section
      aria-label={ariaLabel}
      className="rounded-lg border border-sand bg-white/60 p-4 space-y-3"
    >
      <div className="space-y-1">
        <h3 className="font-display text-lg text-night">{title}</h3>
        {description ? <p className="text-sm text-ocean">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
