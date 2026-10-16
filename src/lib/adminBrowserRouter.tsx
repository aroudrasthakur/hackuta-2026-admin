import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";

type AdminBrowserRouterProps = {
  children: ReactNode;
};

/**
 * App shell router. Queue filters use URL search params; we rely on synchronous
 * navigation updates (no experimental router transition flags).
 */
export function AdminBrowserRouter({ children }: AdminBrowserRouterProps) {
  return <BrowserRouter>{children}</BrowserRouter>;
}
