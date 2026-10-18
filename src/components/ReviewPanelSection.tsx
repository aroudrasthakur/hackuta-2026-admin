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
      className="admin-card admin-card__body space-y-3"
    >
      <div className="space-y-1">
        <h3 className="admin-card__title">{title}</h3>
        {description ? <p className="admin-card__hint">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
