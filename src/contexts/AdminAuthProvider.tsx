import { useQuery } from "../convex/reactBindings";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ADMIN_ERROR_MESSAGES } from "../../shared/admin/errors";
import { getCurrentStaffRef } from "../convex/adminApi";
import {
  fetchAdminSessionToken,
  signInWithAdminCookie,
  signOutAdminCookie,
  startLocalDevAdminSession,
} from "../lib/adminSessionClient";
import { logAdminError } from "../../shared/admin/logAdminError";
import { UserFacingError } from "../lib/userFacingError";
import { AdminAuthContext, type AdminAuthContextValue, type StaffProfile } from "./adminAuthContext";

function toStaffProfile(
  staff: {
    adminId: string;
    email: string;
    name: string;
    role: string;
    canCheckIn?: boolean;
    canFoodCheckIn?: boolean;
    canRedeemShop?: boolean;
    expiresAt: number;
  },
): StaffProfile {
  return {
    ...staff,
    role: staff.role === "admin" ? "admin" : "volunteer",
  };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const devAuthEnabled =
          import.meta.env.DEV &&
          import.meta.env.VITE_DEV_AUTH_BYPASS === "true";
        if (devAuthEnabled) {
          try {
            await startLocalDevAdminSession();
          } catch (error) {
            // Dev-only setup hints (missing env vars, non-localhost) are meant for developers.
            if (!cancelled) {
              setAuthError(error instanceof Error ? error.message : "Local development sign-in failed.");
            }
            throw error;
          }
        }
        const token = await fetchAdminSessionToken();
        if (!cancelled) {
          setSessionToken(token);
        }
      } catch (error) {
        logAdminError("Unable to initialize organizer authentication", error, {
          source: "AdminAuthProvider.bootstrap",
        });
        if (!cancelled) {
          setAuthError(
            (current) =>
              current ?? "We couldn't check your sign-in status. Refresh the page to try again.",
          );
        }
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const staff = useQuery(
    getCurrentStaffRef,
    sessionToken ? { sessionToken } : "skip",
  );

  const expireSession = useCallback(() => {
    setSessionToken(null);
    setAuthError(ADMIN_ERROR_MESSAGES.NOT_AUTHENTICATED);
  }, []);

  // Server revocation/reset and invalid cookies all discard the local credential.
  useEffect(() => {
    // Synchronize an external Convex subscription with the local session credential.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sessionToken && staff === null) expireSession();
  }, [expireSession, sessionToken, staff]);

  const expiresAt = staff?.expiresAt;
  useEffect(() => {
    if (!sessionToken || expiresAt === undefined) return;
    const checkExpiry = () => {
      if (Date.now() >= expiresAt) expireSession();
    };
    // A quiet tab must expire even without another query result or user action.
    const timeout = window.setTimeout(expireSession, Math.max(0, expiresAt - Date.now()));
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [expireSession, expiresAt, sessionToken]);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    await signInWithAdminCookie(email, password);
    const token = await fetchAdminSessionToken();
    if (!token) {
      throw new UserFacingError(
        "We couldn't start your session. Make sure cookies are enabled and try again.",
      );
    }
    setSessionToken(token);
    setSessionReady(true);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutAdminCookie();
    } catch (error) {
      logAdminError("Organizer sign-out API failed", error, {
        source: "AdminAuthProvider.signOut",
        route: "/api/admin/sign-out",
      });
      throw error;
    }
    setSessionToken(null);
  }, []);

  const value = useMemo<AdminAuthContextValue>(() => {
    const isLoading = !sessionReady || (sessionToken !== null && staff === undefined);
    return {
      sessionToken,
      staff: sessionToken ? (staff ? toStaffProfile(staff) : null) : null,
      authError,
      isLoading,
      isAuthenticated: !!sessionToken && !!staff,
      sessionReady,
      signIn,
      signOut,
    };
  }, [authError, sessionReady, sessionToken, staff, signIn, signOut]);

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}
