import { makeFunctionReference } from "convex/server";

export const adminSignInRef = makeFunctionReference<"mutation">("admin/auth:signIn");
export const adminSignOutRef = makeFunctionReference<"mutation">("admin/auth:signOut");
export const getCurrentStaffRef = makeFunctionReference<"query">("admin/auth:getCurrentStaff");
