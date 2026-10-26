import { adminError } from "../errors.ts";
import { validateMeal } from "../mealRules.ts";

type Meal = ReturnType<typeof validateMeal> & {
  _id: string; _creationTime: number; active: boolean; createdBy: string; createdAt: number; updatedAt: number; served: number;
};
const meals = new Map<string, Meal>();
let nextId = 0;

export function resetMockMeals() { meals.clear(); nextId = 0; }

export function mockMealsQuery(path: string, args: Record<string, unknown>) {
  if (path === "admin/meals:listMealPeriods") return [...meals.values()].sort((a, b) => a.startsAt - b.startsAt);
  if (!meals.has(String(args.mealPeriodId))) throw adminError("MEAL_NOT_FOUND");
  return { page: [], isDone: true, continueCursor: "" };
}

export function mockMealsMutation(path: string, args: Record<string, unknown>, adminId: string) {
  const id = String(args.mealPeriodId);
  const previous = meals.get(id);
  if (path !== "admin/meals:createMealPeriod" && !previous) throw adminError("MEAL_NOT_FOUND");
  if (path === "admin/meals:removeMealPeriod") { meals.delete(id); return { ok: true }; }
  const now = Date.now();
  const fields = path === "admin/meals:setMealPeriodActive" ? previous! : validateMeal({
    name: String(args.name), description: String(args.description ?? ""), startsAt: Number(args.startsAt), endsAt: Number(args.endsAt),
  });
  const active = args.active === true;
  if (active && [...meals.values()].some((meal) => meal._id !== id && meal.active && meal.startsAt < fields.endsAt && meal.endsAt > fields.startsAt)) throw adminError("MEAL_OVERLAP");
  if (path === "admin/meals:createMealPeriod") {
    const mealPeriodId = `e2e-meal-${++nextId}`;
    meals.set(mealPeriodId, { ...fields, active, _id: mealPeriodId, _creationTime: now, createdBy: adminId, createdAt: now, updatedAt: now, served: 0 });
    return { mealPeriodId };
  }
  meals.set(id, { ...previous!, ...fields, active, updatedAt: now });
  return { ok: true };
}
