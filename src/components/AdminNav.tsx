import { NavLink } from "react-router-dom";
import { ADMIN_ROUTES } from "../types/routes";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-ocean text-light"
      : "text-ink hover:bg-sand/60 hover:text-night",
  ].join(" ");

export function AdminNav() {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Admin">
      <NavLink to={ADMIN_ROUTES.dashboard} end className={linkClass}>
        Dashboard
      </NavLink>
      <NavLink to={ADMIN_ROUTES.applications} className={linkClass}>
        Applications
      </NavLink>
      <NavLink to={ADMIN_ROUTES.participants} className={linkClass}>
        Participants
      </NavLink>
      <NavLink to={ADMIN_ROUTES.checkIn} className={linkClass}>
        Check-in
      </NavLink>
    </nav>
  );
}
