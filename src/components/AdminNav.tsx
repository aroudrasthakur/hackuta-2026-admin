import { NavLink } from "react-router-dom";
import { ADMIN_ROUTES } from "../types/routes";

export function AdminNav() {
  return (
    <nav className="admin-topbar__nav" aria-label="Admin">
      <NavLink to={ADMIN_ROUTES.applications} className="admin-topbar__link">
        Applications
      </NavLink>
    </nav>
  );
}
