import {
  awardEventPointsRef,
  checkInParticipantRef,
  foodCheckInParticipantRef,
  getApplicationRef,
  getCurrentStaffRef,
  getParticipantDetailsRef,
  listMyScanOptionsRef,
  listActiveMealPeriodsRef,
  resolveQrForMealRef,
  redeemMealRef,
  listApplicationReviewLogsRef,
  listDecisionEmailQueueRef,
  listParticipantsRef,
  listSubmittedApplicationsRef,
  logApplicationReviewActionRef,
  releaseDecisionEmailsRef,
  resolveQrForScanRef,
  retryFailedDecisionEmailsRef,
  setApplicationDecisionRef,
  setDecisionEmailHoldRef,
  promoteParticipantToVolunteerRef,
  restoreVolunteerRef,
  revokeVolunteerRef,
  setParticipantPointsRef,
} from "../convex/adminApi";
import { createMealPeriodRef, listMealPeriodsRef, listMealRedemptionsRef, removeMealPeriodRef, setMealPeriodActiveRef, updateMealPeriodRef } from "../convex/mealsApi";

const REF_PATHS: ReadonlyArray<readonly [unknown, string]> = [
  [listActiveMealPeriodsRef, "admin/volunteerScan:listActiveMealPeriods"],
  [resolveQrForMealRef, "admin/volunteerScan:resolveQrForMeal"],
  [redeemMealRef, "admin/volunteerScan:redeemMeal"],
  [listMealPeriodsRef, "admin/meals:listMealPeriods"],
  [listMealRedemptionsRef, "admin/meals:listMealRedemptions"],
  [createMealPeriodRef, "admin/meals:createMealPeriod"],
  [updateMealPeriodRef, "admin/meals:updateMealPeriod"],
  [removeMealPeriodRef, "admin/meals:removeMealPeriod"],
  [setMealPeriodActiveRef, "admin/meals:setMealPeriodActive"],
  [getCurrentStaffRef, "admin/auth:getCurrentStaff"],
  [listMyScanOptionsRef, "admin/volunteerScan:listMyScanOptions"],
  [resolveQrForScanRef, "admin/volunteerScan:resolveQrForScan"],
  [checkInParticipantRef, "admin/volunteerOperations:checkInParticipant"],
  [foodCheckInParticipantRef, "admin/volunteerOperations:foodCheckInParticipant"],
  [awardEventPointsRef, "admin/volunteerOperations:awardEventPoints"],
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
