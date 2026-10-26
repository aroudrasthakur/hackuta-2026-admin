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
