import { useEffect, useState } from "react";
import type { VolunteerMealPeriod } from "../convex/adminApi";

/** Wake at serving boundaries even when no Convex document changes. */
export function useMealClock(meals: readonly VolunteerMealPeriod[] | undefined) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const next = meals?.flatMap((meal) => [meal.startsAt, meal.endsAt])
      .filter((time) => time > now).reduce((soonest, time) => Math.min(soonest, time), now + 15_000) ?? now + 15_000;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1, Math.min(15_000, next - Date.now())));
    return () => window.clearTimeout(timer);
  }, [meals, now]);
  return now;
}
