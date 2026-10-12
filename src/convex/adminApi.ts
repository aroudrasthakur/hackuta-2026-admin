import {
  makeFunctionReference,
  type FunctionArgs,
  type ApiFromModules,
  type FunctionReturnType,
} from "convex/server";
import type { getApplication } from "../../convex/admin/applications";
import type { logApplicationReviewAction } from "../../convex/admin/applicationReviewLogs";

export const getCurrentStaffRef = makeFunctionReference<"query">("admin/auth:getCurrentStaff");

type ApplicationQuery = ApiFromModules<{
  applications: { getApplication: typeof getApplication };
}>["applications"]["getApplication"];
export type ApplicationDetail = NonNullable<FunctionReturnType<ApplicationQuery>>;

export const getApplicationRef = makeFunctionReference<
  "query",
  FunctionArgs<ApplicationQuery>,
  FunctionReturnType<ApplicationQuery>
>("admin/applications:getApplication");

type ReviewActivityMutation = ApiFromModules<{
  logs: { logApplicationReviewAction: typeof logApplicationReviewAction };
}>["logs"]["logApplicationReviewAction"];

export const logApplicationReviewActionRef = makeFunctionReference<
  "mutation",
  FunctionArgs<ReviewActivityMutation>,
  FunctionReturnType<ReviewActivityMutation>
>("admin/applicationReviewLogs:logApplicationReviewAction");
