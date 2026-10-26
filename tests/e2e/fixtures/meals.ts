import type { Page } from "@playwright/test";
import type { MockMealScenario } from "../../../shared/admin/e2e/mockMeals";

export async function setMealScenario(page: Page, scenario: MockMealScenario) {
  await page.evaluate((value) => {
    const fixtureWindow = window as Window & { __setE2eMeals?: (next: MockMealScenario) => void };
    if (!fixtureWindow.__setE2eMeals) throw new Error("E2E meal fixture is not enabled");
    fixtureWindow.__setE2eMeals(value);
  }, scenario);
}
