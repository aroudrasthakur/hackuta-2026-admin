import {
  getApplicationRef,
  getCurrentStaffRef,
  listApplicationReviewLogsRef,
  listSubmittedApplicationsRef,
  logApplicationReviewActionRef,
  setApplicationDecisionRef,
  retryDecisionNotificationRef,
  checkDecisionNotificationRef,
} from "../convex/adminApi";

const REF_PATHS: ReadonlyArray<readonly [unknown, string]> = [
  [getCurrentStaffRef, "admin/auth:getCurrentStaff"],
  [listSubmittedApplicationsRef, "admin/applications:listSubmittedApplications"],
  [getApplicationRef, "admin/applications:getApplication"],
  [listApplicationReviewLogsRef, "admin/applicationReviewLogs:listApplicationReviewLogs"],
  [logApplicationReviewActionRef, "admin/applicationReviewLogs:logApplicationReviewAction"],
  [setApplicationDecisionRef, "admin/applicationReviewLogs:setApplicationDecision"],
  [retryDecisionNotificationRef, "admin/decisionNotifications:retryDecisionNotification"],
  [checkDecisionNotificationRef, "admin/notificationActions:checkDecisionNotification"],
];

export function convexRefPath(ref: unknown): string {
  for (const [knownRef, path] of REF_PATHS) {
    if (Object.is(knownRef, ref)) {
      return path;
    }
  }
  throw new Error("Unknown Convex function reference in E2E mock mode.");
}
