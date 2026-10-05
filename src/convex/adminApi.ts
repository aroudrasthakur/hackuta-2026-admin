import { makeFunctionReference } from "convex/server";

export const getCurrentStaffRef = makeFunctionReference<"query">("admin/auth:getCurrentStaff");
