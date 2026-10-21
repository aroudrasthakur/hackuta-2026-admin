export const ADMIN_ROUTES = {
  login: "/admin/login",
  applications: "/admin/applications",
  decisionEmails: "/admin/decision-emails",
  applicationReview: (applicationId: string) =>
    `/admin/applications/${applicationId}`,
} as const;

export type AdminRoutePath = (typeof ADMIN_ROUTES)[keyof Omit<typeof ADMIN_ROUTES, "applicationReview">];
