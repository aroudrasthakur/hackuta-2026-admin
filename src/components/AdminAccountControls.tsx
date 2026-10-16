import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { ADMIN_ROUTES } from "../types/routes";

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function AdminAccountControls() {
  const navigate = useNavigate();
  const { staff, signOut } = useAdminAuth();
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => {
      setCompact(media.matches);
      if (!media.matches) setMenuOpen(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    addEventListener("pointerdown", onPointerDown);
    addEventListener("keydown", onKeyDown);
    return () => {
      removeEventListener("pointerdown", onPointerDown);
      removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
    navigate(ADMIN_ROUTES.login, { replace: true });
  }

  const roleLabel = staff ? formatRole(staff.role) : null;

  return (
    <div className="admin-topbar__account">
      {staff && !compact ? (
        <>
          <p className="admin-topbar__identity">
            <span className="admin-topbar__identity-name">{staff.name}</span>
            <span className="admin-topbar__identity-role"> · {roleLabel}</span>
          </p>
          <span className="admin-topbar__divider" aria-hidden="true">
            |
          </span>
        </>
      ) : null}

      {staff && compact ? (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="admin-topbar__chip"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-haspopup="menu"
            aria-label={`Account menu for ${staff.name}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="admin-topbar__chip-label">{staff.name}</span>
            <span aria-hidden="true">{menuOpen ? "▴" : "▾"}</span>
          </button>
          {menuOpen ? (
            <div id={menuId} role="menu" className="admin-topbar__menu">
              <p className="admin-topbar__menu-name">{staff.name}</p>
              <p className="admin-topbar__menu-role">{roleLabel}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <button type="button" className="admin-topbar__sign-out" onClick={() => void handleSignOut()}>
        Sign out
      </button>
    </div>
  );
}
