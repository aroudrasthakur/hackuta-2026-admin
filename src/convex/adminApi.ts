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
import type { listMyScanOptions, resolveQrForScan, listActiveMealPeriods, resolveQrForMeal, redeemMeal } from "../../convex/admin/volunteerScan";
import type {
  awardEventPoints,
  checkInParticipant,
  foodCheckInParticipant,
} from "../../convex/admin/volunteerOperations";
import type {
  createEvent,
  getEvent,
  listEvents,
  setEventActive,
  setEventPoints,
  updateEvent,
} from "../../convex/admin/events";
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
import type * as shopAdmin from "../../convex/admin/shopAdmin";
import type * as shopFlashSales from "../../convex/admin/shopFlashSales";
import type * as shopRedemption from "../../convex/admin/shopRedemption";

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

type MealScanApi = ApiFromModules<{
  scan: {
    listActiveMealPeriods: typeof listActiveMealPeriods;
    resolveQrForMeal: typeof resolveQrForMeal;
    redeemMeal: typeof redeemMeal;
  };
}>["scan"];
export type VolunteerMealPeriod = FunctionReturnType<MealScanApi["listActiveMealPeriods"]>[number];
export type MealRedemptionResult = FunctionReturnType<MealScanApi["redeemMeal"]>;
export const listActiveMealPeriodsRef = adminModuleRef<
  "query", FunctionArgs<MealScanApi["listActiveMealPeriods"]>, FunctionReturnType<MealScanApi["listActiveMealPeriods"]>
>("admin/volunteerScan:listActiveMealPeriods");
export const resolveQrForMealRef = adminModuleRef<
  "mutation", FunctionArgs<MealScanApi["resolveQrForMeal"]>, FunctionReturnType<MealScanApi["resolveQrForMeal"]>
>("admin/volunteerScan:resolveQrForMeal");
export const redeemMealRef = adminModuleRef<
  "mutation", FunctionArgs<MealScanApi["redeemMeal"]>, MealRedemptionResult
>("admin/volunteerScan:redeemMeal");

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

type ShopAdmin = ApiFromModules<{ shop: typeof shopAdmin }>["shop"];
export type ShopItemAdminList = FunctionReturnType<ShopAdmin["listShopItemsAdmin"]>;
export type ShopItemAdminRow = ShopItemAdminList["items"][number];
export type ShopInventoryAdjustmentPage = FunctionReturnType<ShopAdmin["listInventoryAdjustments"]>;
export type ShopRedemptionPage = FunctionReturnType<ShopAdmin["listShopRedemptions"]>;
export type ShopRedemptionRow = ShopRedemptionPage["page"][number];
export type ShopVolunteerRow = FunctionReturnType<ShopAdmin["listShopVolunteers"]>[number];

function shopAdminRef<Name extends keyof ShopAdmin>(name: Name) {
  return adminModuleRef<
    ShopAdmin[Name]["_type"],
    FunctionArgs<ShopAdmin[Name]>,
    FunctionReturnType<ShopAdmin[Name]>
  >(`admin/shopAdmin:${name}`);
}

export const generateShopImageUploadUrlRef = shopAdminRef("generateShopImageUploadUrl");
export const createShopItemRef = shopAdminRef("createShopItem");
export const updateShopItemRef = shopAdminRef("updateShopItem");
export const setShopItemStatusRef = shopAdminRef("setShopItemStatus");
export const adjustShopStockRef = shopAdminRef("adjustShopStock");
export const listShopItemsAdminRef = shopAdminRef("listShopItemsAdmin");
export const listInventoryAdjustmentsRef = shopAdminRef("listInventoryAdjustments");
export const listShopRedemptionsRef = shopAdminRef("listShopRedemptions");
export const refundShopRedemptionRef = shopAdminRef("refundShopRedemption");
export const listShopVolunteersRef = shopAdminRef("listShopVolunteers");
export const setVolunteerShopAccessRef = shopAdminRef("setVolunteerShopAccess");

type ShopFlashSales = ApiFromModules<{ sales: typeof shopFlashSales }>["sales"];
export type FlashSaleRow = FunctionReturnType<ShopFlashSales["listFlashSales"]>[number];

function flashSaleRef<Name extends keyof ShopFlashSales>(name: Name) {
  return adminModuleRef<
    ShopFlashSales[Name]["_type"],
    FunctionArgs<ShopFlashSales[Name]>,
    FunctionReturnType<ShopFlashSales[Name]>
  >(`admin/shopFlashSales:${name}`);
}

export const createFlashSaleRef = flashSaleRef("createFlashSale");
export const updateFlashSaleRef = flashSaleRef("updateFlashSale");
export const cancelFlashSaleRef = flashSaleRef("cancelFlashSale");
export const listFlashSalesRef = flashSaleRef("listFlashSales");

type ShopRedemption = ApiFromModules<{ redeem: typeof shopRedemption }>["redeem"];
export type ShopCatalog = FunctionReturnType<ShopRedemption["listShopCatalogForVolunteer"]>;
export type ShopCatalogItem = ShopCatalog["items"][number];
export type ShopCustomer = FunctionReturnType<ShopRedemption["getShopCustomer"]>;
export type ShopPurchasePreview = FunctionReturnType<ShopRedemption["previewShopPurchase"]>;
export type ShopPurchaseResult = FunctionReturnType<ShopRedemption["purchaseShopItem"]>;

function shopRedemptionRef<Name extends keyof ShopRedemption>(name: Name) {
  return adminModuleRef<
    ShopRedemption[Name]["_type"],
    FunctionArgs<ShopRedemption[Name]>,
    FunctionReturnType<ShopRedemption[Name]>
  >(`admin/shopRedemption:${name}`);
}

export const listShopCatalogForVolunteerRef = shopRedemptionRef("listShopCatalogForVolunteer");
export const getShopCustomerRef = shopRedemptionRef("getShopCustomer");
export const previewShopPurchaseRef = shopRedemptionRef("previewShopPurchase");
export const purchaseShopItemRef = shopRedemptionRef("purchaseShopItem");

type EventAdmin = ApiFromModules<{
  events: {
    listEvents: typeof listEvents;
    getEvent: typeof getEvent;
    createEvent: typeof createEvent;
    updateEvent: typeof updateEvent;
    setEventActive: typeof setEventActive;
    setEventPoints: typeof setEventPoints;
  };
}>["events"];

export type AdminEventRow = FunctionReturnType<EventAdmin["listEvents"]>["page"][number];

export const listEventsRef = adminModuleRef<
  "query",
  FunctionArgs<EventAdmin["listEvents"]>,
  FunctionReturnType<EventAdmin["listEvents"]>
>("admin/events:listEvents");

export const getEventRef = adminModuleRef<
  "query",
  FunctionArgs<EventAdmin["getEvent"]>,
  FunctionReturnType<EventAdmin["getEvent"]>
>("admin/events:getEvent");

export const createEventRef = adminModuleRef<
  "mutation",
  FunctionArgs<EventAdmin["createEvent"]>,
  FunctionReturnType<EventAdmin["createEvent"]>
>("admin/events:createEvent");

export const updateEventRef = adminModuleRef<
  "mutation",
  FunctionArgs<EventAdmin["updateEvent"]>,
  FunctionReturnType<EventAdmin["updateEvent"]>
>("admin/events:updateEvent");

export const setEventActiveRef = adminModuleRef<
  "mutation",
  FunctionArgs<EventAdmin["setEventActive"]>,
  FunctionReturnType<EventAdmin["setEventActive"]>
>("admin/events:setEventActive");

export const setEventPointsRef = adminModuleRef<
  "mutation",
  FunctionArgs<EventAdmin["setEventPoints"]>,
  FunctionReturnType<EventAdmin["setEventPoints"]>
>("admin/events:setEventPoints");

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
