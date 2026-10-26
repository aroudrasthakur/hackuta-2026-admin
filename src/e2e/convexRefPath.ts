import {
  getApplicationRef,
  getCurrentStaffRef,
  getParticipantDetailsRef,
  listMyScanOptionsRef,
  listApplicationReviewLogsRef,
  listDecisionEmailQueueRef,
  listParticipantsRef,
  listSubmittedApplicationsRef,
  logApplicationReviewActionRef,
  releaseDecisionEmailsRef,
  retryFailedDecisionEmailsRef,
  setApplicationDecisionRef,
  setDecisionEmailHoldRef,
  promoteParticipantToVolunteerRef,
  restoreVolunteerRef,
  revokeVolunteerRef,
  setParticipantPointsRef,
} from "../convex/adminApi";

const REF_PATHS: ReadonlyArray<readonly [unknown, string]> = [
  [getCurrentStaffRef, "admin/auth:getCurrentStaff"],
  [listMyScanOptionsRef, "admin/volunteerScan:listMyScanOptions"],
  [listSubmittedApplicationsRef, "admin/applications:listSubmittedApplications"],
  [getApplicationRef, "admin/applications:getApplication"],
  [listApplicationReviewLogsRef, "admin/applicationReviewLogs:listApplicationReviewLogs"],
  [logApplicationReviewActionRef, "admin/applicationReviewLogs:logApplicationReviewAction"],
  [setApplicationDecisionRef, "admin/applicationReviewLogs:setApplicationDecision"],
  [listDecisionEmailQueueRef, "admin/decisionEmailQueue:listDecisionEmailQueue"],
  [setDecisionEmailHoldRef, "admin/decisionEmailQueue:setDecisionEmailHold"],
  [retryFailedDecisionEmailsRef, "admin/decisionEmailQueue:retryFailedDecisionEmails"],
  [releaseDecisionEmailsRef, "admin/decisionEmailRelease:releaseDecisionEmails"],
  [listParticipantsRef, "admin/participantsAdmin:listParticipants"],
  [getParticipantDetailsRef, "admin/participantsAdmin:getParticipantDetails"],
  [setParticipantPointsRef, "admin/participantsAdmin:setParticipantPoints"],
  [promoteParticipantToVolunteerRef, "admin/participantsAdmin:promoteParticipantToVolunteer"],
  [revokeVolunteerRef, "admin/volunteers:revokeVolunteer"],
  [restoreVolunteerRef, "admin/volunteers:restoreVolunteer"],
];

export function convexRefPath(ref: unknown): string {
  for (const [knownRef, path] of REF_PATHS) {
    if (Object.is(knownRef, ref)) {
      return path;
    }
  }
  throw new Error("Unknown Convex function reference in E2E mock mode.");
}
