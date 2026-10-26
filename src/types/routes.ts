export const ADMIN_ROUTES = {
  login: "/admin/login",
  volunteer: "/volunteer",
  scan: "/admin/scan",
  scanCheckIn: "/admin/scan/check-in",
  scanFood: "/admin/scan/food",
  scanPoints: "/admin/scan/points",
  participants: "/admin/participants",
  volunteers: "/admin/volunteers",
  applications: "/admin/applications",
  decisionEmails: "/admin/decision-emails",
  applicationReview: (applicationId: string) =>
    `/admin/applications/${applicationId}`,
} as const;

export type AdminRoutePath = (typeof ADMIN_ROUTES)[keyof Omit<typeof ADMIN_ROUTES, "applicationReview">];
