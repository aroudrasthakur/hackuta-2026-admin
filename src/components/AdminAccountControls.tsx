import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { logAdminError } from "../../shared/admin/logAdminError";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { subscribeMediaQuery } from "../lib/matchMediaSubscribe";
import { ADMIN_ROUTES } from "../types/routes";

function formatRole(role: string | null | undefined) {
  if (!role) {
    return "";
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function AdminAccountControls() {
  const navigate = useNavigate();
  const { staff, signOut } = useAdminAuth();
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const signOutMenuItemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    return subscribeMediaQuery("(max-width: 639px)", (matches) => {
      setCompact(matches);
      if (!matches) {
        setMenuOpen(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    signOutMenuItemRef.current?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
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
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
      navigate(ADMIN_ROUTES.login, { replace: true });
    } catch (error) {
      logAdminError("Organizer sign-out failed", error, {
        source: "AdminAccountControls.handleSignOut",
        route: "/api/admin/sign-out",
      });
      setSignOutError("Unable to sign out. Please try again.");
      setIsSigningOut(false);
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      setMenuOpen(false);
      // Resume normal document navigation from the trigger when the menu closes.
      menuButtonRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    signOutMenuItemRef.current?.focus();
  }

  const roleLabel = staff?.role ? formatRole(staff.role) : null;
  const signOutLabel = isSigningOut ? "Signing out…" : "Sign out";

  return (
    <div className="admin-topbar__account">
      {staff && !compact ? (
        <>
          <p className="admin-topbar__identity" title={`${staff.name} · ${roleLabel}`}>
            <span className="admin-topbar__identity-name">{staff.name}</span>
            {roleLabel ? (
              <span className="admin-topbar__identity-role">{roleLabel}</span>
            ) : null}
          </p>
          <span className="admin-topbar__divider" aria-hidden="true">
            |
          </span>
        </>
      ) : null}

      {staff && compact ? (
        <div className="relative" ref={menuRef}>
          <button
            ref={menuButtonRef}
            type="button"
            className="admin-topbar__chip"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-haspopup="menu"
            aria-label={`Account menu for ${staff.name}`}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setMenuOpen(true);
              }
            }}
            disabled={isSigningOut}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="admin-topbar__chip-label">{staff.name}</span>
            <span aria-hidden="true">{menuOpen ? "▴" : "▾"}</span>
          </button>
          {menuOpen ? (
            <div
              id={menuId}
              role="menu"
              className="admin-topbar__menu"
              aria-label="Account"
              onKeyDown={handleMenuKeyDown}
            >
              <div role="presentation" className="admin-topbar__menu-header">
                <p className="admin-topbar__menu-name">{staff.name}</p>
                {roleLabel ? <p className="admin-topbar__menu-role">{roleLabel}</p> : null}
              </div>
              <button
                ref={signOutMenuItemRef}
                type="button"
                role="menuitem"
                className="admin-topbar__menu-item"
                disabled={isSigningOut}
                onClick={() => void handleSignOut()}
              >
                {signOutLabel}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {staff && !compact ? (
        <button
          type="button"
          className="admin-topbar__sign-out"
          disabled={isSigningOut}
          onClick={() => void handleSignOut()}
        >
          {signOutLabel}
        </button>
      ) : null}

      {signOutError ? (
        <p role="alert" className="admin-topbar__sign-out-error">
          {signOutError}
        </p>
      ) : null}
    </div>
  );
}
