import type { Page } from "@playwright/test";
import type { DecisionQueueScenario } from "../../../shared/admin/e2e/mockAdminStore";

export async function setDecisionQueue(page: Page, scenario: DecisionQueueScenario) {
  await page.evaluate((nextScenario) => {
    const fixtureWindow = window as Window & { __setE2eDecisionQueue?: (value: DecisionQueueScenario) => void };
    if (!fixtureWindow.__setE2eDecisionQueue) throw new Error("E2E decision queue fixture is not enabled");
    fixtureWindow.__setE2eDecisionQueue(nextScenario);
  }, scenario);
}
