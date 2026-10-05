import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  adminSignInRef,
  adminSignOutRef,
  getCurrentStaffRef,
} from "../convex/adminApi";
import {
  clearStoredAdminSession,
  readStoredAdminSession,
  writeStoredAdminSession,
} from "../lib/adminSessionStorage";
import { AdminAuthContext, type AdminAuthContextValue } from "./adminAuthContext";

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(readStoredAdminSession);

  const staff = useQuery(
    getCurrentStaffRef,
    session ? { sessionToken: session.sessionToken } : "skip",
  );

  const signInMutation = useMutation(adminSignInRef);
  const signOutMutation = useMutation(adminSignOutRef);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await signInMutation({ email, password });
      const stored = {
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt,
      };
      writeStoredAdminSession(stored);
      setSession(stored);
    },
    [signInMutation],
  );

  const signOut = useCallback(async () => {
    if (session?.sessionToken) {
      try {
        await signOutMutation({ sessionToken: session.sessionToken });
      } catch {
        // Clear local session even if the server row is already gone.
      }
    }
    clearStoredAdminSession();
    setSession(null);
  }, [session, signOutMutation]);

  const value = useMemo<AdminAuthContextValue>(() => {
    const isLoading = session !== null && staff === undefined;
    return {
      sessionToken: session?.sessionToken ?? null,
      staff: staff ?? null,
      isLoading,
      isAuthenticated: !!staff,
      signIn,
      signOut,
    };
  }, [session, staff, signIn, signOut]);

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}
