import type { ReactNode } from "react";

export function AdminPageHeader({ id, title, eyebrow, description, actions }: {
  id: string;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="admin-frieze">
      <img className="admin-frieze__art" src="/images/shop/pillars.webp" alt="" aria-hidden="true" width={281} height={480} decoding="async" />
      <header className="admin-page-header">
        <div className="admin-page-header__copy">
          <h1 id={id} className="admin-page-title">{title}</h1>
          {eyebrow || description ? (
            <div className="admin-page-header__description">
              {eyebrow ? <span className="admin-eyebrow">{eyebrow}</span> : null}
              {description}
            </div>
          ) : null}
        </div>
        {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
      </header>
      <span aria-hidden="true" className="admin-meander admin-meander--flip" />
    </div>
  );
}
