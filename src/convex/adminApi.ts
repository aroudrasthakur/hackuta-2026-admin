import {
  makeFunctionReference,
  type DefaultFunctionArgs,
  type FunctionArgs,
  type ApiFromModules,
  type FunctionReturnType,
} from "convex/server";
import type { getApplication, listSubmittedApplications } from "../../convex/admin/applications";
import type { getCurrentStaff } from "../../convex/admin/auth";
import type {
  listApplicationReviewLogs,
  logApplicationReviewAction,
  setApplicationDecision,
} from "../../convex/admin/applicationReviewLogs";
import type {
  listDecisionEmailQueue,
  retryFailedDecisionEmails,
  setDecisionEmailHold,
} from "../../convex/admin/decisionEmailQueue";
import type { listMyScanOptions, resolveQrForScan } from "../../convex/admin/volunteerScan";
import type {
  awardEventPoints,
  checkInParticipant,
  foodCheckInParticipant,
} from "../../convex/admin/volunteerOperations";

/** Shared wrapper around `makeFunctionReference` for typed admin client refs. */
function adminModuleRef<
  Kind extends "query" | "mutation",
  Args extends DefaultFunctionArgs,
  Returns,
>(path: string) {
  return makeFunctionReference<Kind, Args, Returns>(path);
}

type CurrentStaffQuery = ApiFromModules<{
  auth: { getCurrentStaff: typeof getCurrentStaff };
}>["auth"]["getCurrentStaff"];

export const getCurrentStaffRef = makeFunctionReference<
  "query", FunctionArgs<CurrentStaffQuery>, FunctionReturnType<CurrentStaffQuery>
>("admin/auth:getCurrentStaff");

type SubmittedApplicationsQuery = ApiFromModules<{
  applications: { listSubmittedApplications: typeof listSubmittedApplications };
}>["applications"]["listSubmittedApplications"];
export type SubmittedApplicationSummary = FunctionReturnType<SubmittedApplicationsQuery>[number];

export const listSubmittedApplicationsRef = adminModuleRef<
  "query",
  FunctionArgs<SubmittedApplicationsQuery>,
  FunctionReturnType<SubmittedApplicationsQuery>
>("admin/applications:listSubmittedApplications");

type ApplicationQuery = ApiFromModules<{
  applications: { getApplication: typeof getApplication };
}>["applications"]["getApplication"];
export type ApplicationDetail = NonNullable<FunctionReturnType<ApplicationQuery>>;

export const getApplicationRef = adminModuleRef<
  "query",
  FunctionArgs<ApplicationQuery>,
  FunctionReturnType<ApplicationQuery>
>("admin/applications:getApplication");

type ReviewHistoryQuery = ApiFromModules<{
  logs: { listApplicationReviewLogs: typeof listApplicationReviewLogs };
}>["logs"]["listApplicationReviewLogs"];
export type ReviewHistoryEvent = FunctionReturnType<ReviewHistoryQuery>["page"][number];

export const listApplicationReviewLogsRef = adminModuleRef<
  "query",
  FunctionArgs<ReviewHistoryQuery>,
  FunctionReturnType<ReviewHistoryQuery>
>("admin/applicationReviewLogs:listApplicationReviewLogs");

type ReviewActivityMutation = ApiFromModules<{
  logs: { logApplicationReviewAction: typeof logApplicationReviewAction };
}>["logs"]["logApplicationReviewAction"];

export const logApplicationReviewActionRef = adminModuleRef<
  "mutation",
  FunctionArgs<ReviewActivityMutation>,
  FunctionReturnType<ReviewActivityMutation>
>("admin/applicationReviewLogs:logApplicationReviewAction");

type SetApplicationDecisionMutation = ApiFromModules<{
  logs: { setApplicationDecision: typeof setApplicationDecision };
}>["logs"]["setApplicationDecision"];

export const setApplicationDecisionRef = adminModuleRef<
  "mutation",
  FunctionArgs<SetApplicationDecisionMutation>,
  FunctionReturnType<SetApplicationDecisionMutation>
>("admin/applicationReviewLogs:setApplicationDecision");

type DecisionEmailQueueQuery = ApiFromModules<{
  queue: { listDecisionEmailQueue: typeof listDecisionEmailQueue };
}>["queue"]["listDecisionEmailQueue"];
export type DecisionEmailQueue = FunctionReturnType<DecisionEmailQueueQuery>;

export const listDecisionEmailQueueRef = adminModuleRef<
  "query",
  FunctionArgs<DecisionEmailQueueQuery>,
  FunctionReturnType<DecisionEmailQueueQuery>
>("admin/decisionEmailQueue:listDecisionEmailQueue");

type HoldDecisionEmailMutation = ApiFromModules<{
  queue: { setDecisionEmailHold: typeof setDecisionEmailHold };
}>["queue"]["setDecisionEmailHold"];

export const setDecisionEmailHoldRef = adminModuleRef<
  "mutation",
  FunctionArgs<HoldDecisionEmailMutation>,
  FunctionReturnType<HoldDecisionEmailMutation>
>("admin/decisionEmailQueue:setDecisionEmailHold");

type RetryDecisionEmailsMutation = ApiFromModules<{
  queue: { retryFailedDecisionEmails: typeof retryFailedDecisionEmails };
}>["queue"]["retryFailedDecisionEmails"];

export const retryFailedDecisionEmailsRef = adminModuleRef<
  "mutation",
  FunctionArgs<RetryDecisionEmailsMutation>,
  FunctionReturnType<RetryDecisionEmailsMutation>
>("admin/decisionEmailQueue:retryFailedDecisionEmails");

export const releaseDecisionEmailsRef = makeFunctionReference<
  "action",
  { sessionToken: string; itemIds?: Array<DecisionEmailQueue["active"][number]["itemId"]> },
  { sent: number; failed: number; total: number }
>("admin/decisionEmailRelease:releaseDecisionEmails");

type ScanOptionsQuery = ApiFromModules<{
  scan: { listMyScanOptions: typeof listMyScanOptions };
}>["scan"]["listMyScanOptions"];
export type VolunteerScanOptions = FunctionReturnType<ScanOptionsQuery>;

export const listMyScanOptionsRef = adminModuleRef<
  "query",
  FunctionArgs<ScanOptionsQuery>,
  FunctionReturnType<ScanOptionsQuery>
>("admin/volunteerScan:listMyScanOptions");

type ResolveQrMutation = ApiFromModules<{
  scan: { resolveQrForScan: typeof resolveQrForScan };
}>["scan"]["resolveQrForScan"];
export type QrScanPreview = FunctionReturnType<ResolveQrMutation>;

export const resolveQrForScanRef = adminModuleRef<
  "mutation",
  FunctionArgs<ResolveQrMutation>,
  FunctionReturnType<ResolveQrMutation>
>("admin/volunteerScan:resolveQrForScan");

type VolunteerOperations = ApiFromModules<{
  ops: {
    checkInParticipant: typeof checkInParticipant;
    foodCheckInParticipant: typeof foodCheckInParticipant;
    awardEventPoints: typeof awardEventPoints;
  };
}>["ops"];
export type CheckInResult = FunctionReturnType<VolunteerOperations["checkInParticipant"]>;
export type FoodCheckInResult = FunctionReturnType<VolunteerOperations["foodCheckInParticipant"]>;
export type AwardEventPointsResult = FunctionReturnType<VolunteerOperations["awardEventPoints"]>;

export const checkInParticipantRef = adminModuleRef<
  "mutation",
  FunctionArgs<VolunteerOperations["checkInParticipant"]>,
  CheckInResult
>("admin/volunteerOperations:checkInParticipant");

export const foodCheckInParticipantRef = adminModuleRef<
  "mutation",
  FunctionArgs<VolunteerOperations["foodCheckInParticipant"]>,
  FoodCheckInResult
>("admin/volunteerOperations:foodCheckInParticipant");

export const awardEventPointsRef = adminModuleRef<
  "mutation",
  FunctionArgs<VolunteerOperations["awardEventPoints"]>,
  AwardEventPointsResult
>("admin/volunteerOperations:awardEventPoints");
