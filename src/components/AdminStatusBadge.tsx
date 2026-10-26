import type { ReactNode } from "react";

export type StatusTone = "neutral" | "positive" | "negative" | "warning" | "info";

/** Tone supplements the visible label; it never replaces it. */
export function AdminStatusBadge({ children, tone = "neutral", className = "", label }: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
  label?: string;
}) {
  return <span aria-label={label} className={`admin-badge admin-badge--${tone} ${className}`}>{children}</span>;
}
