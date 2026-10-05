import { useContext } from "react";
import { AdminAuthContext } from "../contexts/adminAuthContext";

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}
