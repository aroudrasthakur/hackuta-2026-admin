import { useQuery } from "../convex/reactBindings";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { AdminAuthContext, type AdminAuthContextValue } from "./adminAuthContext";

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

  // A session that was valid and now resolves to null expired or was revoked server-side.
  const hadStaff = useRef(false);
  useEffect(() => {
    if (staff) {
      hadStaff.current = true;
    } else if (staff === null && hadStaff.current) {
      hadStaff.current = false;
      setAuthError(ADMIN_ERROR_MESSAGES.NOT_AUTHENTICATED);
    }
  }, [staff]);

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
      // Clear in-memory session even if the API call fails.
    }
    hadStaff.current = false;
    setSessionToken(null);
  }, []);

  const value = useMemo<AdminAuthContextValue>(() => {
    const isLoading = !sessionReady || (sessionToken !== null && staff === undefined);
    return {
      sessionToken,
      staff: staff ?? null,
      authError,
      isLoading,
      isAuthenticated: !!staff,
      sessionReady,
      signIn,
      signOut,
    };
  }, [authError, sessionReady, sessionToken, staff, signIn, signOut]);

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}
