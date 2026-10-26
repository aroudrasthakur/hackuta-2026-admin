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
import type {
  getParticipantDetails,
  listParticipants,
  promoteParticipantToVolunteer,
  setParticipantPoints,
} from "../../convex/admin/participantsAdmin";
import type {
  getVolunteer,
  listStaffConfigLogs,
  listVolunteerActionLogs,
  listVolunteers,
  restoreVolunteer,
  revokeVolunteer,
  setVolunteerCapabilities,
  setVolunteerEventAccess,
} from "../../convex/admin/volunteers";
import type {
  createEvent,
  listEvents,
  setEventActive,
  updateEvent,
} from "../../convex/admin/events";

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

type ParticipantsAdmin = ApiFromModules<{
  participants: {
    getParticipantDetails: typeof getParticipantDetails;
    listParticipants: typeof listParticipants;
    promoteParticipantToVolunteer: typeof promoteParticipantToVolunteer;
    setParticipantPoints: typeof setParticipantPoints;
  };
}>["participants"];

export type ParticipantRow = FunctionReturnType<ParticipantsAdmin["listParticipants"]>["page"][number];
export type ParticipantDetails = NonNullable<FunctionReturnType<ParticipantsAdmin["getParticipantDetails"]>>;

export const listParticipantsRef = adminModuleRef<
  "query",
  FunctionArgs<ParticipantsAdmin["listParticipants"]>,
  FunctionReturnType<ParticipantsAdmin["listParticipants"]>
>("admin/participantsAdmin:listParticipants");

export const getParticipantDetailsRef = adminModuleRef<
  "query",
  FunctionArgs<ParticipantsAdmin["getParticipantDetails"]>,
  FunctionReturnType<ParticipantsAdmin["getParticipantDetails"]>
>("admin/participantsAdmin:getParticipantDetails");

export const setParticipantPointsRef = adminModuleRef<
  "mutation",
  FunctionArgs<ParticipantsAdmin["setParticipantPoints"]>,
  FunctionReturnType<ParticipantsAdmin["setParticipantPoints"]>
>("admin/participantsAdmin:setParticipantPoints");

export const promoteParticipantToVolunteerRef = adminModuleRef<
  "mutation",
  FunctionArgs<ParticipantsAdmin["promoteParticipantToVolunteer"]>,
  FunctionReturnType<ParticipantsAdmin["promoteParticipantToVolunteer"]>
>("admin/participantsAdmin:promoteParticipantToVolunteer");

type VolunteerManagement = ApiFromModules<{
  volunteers: {
    getVolunteer: typeof getVolunteer;
    listStaffConfigLogs: typeof listStaffConfigLogs;
    listVolunteerActionLogs: typeof listVolunteerActionLogs;
    listVolunteers: typeof listVolunteers;
    revokeVolunteer: typeof revokeVolunteer;
    restoreVolunteer: typeof restoreVolunteer;
    setVolunteerCapabilities: typeof setVolunteerCapabilities;
    setVolunteerEventAccess: typeof setVolunteerEventAccess;
  };
}>["volunteers"];

export type VolunteerRow = FunctionReturnType<VolunteerManagement["listVolunteers"]>["page"][number];
export type VolunteerActionLogRow = FunctionReturnType<VolunteerManagement["listVolunteerActionLogs"]>["page"][number];
export type StaffConfigLogRow = FunctionReturnType<VolunteerManagement["listStaffConfigLogs"]>["page"][number];

export const listVolunteersRef = adminModuleRef<
  "query",
  FunctionArgs<VolunteerManagement["listVolunteers"]>,
  FunctionReturnType<VolunteerManagement["listVolunteers"]>
>("admin/volunteers:listVolunteers");

export const getVolunteerRef = adminModuleRef<
  "query",
  FunctionArgs<VolunteerManagement["getVolunteer"]>,
  FunctionReturnType<VolunteerManagement["getVolunteer"]>
>("admin/volunteers:getVolunteer");

export const listVolunteerActionLogsRef = adminModuleRef<
  "query",
  FunctionArgs<VolunteerManagement["listVolunteerActionLogs"]>,
  FunctionReturnType<VolunteerManagement["listVolunteerActionLogs"]>
>("admin/volunteers:listVolunteerActionLogs");

export const listStaffConfigLogsRef = adminModuleRef<
  "query",
  FunctionArgs<VolunteerManagement["listStaffConfigLogs"]>,
  FunctionReturnType<VolunteerManagement["listStaffConfigLogs"]>
>("admin/volunteers:listStaffConfigLogs");

export const setVolunteerCapabilitiesRef = adminModuleRef<
  "mutation",
  FunctionArgs<VolunteerManagement["setVolunteerCapabilities"]>,
  FunctionReturnType<VolunteerManagement["setVolunteerCapabilities"]>
>("admin/volunteers:setVolunteerCapabilities");

export const setVolunteerEventAccessRef = adminModuleRef<
  "mutation",
  FunctionArgs<VolunteerManagement["setVolunteerEventAccess"]>,
  FunctionReturnType<VolunteerManagement["setVolunteerEventAccess"]>
>("admin/volunteers:setVolunteerEventAccess");

type EventManagement = ApiFromModules<{
  events: {
    createEvent: typeof createEvent;
    listEvents: typeof listEvents;
    setEventActive: typeof setEventActive;
    updateEvent: typeof updateEvent;
  };
}>["events"];

export type AdminEventRow = FunctionReturnType<EventManagement["listEvents"]>[number];

export const listEventsRef = adminModuleRef<
  "query",
  FunctionArgs<EventManagement["listEvents"]>,
  FunctionReturnType<EventManagement["listEvents"]>
>("admin/events:listEvents");

export const createEventRef = adminModuleRef<
  "mutation",
  FunctionArgs<EventManagement["createEvent"]>,
  FunctionReturnType<EventManagement["createEvent"]>
>("admin/events:createEvent");

export const updateEventRef = adminModuleRef<
  "mutation",
  FunctionArgs<EventManagement["updateEvent"]>,
  FunctionReturnType<EventManagement["updateEvent"]>
>("admin/events:updateEvent");

export const setEventActiveRef = adminModuleRef<
  "mutation",
  FunctionArgs<EventManagement["setEventActive"]>,
  FunctionReturnType<EventManagement["setEventActive"]>
>("admin/events:setEventActive");

export const revokeVolunteerRef = adminModuleRef<
  "mutation",
  FunctionArgs<VolunteerManagement["revokeVolunteer"]>,
  FunctionReturnType<VolunteerManagement["revokeVolunteer"]>
>("admin/volunteers:revokeVolunteer");

export const restoreVolunteerRef = adminModuleRef<
  "mutation",
  FunctionArgs<VolunteerManagement["restoreVolunteer"]>,
  FunctionReturnType<VolunteerManagement["restoreVolunteer"]>
>("admin/volunteers:restoreVolunteer");
