type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="admin-card admin-state">
      <span aria-hidden="true" className="admin-state__icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 5h16v15H4zM8 2v6m8-6v6M8 12h8m-8 4h5" /></svg>
      </span>
      <h2 className="text-lg font-semibold text-night">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm text-mist">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
import type { ReactNode } from "react";

