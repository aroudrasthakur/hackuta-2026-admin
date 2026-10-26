import type { Page, TestInfo } from "@playwright/test";

/**
 * Full-page captures for local visual review. CI skips them: the storm UI makes
 * each capture expensive, and they are not assertions.
 */
export async function reviewScreenshot(page: Page, file: string, testInfo?: TestInfo) {
  if (process.env.CI) return;
  await page.screenshot({ path: testInfo ? testInfo.outputPath(file) : file, fullPage: true });
}
