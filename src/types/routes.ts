export const ADMIN_ROUTES = {
  login: "/admin/login",
  dashboard: "/admin",
  applications: "/admin/applications",
  applicationReview: (applicationId: string) =>
    `/admin/applications/${applicationId}`,
  participants: "/admin/participants",
  checkIn: "/admin/check-in",
} as const;

export type AdminRoutePath =
  (typeof ADMIN_ROUTES)[keyof Omit<typeof ADMIN_ROUTES, "applicationReview">];
