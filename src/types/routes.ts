export const ADMIN_ROUTES = {
  login: "/admin/login",
  volunteer: "/volunteer",
  scan: "/admin/scan",
  scanCheckIn: "/admin/scan/check-in",
  scanFood: "/admin/scan/food",
  scanPoints: "/admin/scan/points",
  scanShop: "/admin/scan/shop",
  participants: "/admin/participants",
  volunteers: "/admin/volunteers",
  events: "/admin/events",
  meals: "/admin/meals",
  applications: "/admin/applications",
  decisionEmails: "/admin/decision-emails",
  shop: "/admin/shop",
  notifications: "/admin/notifications",
  applicationReview: (applicationId: string) =>
    `/admin/applications/${applicationId}`,
  volunteerDetail: (volunteerAdminId: string) =>
    `/admin/volunteers/${volunteerAdminId}`,
} as const;

export type AdminRoutePath = (typeof ADMIN_ROUTES)[keyof Omit<typeof ADMIN_ROUTES, "applicationReview" | "volunteerDetail">];
