import type { ReactNode } from "react";

export function AdminPageHeader({ id, title, description, actions }: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__copy">
        <h1 id={id} className="admin-page-title">{title}</h1>
        {description ? <div className="admin-page-header__description">{description}</div> : null}
      </div>
      {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
    </header>
  );
}
