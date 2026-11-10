import type { Page } from "@playwright/test";

export async function setMailConfig(
  page: Page,
  next: { confirmationEmail?: boolean; decisionEmail?: boolean },
) {
  await page.evaluate((value) => {
    const fixtureWindow = window as Window & {
      __setE2eMailConfig?: (next: { confirmationEmail?: boolean; decisionEmail?: boolean }) => void;
    };
    if (!fixtureWindow.__setE2eMailConfig) throw new Error("E2E mail config fixture is not enabled");
    fixtureWindow.__setE2eMailConfig(value);
  }, next);
}
