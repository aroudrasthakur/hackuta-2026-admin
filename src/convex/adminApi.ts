import {
  makeFunctionReference,
  type FunctionArgs,
  type FunctionReferenceFromExport,
  type FunctionReturnType,
} from "convex/server";
import type { getApplication } from "../../convex/admin/applications";

export const getCurrentStaffRef = makeFunctionReference<"query">("admin/auth:getCurrentStaff");

type ApplicationQuery = FunctionReferenceFromExport<typeof getApplication>;
export type ApplicationDetail = NonNullable<FunctionReturnType<ApplicationQuery>>;

export const getApplicationRef = makeFunctionReference<
  "query",
  FunctionArgs<ApplicationQuery>,
  FunctionReturnType<ApplicationQuery>
>("admin/applications:getApplication");
