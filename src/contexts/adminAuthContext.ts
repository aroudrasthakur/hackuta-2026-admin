import { createContext } from "react";

export type StaffProfile = {
  adminId: string;
  email: string;
  name: string;
  role: "reviewer" | "admin";
  expiresAt: number;
};

export type AdminAuthContextValue = {
  sessionToken: string | null;
  staff: StaffProfile | null | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);
