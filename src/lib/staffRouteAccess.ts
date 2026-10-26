import type { StaffProfile } from "../contexts/adminAuthContext";
import type { VolunteerScanOptions } from "../convex/adminApi";
import { ADMIN_ROUTES } from "../types/routes";

export function staffHome(staff: StaffProfile) {
  return staff.role === "volunteer" ? ADMIN_ROUTES.scan : ADMIN_ROUTES.applications;
}

/** Undefined means permissions are still loading; unknown paths are denied. */
export function canAccessStaffRoute(
  pathname: string,
  staff: StaffProfile,
  options: VolunteerScanOptions | undefined,
  search = "",
): boolean | undefined {
  pathname = pathname.replace(/\/+$/, "");
  if (pathname === "/admin") return true;
  if (pathname === ADMIN_ROUTES.participants || pathname === ADMIN_ROUTES.volunteers ||
    pathname === ADMIN_ROUTES.events || pathname === ADMIN_ROUTES.shop ||
    /^\/admin\/volunteers\/[^/]+$/.test(pathname)) {
    return staff.role === "admin";
  }
  if (pathname === ADMIN_ROUTES.applications || pathname === ADMIN_ROUTES.decisionEmails ||
    /^\/admin\/applications\/[^/]+$/.test(pathname)) {
    return staff.role === "admin" || staff.role === "reviewer";
  }
  if (pathname === ADMIN_ROUTES.scan || pathname === ADMIN_ROUTES.volunteer) {
    return staff.role === "volunteer";
  }
  if ([ADMIN_ROUTES.scanCheckIn, ADMIN_ROUTES.scanFood, ADMIN_ROUTES.scanPoints, ADMIN_ROUTES.scanShop].some((path) => path === pathname)) {
    if (staff.role !== "volunteer") return false;
    if (!options) return undefined;
    if (pathname === ADMIN_ROUTES.scanCheckIn) return staff.canCheckIn === true && options.canCheckIn;
    if (pathname === ADMIN_ROUTES.scanFood) return staff.canFoodCheckIn === true && options.canFoodCheckIn;
    if (pathname === ADMIN_ROUTES.scanShop) return staff.canRedeemShop === true && options.canRedeemShop;
    const eventId = new URLSearchParams(search).get("event");
    return options.events.length > 0 && (!eventId || options.events.some((event) => event.eventId === eventId));
  }
  return false;
}

/** Only restore a known internal route authorized for the current account. */
export function intendedStaffDestination(
  state: unknown,
  staff: StaffProfile,
  options: VolunteerScanOptions | undefined,
) {
  const from = (state as { from?: { pathname?: unknown; search?: unknown; hash?: unknown } } | null)?.from;
  if (typeof from?.pathname !== "string" || canAccessStaffRoute(from.pathname, staff, options, typeof from.search === "string" ? from.search : "") !== true) {
    return staffHome(staff);
  }
  const search = typeof from.search === "string" && from.search.startsWith("?") ? from.search : "";
  const hash = typeof from.hash === "string" && from.hash.startsWith("#") ? from.hash : "";
  return `${from.pathname}${search}${hash}`;
}
