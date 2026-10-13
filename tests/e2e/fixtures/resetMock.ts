import type { Page } from "@playwright/test";

export async function resetE2eMockBackend(page: Page) {
  await page.goto("/admin/login");
  await page.evaluate(() => {
    (window as Window & { __resetE2eMock?: () => void }).__resetE2eMock?.();
  });
}
