import { makeFunctionReference, type ApiFromModules, type FunctionArgs, type FunctionReturnType } from "convex/server";
import type * as meals from "../../convex/admin/meals";

type MealsApi = ApiFromModules<{ meals: typeof meals }>["meals"];
function queryRef<K extends "listMealPeriods" | "listMealRedemptions">(name: K) {
  return makeFunctionReference<"query", FunctionArgs<MealsApi[K]>, FunctionReturnType<MealsApi[K]>>(`admin/meals:${name}`);
}
function mutationRef<K extends "createMealPeriod" | "updateMealPeriod" | "setMealPeriodActive" | "removeMealPeriod">(name: K) {
  return makeFunctionReference<"mutation", FunctionArgs<MealsApi[K]>, FunctionReturnType<MealsApi[K]>>(`admin/meals:${name}`);
}
export const listMealPeriodsRef = queryRef("listMealPeriods");
export const listMealRedemptionsRef = queryRef("listMealRedemptions");
export const createMealPeriodRef = mutationRef("createMealPeriod");
export const updateMealPeriodRef = mutationRef("updateMealPeriod");
export const setMealPeriodActiveRef = mutationRef("setMealPeriodActive");
export const removeMealPeriodRef = mutationRef("removeMealPeriod");
export type AdminMeal = FunctionReturnType<MealsApi["listMealPeriods"]>[number];
