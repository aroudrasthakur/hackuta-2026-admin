import {
  makeFunctionReference,
  type FunctionArgs,
  type ApiFromModules,
  type FunctionReturnType,
} from "convex/server";
import type { getApplication, listSubmittedApplications } from "../../convex/admin/applications";
import type {
  listApplicationReviewLogs,
  logApplicationReviewAction,
} from "../../convex/admin/applicationReviewLogs";

export const getCurrentStaffRef = makeFunctionReference<"query">("admin/auth:getCurrentStaff");

type SubmittedApplicationsQuery = ApiFromModules<{
  applications: { listSubmittedApplications: typeof listSubmittedApplications };
}>["applications"]["listSubmittedApplications"];
export type SubmittedApplicationSummary = FunctionReturnType<SubmittedApplicationsQuery>[number];

export const listSubmittedApplicationsRef = makeFunctionReference<
  "query",
  FunctionArgs<SubmittedApplicationsQuery>,
  FunctionReturnType<SubmittedApplicationsQuery>
>("admin/applications:listSubmittedApplications");

type ApplicationQuery = ApiFromModules<{
  applications: { getApplication: typeof getApplication };
}>["applications"]["getApplication"];
export type ApplicationDetail = NonNullable<FunctionReturnType<ApplicationQuery>>;

export const getApplicationRef = makeFunctionReference<
  "query",
  FunctionArgs<ApplicationQuery>,
  FunctionReturnType<ApplicationQuery>
>("admin/applications:getApplication");

type ReviewHistoryQuery = ApiFromModules<{
  logs: { listApplicationReviewLogs: typeof listApplicationReviewLogs };
}>["logs"]["listApplicationReviewLogs"];
export type ReviewHistoryEvent = FunctionReturnType<ReviewHistoryQuery>["page"][number];

export const listApplicationReviewLogsRef = makeFunctionReference<
  "query",
  FunctionArgs<ReviewHistoryQuery>,
  FunctionReturnType<ReviewHistoryQuery>
>("admin/applicationReviewLogs:listApplicationReviewLogs");

type ReviewActivityMutation = ApiFromModules<{
  logs: { logApplicationReviewAction: typeof logApplicationReviewAction };
}>["logs"]["logApplicationReviewAction"];

export const logApplicationReviewActionRef = makeFunctionReference<
  "mutation",
  FunctionArgs<ReviewActivityMutation>,
  FunctionReturnType<ReviewActivityMutation>
>("admin/applicationReviewLogs:logApplicationReviewAction");
