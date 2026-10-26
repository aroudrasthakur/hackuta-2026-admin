import type { GenericId } from "convex/values";
import type { ConvexTestInstance } from "./convexTestContext";

export function seedMealPeriod(t: ConvexTestInstance, createdBy: GenericId<"admins">, fields: Partial<{
  name: string; startsAt: number; endsAt: number; active: boolean;
}> = {}) {
  const now = Date.now();
  return t.run((ctx) => ctx.db.insert("mealPeriods", {
    name: "Lunch", startsAt: now - 60_000, endsAt: now + 60_000,
    active: true, createdBy, servedCount: 0, createdAt: now, updatedAt: now, ...fields,
  }));
}
