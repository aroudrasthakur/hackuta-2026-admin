import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCurrentStaffRef } from "../convex/adminApi";
import {
  fetchAdminSessionToken,
  signInWithAdminCookie,
  signOutAdminCookie,
  startLocalDevAdminSession,
} from "../lib/adminSessionClient";
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
          await startLocalDevAdminSession();
        }
        const token = await fetchAdminSessionToken();
        if (!cancelled) {
          setSessionToken(token);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to initialize organizer authentication.";
          setAuthError(message);
          console.error("Unable to initialize organizer authentication", error);
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

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    await signInWithAdminCookie(email, password);
    const token = await fetchAdminSessionToken();
    if (!token) {
      throw new Error("Sign-in succeeded but no session cookie was established.");
    }
    setSessionToken(token);
    setSessionReady(true);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutAdminCookie();
    } catch {
      // Clear in-memory session even if the API call fails.
    }
    setSessionToken(null);
  }, []);

  const value = useMemo<AdminAuthContextValue>(() => {
    const isLoading = !sessionReady || (sessionToken !== null && staff === undefined);
    return {
      staff: staff ?? null,
      sessionToken,
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
