import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCurrentStaffRef } from "../convex/adminApi";
import {
  fetchAdminSessionToken,
  signInWithAdminCookie,
  signOutAdminCookie,
} from "../lib/adminSessionClient";
import { AdminAuthContext, type AdminAuthContextValue } from "./adminAuthContext";

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminSessionToken()
      .then((token) => {
        if (!cancelled) {
          setSessionToken(token);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const staff = useQuery(
    getCurrentStaffRef,
    sessionToken ? { sessionToken } : "skip",
  );

  const signIn = useCallback(async (email: string, password: string) => {
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
      sessionToken,
      staff: staff ?? null,
      isLoading,
      isAuthenticated: !!staff,
      sessionReady,
      signIn,
      signOut,
    };
  }, [sessionReady, sessionToken, staff, signIn, signOut]);

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}
